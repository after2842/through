package httpapi

import (
	"bytes"
	"encoding/json"
	"errors"
	"fmt"
	"io"
	"net/http"
	"net/url"
	"regexp"
	"strings"

	"through/backend/internal/core"
)

// A stateless MCP server over Streamable HTTP. Every request is one JSON-RPC
// message answered with application/json; no server-initiated streams or
// sessions are used. Access requires an OAuth access token from an agent
// connection, and the agent identity comes from that connection's grant.

var mcpVersions = []string{"2025-11-25", "2025-06-18", "2025-03-26"}

const mcpInstructions = "through lets this agent request sign-in to websites with accounts the user connected and allowed for this agent. When the browser reaches a login page, call check_sign_in_access with the page's HTTPS origin, then request_sign_in if it is allowed. Never ask the user to type a password, code, or recovery key into the conversation. In this preview, sign-in requests are simulated: no credentials are entered, so ask the user to finish signing in themselves."

type rpcRequest struct {
	JSONRPC string          `json:"jsonrpc"`
	ID      json.RawMessage `json:"id"`
	Method  string          `json:"method"`
	Params  json.RawMessage `json:"params"`
}

type rpcError struct {
	Code    int    `json:"code"`
	Message string `json:"message"`
}

type mcpCall struct {
	principal *core.Principal
	agent     string
}

func (s *Server) mcpUnauthorized(w http.ResponseWriter, presented bool) {
	value := `Bearer resource_metadata="` + s.cfg.PublicOrigin + `/.well-known/oauth-protected-resource/mcp", scope="` + core.OAuthScope + `"`
	if presented {
		value += `, error="invalid_token"`
	}
	w.Header().Set("WWW-Authenticate", value)
	s.json(w, 401, map[string]any{"error": "invalid_token", "error_description": "Connect this app to through to continue."})
}

func (s *Server) mcpMethodNotAllowed(w http.ResponseWriter, r *http.Request) {
	w.Header().Set("Allow", "POST")
	s.json(w, 405, map[string]any{"error": map[string]string{"code": "method_not_allowed", "message": "This MCP endpoint accepts POST only."}, "requestId": requestID(r)})
}

func (s *Server) mcp(w http.ResponseWriter, r *http.Request) {
	if origin := r.Header.Get("Origin"); origin != "" && !s.cfg.AllowedOrigins[origin] {
		s.fail(w, r, &core.Error{Code: "origin_denied", Message: "This origin is not allowed.", Status: 403})
		return
	}
	header := r.Header.Get("Authorization")
	if !strings.HasPrefix(header, "Bearer ") {
		s.mcpUnauthorized(w, false)
		return
	}
	p, agent, e := s.store.AuthenticateBearer(r.Context(), strings.TrimPrefix(header, "Bearer "))
	if e != nil {
		if errors.Is(e, core.ErrUnauthorized) {
			s.mcpUnauthorized(w, true)
			return
		}
		s.fail(w, r, e)
		return
	}
	if v := r.Header.Get("MCP-Protocol-Version"); v != "" && !supportedVersion(v) {
		s.json(w, 400, rpcResponse(nil, nil, &rpcError{-32600, "Unsupported MCP-Protocol-Version."}))
		return
	}
	if strings.Split(r.Header.Get("Content-Type"), ";")[0] != "application/json" {
		s.json(w, 415, rpcResponse(nil, nil, &rpcError{-32700, "Send application/json."}))
		return
	}
	body, e := io.ReadAll(http.MaxBytesReader(w, r.Body, 64<<10))
	if e != nil {
		s.json(w, 413, rpcResponse(nil, nil, &rpcError{-32700, "Request too large."}))
		return
	}
	body = bytes.TrimSpace(body)
	if len(body) > 0 && body[0] == '[' {
		s.json(w, 400, rpcResponse(nil, nil, &rpcError{-32600, "Batch requests are not supported."}))
		return
	}
	var req rpcRequest
	if e = json.Unmarshal(body, &req); e != nil || req.JSONRPC != "2.0" || req.Method == "" {
		s.json(w, 400, rpcResponse(nil, nil, &rpcError{-32600, "Send one JSON-RPC 2.0 message."}))
		return
	}
	if len(req.ID) == 0 || string(req.ID) == "null" {
		// Notifications and responses from the client need no reply.
		w.WriteHeader(http.StatusAccepted)
		return
	}
	call := mcpCall{principal: p, agent: agent}
	result, rpcErr := s.dispatch(r, call, req)
	s.json(w, 200, rpcResponse(req.ID, result, rpcErr))
}

func supportedVersion(v string) bool {
	for _, known := range mcpVersions {
		if v == known {
			return true
		}
	}
	return false
}

func rpcResponse(id json.RawMessage, result any, err *rpcError) map[string]any {
	response := map[string]any{"jsonrpc": "2.0", "id": id}
	if id == nil {
		response["id"] = nil
	}
	if err != nil {
		response["error"] = err
	} else {
		response["result"] = result
	}
	return response
}

func (s *Server) dispatch(r *http.Request, call mcpCall, req rpcRequest) (any, *rpcError) {
	switch req.Method {
	case "initialize":
		var params struct {
			ProtocolVersion string `json:"protocolVersion"`
		}
		_ = json.Unmarshal(req.Params, &params)
		version := mcpVersions[0]
		if supportedVersion(params.ProtocolVersion) {
			version = params.ProtocolVersion
		}
		return map[string]any{
			"protocolVersion": version,
			"capabilities":    map[string]any{"tools": map[string]any{"listChanged": false}},
			"serverInfo":      map[string]any{"name": "through", "title": "through", "version": "0.1.0"},
			"instructions":    mcpInstructions,
		}, nil
	case "ping":
		return map[string]any{}, nil
	case "tools/list":
		return map[string]any{"tools": mcpTools}, nil
	case "tools/call":
		var params struct {
			Name      string          `json:"name"`
			Arguments json.RawMessage `json:"arguments"`
		}
		if e := json.Unmarshal(req.Params, &params); e != nil {
			return nil, &rpcError{-32602, "Invalid tools/call parameters."}
		}
		return s.callTool(r, call, params.Name, params.Arguments)
	default:
		return nil, &rpcError{-32601, "Method not found."}
	}
}

// ---- Tools ---------------------------------------------------------------------

func annotations(readOnly, destructive, idempotent, openWorld bool) map[string]bool {
	return map[string]bool{"readOnlyHint": readOnly, "destructiveHint": destructive, "idempotentHint": idempotent, "openWorldHint": openWorld}
}

func object(properties map[string]any, required ...string) map[string]any {
	schema := map[string]any{"type": "object", "properties": properties, "additionalProperties": false}
	if len(required) > 0 {
		schema["required"] = required
	}
	return schema
}

var originProperty = map[string]any{"type": "string", "maxLength": 2048, "description": "The website's HTTPS origin or the login page URL, for example https://github.com/login."}

var mcpTools = []map[string]any{
	{
		"name":        "list_sign_in_accounts",
		"title":       "List sign-in accounts",
		"description": "List the website accounts connected in through, with each account's site, username label, and whether this agent connection may use it. Never returns passwords.",
		"inputSchema": object(map[string]any{}),
		"annotations": annotations(true, false, true, false),
	},
	{
		"name":        "check_sign_in_access",
		"title":       "Check sign-in access",
		"description": "Check whether this agent may sign in to a website with a connected account. Use it when the browser reaches a login page, passing that page's URL or origin.",
		"inputSchema": object(map[string]any{"origin": originProperty}, "origin"),
		"annotations": annotations(true, false, true, false),
	},
	{
		"name":        "request_sign_in",
		"title":       "Request sign-in",
		"description": "Ask through to sign this agent in to a website with a connected account, in the browser tab the agent is using. Needs an owner or admin connection and an account that allows this agent. In this preview the sign-in is simulated: through records a single-use, 60-second grant but enters no credentials, so ask the user to finish signing in themselves.",
		"inputSchema": object(map[string]any{
			"origin":           originProperty,
			"accountId":        map[string]any{"type": "string", "maxLength": 64, "description": "Which account to use, from list_sign_in_accounts. Needed only when more than one account on the site allows this agent."},
			"tabId":            map[string]any{"type": "string", "maxLength": 128, "description": "The browser tab identifier, if the agent's browser exposes one."},
			"browserSessionId": map[string]any{"type": "string", "maxLength": 128, "description": "The browser session identifier, if the agent's browser exposes one."},
			"requestId":        map[string]any{"type": "string", "minLength": 8, "maxLength": 128, "description": "Optional key that makes retries of the same request safe."},
		}, "origin"),
		"annotations": annotations(false, false, true, true),
	},
	{
		"name":        "list_recent_sign_in_activity",
		"title":       "List recent sign-in activity",
		"description": "Show recent through activity in this workspace, such as connected accounts, permission changes, and sign-in requests. Available to owner and admin connections.",
		"inputSchema": object(map[string]any{"limit": map[string]any{"type": "integer", "minimum": 1, "maximum": 20, "description": "How many events to return. Defaults to 10."}}),
		"annotations": annotations(true, false, true, false),
	},
}

func toolResult(text string, structured any) map[string]any {
	return map[string]any{"content": []map[string]any{{"type": "text", "text": text}}, "structuredContent": structured, "isError": false}
}

func toolError(text string) map[string]any {
	return map[string]any{"content": []map[string]any{{"type": "text", "text": text}}, "isError": true}
}

// toolFailure turns policy errors into readable tool errors; unexpected errors
// never expose internals.
func toolFailure(e error) (any, *rpcError) {
	var apiErr *core.Error
	if errors.As(e, &apiErr) {
		switch apiErr.Code {
		case "forbidden":
			return toolError("This connection's role in through can't do that. Ask a workspace owner or admin."), nil
		case "access_paused":
			return toolError("Agent access is paused for this workspace in through. The user can resume it in through's Accounts page."), nil
		case "unauthorized":
			return toolError("This connection is no longer authorized. Reconnect the app to through."), nil
		case "rate_limited":
			return toolError("Too many requests. Try again shortly."), nil
		}
		if apiErr.Status < 500 {
			return toolError(apiErr.Message), nil
		}
	}
	return toolError("through could not complete the request. Try again."), nil
}

// siteOrigin reduces a URL to the HTTPS origin through compares against.
func siteOrigin(value string) (string, error) {
	value = strings.TrimSpace(value)
	u, e := url.Parse(value)
	if e != nil || u.Scheme != "https" || u.Host == "" {
		return "", core.Invalid("Pass the website's HTTPS address, for example https://github.com.")
	}
	return core.AccountOrigin("https://" + u.Host)
}

func decodeArgs(raw json.RawMessage, target any) *rpcError {
	if len(raw) == 0 || string(raw) == "null" {
		raw = []byte("{}")
	}
	d := json.NewDecoder(bytes.NewReader(raw))
	d.DisallowUnknownFields()
	if e := d.Decode(target); e != nil {
		return &rpcError{-32602, "Invalid arguments for this tool."}
	}
	return nil
}

type accountView struct {
	ID               string `json:"accountId"`
	Site             string `json:"site"`
	Origin           string `json:"origin"`
	Username         string `json:"username"`
	ThisAgentAllowed bool   `json:"thisAgentAllowed"`
}

func allows(a core.Account, agent string) bool {
	for _, permitted := range a.Agents {
		if permitted == agent {
			return true
		}
	}
	return false
}

var printable = regexp.MustCompile(`^[\x21-\x7e]{1,128}$`)

func (s *Server) callTool(r *http.Request, call mcpCall, name string, raw json.RawMessage) (any, *rpcError) {
	ctx := r.Context()
	switch name {
	case "list_sign_in_accounts":
		var args struct{}
		if err := decodeArgs(raw, &args); err != nil {
			return nil, err
		}
		session, e := s.store.Session(ctx, call.principal)
		if e != nil {
			return toolFailure(e)
		}
		accounts := []accountView{}
		allowed := 0
		for _, a := range session.Accounts {
			ok := allows(a, call.agent)
			if ok {
				allowed++
			}
			accounts = append(accounts, accountView{ID: a.ID, Site: a.Service, Origin: a.Origin, Username: a.Username, ThisAgentAllowed: ok})
		}
		text := "No accounts are connected in through yet."
		if len(accounts) > 0 {
			text = fmt.Sprintf("%s connected; %d allow %s.", plural(len(accounts), "account"), allowed, call.agent)
		}
		if session.Workspace.AccessPaused {
			text += " Agent access is currently paused."
		}
		return toolResult(text, map[string]any{"agent": call.agent, "accessPaused": session.Workspace.AccessPaused, "accounts": accounts}), nil

	case "check_sign_in_access":
		var args struct {
			Origin string `json:"origin"`
		}
		if err := decodeArgs(raw, &args); err != nil {
			return nil, err
		}
		origin, e := siteOrigin(args.Origin)
		if e != nil {
			return toolFailure(e)
		}
		session, e := s.store.Session(ctx, call.principal)
		if e != nil {
			return toolFailure(e)
		}
		matches, permitted := []map[string]string{}, []map[string]string{}
		for _, a := range session.Accounts {
			if a.Origin != origin {
				continue
			}
			view := map[string]string{"accountId": a.ID, "username": a.Username}
			matches = append(matches, view)
			if allows(a, call.agent) {
				permitted = append(permitted, view)
			}
		}
		result := map[string]any{"origin": origin, "agent": call.agent, "allowed": false, "accounts": permitted}
		var text string
		switch {
		case session.Workspace.AccessPaused:
			result["reason"] = "paused"
			text = "Agent access is paused in through. The user can resume it, or sign in themselves."
		case len(matches) == 0:
			result["reason"] = "no_account"
			text = "No account for " + origin + " is connected in through. Ask the user to sign in themselves, or to connect the account in through."
		case len(permitted) == 0:
			result["reason"] = "agent_not_allowed"
			text = "An account for " + origin + " is connected, but it doesn't allow " + call.agent + ". The user can allow " + call.agent + " on that connection in through."
		default:
			result["reason"] = "ready"
			result["allowed"] = true
			text = call.agent + " may request sign-in to " + origin + " with " + plural(len(permitted), "account") + ". Call request_sign_in."
		}
		return toolResult(text, result), nil

	case "request_sign_in":
		var args struct {
			Origin           string `json:"origin"`
			AccountID        string `json:"accountId"`
			TabID            string `json:"tabId"`
			BrowserSessionID string `json:"browserSessionId"`
			RequestID        string `json:"requestId"`
		}
		if err := decodeArgs(raw, &args); err != nil {
			return nil, err
		}
		origin, e := siteOrigin(args.Origin)
		if e != nil {
			return toolFailure(e)
		}
		session, e := s.store.Session(ctx, call.principal)
		if e != nil {
			return toolFailure(e)
		}
		var candidates []core.Account
		for _, a := range session.Accounts {
			if a.Origin == origin && allows(a, call.agent) && (args.AccountID == "" || a.ID == args.AccountID) {
				candidates = append(candidates, a)
			}
		}
		if len(candidates) == 0 {
			return toolError("No connected account for " + origin + " allows " + call.agent + ". Call check_sign_in_access for details."), nil
		}
		if len(candidates) > 1 {
			return toolError("More than one account for " + origin + " allows " + call.agent + ". Pass accountId from list_sign_in_accounts."), nil
		}
		account := candidates[0]
		tab, browser := args.TabID, args.BrowserSessionID
		if tab == "" {
			tab = "unspecified"
		}
		if browser == "" {
			browser = "unspecified"
		}
		if !printable.MatchString(tab) || !printable.MatchString(browser) {
			return toolError("Browser and tab identifiers must be printable ASCII without spaces."), nil
		}
		key := args.RequestID
		if key == "" {
			key = "mcp_" + core.NewID()
		} else if !keyPattern.MatchString(key) {
			return toolError("requestId must be 8–128 letters, digits, underscores, or hyphens."), nil
		}
		h, replayed, e := s.store.CreateHandoff(ctx, call.principal, core.HandoffInput{AccountID: account.ID, Agent: call.agent, TargetOrigin: origin, BrowserSessionID: browser, TabID: tab}, key)
		if e != nil {
			return toolFailure(e)
		}
		text := "through recorded a single-use sign-in grant for " + account.Service + " (" + account.Username + "). This is a preview: no credentials were entered. Ask the user to finish signing in in the browser, then continue the task."
		return toolResult(text, map[string]any{
			"status": h.Status, "simulated": h.Simulated, "credentialsEntered": false, "replayed": replayed,
			"grantId": h.ID, "site": account.Service, "origin": origin, "username": account.Username, "expiresAt": h.ExpiresAt,
		}), nil

	case "list_recent_sign_in_activity":
		var args struct {
			Limit *int `json:"limit"`
		}
		if err := decodeArgs(raw, &args); err != nil {
			return nil, err
		}
		limit := 10
		if args.Limit != nil {
			if *args.Limit < 1 || *args.Limit > 20 {
				return nil, &rpcError{-32602, "limit must be between 1 and 20."}
			}
			limit = *args.Limit
		}
		page, e := s.store.Audit(ctx, call.principal, 0, limit)
		if e != nil {
			return toolFailure(e)
		}
		events := []map[string]any{}
		for _, event := range page.Events {
			item := map[string]any{"action": event.Action, "occurredAt": event.OccurredAt}
			if event.Target != "" {
				item["target"] = event.Target
			}
			events = append(events, item)
		}
		text := "No recent activity."
		if len(events) > 0 {
			text = plural(len(events), "recent event") + "."
		}
		return toolResult(text, map[string]any{"events": events}), nil
	}
	return nil, &rpcError{-32602, "Unknown tool."}
}

func plural(n int, noun string) string {
	if n == 1 {
		return "1 " + noun
	}
	return fmt.Sprintf("%d %ss", n, noun)
}
