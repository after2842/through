package postgres_test

import (
	"context"
	"crypto/sha256"
	"encoding/base64"
	"encoding/json"
	"fmt"
	"io"
	"log/slog"
	"net/http"
	"net/http/cookiejar"
	"net/http/httptest"
	"net/url"
	"strings"
	"testing"

	"through/backend/internal/config"
	"through/backend/internal/core"
	"through/backend/internal/httpapi"
	"through/backend/internal/postgres"
)

const callback = "https://claude.ai/api/mcp/auth_callback"

type agentHarness struct {
	t                      *testing.T
	store                  *postgres.Store
	server                 *httptest.Server
	origin                 string
	jar                    http.CookieJar
	csrf                   string
	lastCode, lastVerifier string
}

func newAgentHarness(t *testing.T) *agentHarness {
	t.Helper()
	s := database(t)
	h := &agentHarness{t: t, store: s}
	// The public origin must be known before the server starts, so use a fixed
	// allowed origin and send it explicitly where a browser would.
	h.origin = "http://127.0.0.1:8080"
	api, e := httpapi.New(s, config.Config{AllowedOrigins: map[string]bool{h.origin: true}, PublicOrigin: h.origin}, slog.New(slog.NewTextHandler(io.Discard, nil)))
	if e != nil {
		t.Fatal(e)
	}
	t.Cleanup(func() { api.Close() })
	h.server = httptest.NewServer(api.Handler())
	t.Cleanup(h.server.Close)
	h.jar, _ = cookiejar.New(nil)
	return h
}

// do sends a request without following redirects.
func (h *agentHarness) do(method, path string, body io.Reader, headers map[string]string, cookies bool) *http.Response {
	h.t.Helper()
	r, _ := http.NewRequest(method, h.server.URL+path, body)
	for k, v := range headers {
		r.Header.Set(k, v)
	}
	client := &http.Client{CheckRedirect: func(*http.Request, []*http.Request) error { return http.ErrUseLastResponse }}
	if cookies {
		client.Jar = h.jar
	}
	resp, e := client.Do(r)
	if e != nil {
		h.t.Fatal(e)
	}
	return resp
}

func read(t *testing.T, resp *http.Response, want int) []byte {
	t.Helper()
	defer resp.Body.Close()
	data, _ := io.ReadAll(resp.Body)
	if resp.StatusCode != want {
		t.Fatalf("%s %s: status %d, want %d: %s", resp.Request.Method, resp.Request.URL.Path, resp.StatusCode, want, data)
	}
	return data
}

func (h *agentHarness) api(method, path, body string, want int) []byte {
	h.t.Helper()
	return read(h.t, h.do(method, path, strings.NewReader(body), map[string]string{"Origin": h.origin, "Content-Type": "application/json", "X-CSRF-Token": h.csrf}, true), want)
}

func (h *agentHarness) signIn(email string) {
	h.t.Helper()
	var challenge core.Challenge
	json.Unmarshal(h.api("POST", "/api/v1/auth/challenges", fmt.Sprintf(`{"email":%q}`, email), 201), &challenge)
	var session core.Session
	json.Unmarshal(h.api("POST", "/api/v1/auth/verify", fmt.Sprintf(`{"challengeId":%q,"code":"0000"}`, challenge.ID), 200), &session)
	h.csrf = session.CSRFToken
}

func (h *agentHarness) register() string {
	h.t.Helper()
	data := read(h.t, h.do("POST", "/oauth/register", strings.NewReader(`{"client_name":"Claude","redirect_uris":["`+callback+`"],"token_endpoint_auth_method":"none","grant_types":["authorization_code","refresh_token"],"response_types":["code"],"logo_uri":"https://example.com/x.png"}`), map[string]string{"Content-Type": "application/json"}, false), 201)
	var c struct {
		ClientID string `json:"client_id"`
		Method   string `json:"token_endpoint_auth_method"`
	}
	json.Unmarshal(data, &c)
	if c.ClientID == "" || c.Method != "none" {
		h.t.Fatalf("bad registration %s", data)
	}
	return c.ClientID
}

func pkce() (string, string) {
	verifier := strings.Repeat("v", 20) + core.NewID()
	sum := sha256.Sum256([]byte(verifier))
	return verifier, base64.RawURLEncoding.EncodeToString(sum[:])
}

// authorize walks the consent flow for an agent and returns tokens.
func (h *agentHarness) authorize(clientID, agent string) core.TokenSet {
	h.t.Helper()
	verifier, challenge := pkce()
	q := url.Values{"response_type": {"code"}, "client_id": {clientID}, "redirect_uri": {callback}, "code_challenge": {challenge}, "code_challenge_method": {"S256"}, "state": {"st8"}, "scope": {"through offline_access"}, "resource": {h.origin + "/mcp"}}
	page := string(read(h.t, h.do("GET", "/oauth/authorize?"+q.Encode(), nil, nil, true), 200))
	if !strings.Contains(page, "Connect Claude?") || !strings.Contains(page, "claude.ai") {
		h.t.Fatalf("unexpected consent page: %s", page)
	}
	form := url.Values{}
	for k, v := range q {
		form[k] = v
	}
	form.Set("csrf", h.csrf)
	form.Set("agent", agent)
	form.Set("decision", "allow")
	resp := h.do("POST", "/oauth/authorize", strings.NewReader(form.Encode()), map[string]string{"Origin": h.origin, "Content-Type": "application/x-www-form-urlencoded"}, true)
	read(h.t, resp, 303)
	location, _ := url.Parse(resp.Header.Get("Location"))
	if !strings.HasPrefix(location.String(), callback+"?") || location.Query().Get("state") != "st8" || location.Query().Get("iss") != h.origin {
		h.t.Fatalf("bad redirect %s", location)
	}
	token := h.tokenRequest(url.Values{"grant_type": {"authorization_code"}, "code": {location.Query().Get("code")}, "redirect_uri": {callback}, "client_id": {clientID}, "code_verifier": {verifier}}, 200)
	var tokens core.TokenSet
	json.Unmarshal(token, &tokens)
	if tokens.AccessToken == "" || tokens.RefreshToken == "" || tokens.TokenType != "Bearer" || tokens.Scope != "through offline_access" {
		h.t.Fatalf("bad token response %s", token)
	}
	// The code is single use; replaying it revokes the connection it created.
	h.lastCode = location.Query().Get("code")
	h.lastVerifier = verifier
	return tokens
}

func (h *agentHarness) tokenRequest(form url.Values, want int) []byte {
	h.t.Helper()
	return read(h.t, h.do("POST", "/oauth/token", strings.NewReader(form.Encode()), map[string]string{"Content-Type": "application/x-www-form-urlencoded"}, false), want)
}

type rpcResult struct {
	Result struct {
		Tools             []map[string]any `json:"tools"`
		ProtocolVersion   string           `json:"protocolVersion"`
		IsError           bool             `json:"isError"`
		StructuredContent map[string]any   `json:"structuredContent"`
		Content           []struct {
			Text string `json:"text"`
		} `json:"content"`
	} `json:"result"`
	Error *struct {
		Code int `json:"code"`
	} `json:"error"`
}

func (h *agentHarness) mcp(token, method, params string, want int) rpcResult {
	h.t.Helper()
	body := fmt.Sprintf(`{"jsonrpc":"2.0","id":1,"method":%q,"params":%s}`, method, params)
	headers := map[string]string{"Content-Type": "application/json", "Accept": "application/json, text/event-stream"}
	if token != "" {
		headers["Authorization"] = "Bearer " + token
	}
	data := read(h.t, h.do("POST", "/mcp", strings.NewReader(body), headers, false), want)
	var out rpcResult
	json.Unmarshal(data, &out)
	return out
}

func (h *agentHarness) tool(token, name, args string) rpcResult {
	h.t.Helper()
	return h.mcp(token, "tools/call", fmt.Sprintf(`{"name":%q,"arguments":%s}`, name, args), 200)
}

func TestAgentConnectionOAuthAndMCPFlow(t *testing.T) {
	h := newAgentHarness(t)

	// Discovery metadata points clients at this server.
	var prm map[string]any
	json.Unmarshal(read(t, h.do("GET", "/.well-known/oauth-protected-resource/mcp", nil, nil, false), 200), &prm)
	if prm["resource"] != h.origin+"/mcp" {
		t.Fatalf("bad resource metadata %v", prm)
	}
	var asm map[string]any
	json.Unmarshal(read(t, h.do("GET", "/.well-known/oauth-authorization-server", nil, nil, false), 200), &asm)
	if asm["registration_endpoint"] != h.origin+"/oauth/register" || fmt.Sprint(asm["code_challenge_methods_supported"]) != "[S256]" {
		t.Fatalf("bad AS metadata %v", asm)
	}
	read(t, h.do("GET", "/.well-known/openai-apps-challenge", nil, nil, false), 404)

	// Unauthenticated MCP requests start OAuth with a 401 pointer.
	resp := h.do("POST", "/mcp", strings.NewReader(`{"jsonrpc":"2.0","id":1,"method":"initialize","params":{}}`), map[string]string{"Content-Type": "application/json"}, false)
	read(t, resp, 401)
	if !strings.Contains(resp.Header.Get("WWW-Authenticate"), `resource_metadata="`+h.origin+`/.well-known/oauth-protected-resource/mcp"`) {
		t.Fatalf("missing resource metadata pointer: %s", resp.Header.Get("WWW-Authenticate"))
	}
	read(t, h.do("GET", "/mcp", nil, nil, false), 405)

	h.signIn("owner@example.com")
	h.api("POST", "/api/v1/accounts", `{"service":"Linear","origin":"https://linear.app","username":"alex@example.com","agents":["Claude"]}`, 200)
	clientID := h.register()

	// Without a browser session the authorize step hands off to the login page.
	verifierUnused, challenge := pkce()
	_ = verifierUnused
	q := url.Values{"response_type": {"code"}, "client_id": {clientID}, "redirect_uri": {callback}, "code_challenge": {challenge}, "code_challenge_method": {"S256"}}
	resp = h.do("GET", "/oauth/authorize?"+q.Encode(), nil, nil, false)
	read(t, resp, 302)
	if !strings.HasPrefix(resp.Header.Get("Location"), "/login/?next=%2Foauth%2Fauthorize%3F") {
		t.Fatalf("bad login handoff %s", resp.Header.Get("Location"))
	}
	// An unregistered redirect never leaves through.
	q.Set("redirect_uri", "https://evil.example/cb")
	resp = h.do("GET", "/oauth/authorize?"+q.Encode(), nil, nil, true)
	read(t, resp, 400)
	if resp.Header.Get("Location") != "" {
		t.Fatal("redirected to an unregistered URI")
	}
	// PKCE is mandatory.
	q.Set("redirect_uri", callback)
	q.Del("code_challenge")
	resp = h.do("GET", "/oauth/authorize?"+q.Encode(), nil, nil, true)
	read(t, resp, 303)
	if !strings.Contains(resp.Header.Get("Location"), "error=invalid_request") {
		t.Fatalf("missing PKCE accepted: %s", resp.Header.Get("Location"))
	}

	// Consent page CSP lets the form redirect only to the client's callback.
	q.Set("code_challenge", challenge)
	resp = h.do("GET", "/oauth/authorize?"+q.Encode(), nil, nil, true)
	read(t, resp, 200)
	if csp := resp.Header.Get("Content-Security-Policy"); !strings.Contains(csp, "form-action 'self' https://claude.ai;") || strings.Contains(csp, "unsafe-inline") {
		t.Fatalf("consent CSP %s", csp)
	}
	// "no-referrer" would make browsers send "Origin: null" on the consent POST.
	if rp := resp.Header.Get("Referrer-Policy"); rp != "same-origin" {
		t.Fatalf("consent Referrer-Policy %q", rp)
	}
	// The consent form requires its own Origin and the session's CSRF token.
	bad := url.Values{}
	for k, v := range q {
		bad[k] = v
	}
	bad.Set("decision", "allow")
	bad.Set("agent", "Claude")
	bad.Set("csrf", "wrong")
	read(t, h.do("POST", "/oauth/authorize", strings.NewReader(bad.Encode()), map[string]string{"Origin": h.origin, "Content-Type": "application/x-www-form-urlencoded"}, true), 403)
	bad.Set("csrf", h.csrf)
	read(t, h.do("POST", "/oauth/authorize", strings.NewReader(bad.Encode()), map[string]string{"Origin": "https://evil.example", "Content-Type": "application/x-www-form-urlencoded"}, true), 403)

	tokens := h.authorize(clientID, "Claude")

	// Access tokens are not browser sessions.
	cookieResp := h.do("GET", "/api/v1/session", nil, map[string]string{"Cookie": httpapi.CookieName + "=" + tokens.AccessToken}, false)
	read(t, cookieResp, 401)

	init := h.mcp(tokens.AccessToken, "initialize", `{"protocolVersion":"2025-06-18","capabilities":{},"clientInfo":{"name":"test","version":"1"}}`, 200)
	if init.Result.ProtocolVersion != "2025-06-18" {
		t.Fatalf("version negotiation %+v", init)
	}
	read(t, h.do("POST", "/mcp", strings.NewReader(`{"jsonrpc":"2.0","method":"notifications/initialized"}`), map[string]string{"Content-Type": "application/json", "Authorization": "Bearer " + tokens.AccessToken}, false), 202)
	list := h.mcp(tokens.AccessToken, "tools/list", `{}`, 200)
	if len(list.Result.Tools) != 4 {
		t.Fatalf("tools %+v", list)
	}
	for _, tool := range list.Result.Tools {
		a, _ := tool["annotations"].(map[string]any)
		if tool["title"] == "" || a["readOnlyHint"] == nil || a["destructiveHint"] == nil || a["openWorldHint"] == nil {
			t.Fatalf("tool missing title or annotations: %v", tool)
		}
	}

	check := h.tool(tokens.AccessToken, "check_sign_in_access", `{"origin":"https://linear.app/login?next=/team"}`)
	if check.Result.IsError || check.Result.StructuredContent["allowed"] != true || check.Result.StructuredContent["agent"] != "Claude" {
		t.Fatalf("check %+v", check)
	}
	missing := h.tool(tokens.AccessToken, "check_sign_in_access", `{"origin":"https://github.com"}`)
	if missing.Result.StructuredContent["reason"] != "no_account" {
		t.Fatalf("expected no_account %+v", missing)
	}
	if bad := h.mcp(tokens.AccessToken, "tools/call", `{"name":"check_sign_in_access","arguments":{"origin":"https://linear.app","password":"x"}}`, 200); bad.Error == nil || bad.Error.Code != -32602 {
		t.Fatalf("unknown argument accepted %+v", bad)
	}
	signIn := h.tool(tokens.AccessToken, "request_sign_in", `{"origin":"https://linear.app","tabId":"tab-1","requestId":"retry-key-123"}`)
	if signIn.Result.IsError || signIn.Result.StructuredContent["status"] != "simulated" || signIn.Result.StructuredContent["credentialsEntered"] != false {
		t.Fatalf("sign in %+v", signIn)
	}
	replay := h.tool(tokens.AccessToken, "request_sign_in", `{"origin":"https://linear.app","tabId":"tab-1","requestId":"retry-key-123"}`)
	if replay.Result.StructuredContent["replayed"] != true || replay.Result.StructuredContent["grantId"] != signIn.Result.StructuredContent["grantId"] {
		t.Fatalf("retry not idempotent %+v", replay)
	}
	activity := h.tool(tokens.AccessToken, "list_recent_sign_in_activity", `{"limit":5}`)
	if activity.Result.IsError || !strings.Contains(fmt.Sprint(activity.Result.StructuredContent["events"]), "handoff.simulated") || strings.Contains(fmt.Sprint(activity.Result.StructuredContent), "owner@example.com") {
		t.Fatalf("activity %+v", activity)
	}

	// Pausing workspace access stops sign-in requests.
	h.api("PATCH", "/api/v1/workspace/access", `{"paused":true}`, 200)
	if paused := h.tool(tokens.AccessToken, "request_sign_in", `{"origin":"https://linear.app"}`); !paused.Result.IsError {
		t.Fatalf("paused workspace allowed sign-in %+v", paused)
	}
	h.api("PATCH", "/api/v1/workspace/access", `{"paused":false}`, 200)

	// A second connection as Codex sees the account but may not use it.
	codex := h.authorize(clientID, "Codex")
	if denied := h.tool(codex.AccessToken, "check_sign_in_access", `{"origin":"https://linear.app"}`); denied.Result.StructuredContent["reason"] != "agent_not_allowed" {
		t.Fatalf("Codex should be denied %+v", denied)
	}

	// Signing out other browser sessions leaves agent connections alone.
	h.api("POST", "/api/v1/auth/logout-others", "", 200)
	h.mcp(tokens.AccessToken, "ping", `{}`, 200)

	// Refresh tokens rotate; reusing an old one ends the connection.
	rotated := h.tokenRequest(url.Values{"grant_type": {"refresh_token"}, "refresh_token": {tokens.RefreshToken}, "client_id": {clientID}}, 200)
	var next core.TokenSet
	json.Unmarshal(rotated, &next)
	h.mcp(next.AccessToken, "ping", `{}`, 200)
	reuse := h.tokenRequest(url.Values{"grant_type": {"refresh_token"}, "refresh_token": {tokens.RefreshToken}, "client_id": {clientID}}, 400)
	if !strings.Contains(string(reuse), "invalid_grant") {
		t.Fatalf("reuse %s", reuse)
	}
	h.mcp(next.AccessToken, "ping", `{}`, 401)

	// Settings lists live connections and revokes them immediately.
	var listed struct {
		Connections []core.AgentConnection `json:"connections"`
	}
	json.Unmarshal(h.api("GET", "/api/v1/agent-connections", "", 200), &listed)
	if len(listed.Connections) != 1 || listed.Connections[0].Agent != "Codex" || listed.Connections[0].RedirectHost != "claude.ai" {
		t.Fatalf("connections %+v", listed)
	}
	h.api("DELETE", "/api/v1/agent-connections/"+listed.Connections[0].ID, "", 200)
	h.mcp(codex.AccessToken, "ping", `{}`, 401)
	read(t, h.do("DELETE", "/api/v1/agent-connections/"+listed.Connections[0].ID, nil, map[string]string{"Origin": h.origin, "X-CSRF-Token": h.csrf}, true), 404)

	// Replaying an authorization code fails and revokes what it issued.
	third := h.authorize(clientID, "Claude")
	h.tokenRequest(url.Values{"grant_type": {"authorization_code"}, "code": {h.lastCode}, "redirect_uri": {callback}, "client_id": {clientID}, "code_verifier": {h.lastVerifier}}, 400)
	h.mcp(third.AccessToken, "ping", `{}`, 401)

	// Wrong verifier, client, or redirect never yields tokens.
	h.tokenRequest(url.Values{"grant_type": {"client_credentials"}, "client_id": {clientID}}, 400)
	h.tokenRequest(url.Values{"grant_type": {"authorization_code"}, "code": {"x"}, "redirect_uri": {callback}, "client_id": {"thc_unknown"}, "code_verifier": {"y"}}, 401)

	var auditPage core.AuditPage
	json.Unmarshal(h.api("GET", "/api/v1/audit?limit=100", "", 200), &auditPage)
	actions := []string{}
	for _, event := range auditPage.Events {
		actions = append(actions, event.Action+":"+event.Target)
	}
	joined := strings.Join(actions, "\n")
	for _, want := range []string{"agent_connection.authorized:Claude as Claude", "agent_connection.revoked:Claude as Claude (refresh token reuse)", "agent_connection.revoked:Claude as Codex", "agent_connection.revoked:Claude as Claude (code replay)"} {
		if !strings.Contains(joined, want) {
			t.Fatalf("audit missing %q in\n%s", want, joined)
		}
	}
}

func TestAgentConnectionMemberRoleAndRegistrationLimits(t *testing.T) {
	h := newAgentHarness(t)
	for _, body := range []string{`{"redirect_uris":["http://example.com/cb"]}`, `{"redirect_uris":[]}`, `{"redirect_uris":["https://a.example/cb"],"grant_types":["client_credentials"]}`, `not json`} {
		resp := h.do("POST", "/oauth/register", strings.NewReader(body), map[string]string{"Content-Type": "application/json"}, false)
		data := read(t, resp, 400)
		if !strings.Contains(string(data), `"error":"invalid_`) {
			t.Fatalf("registration error shape %s", data)
		}
	}
	h.signIn("member@example.com")
	clientID := h.register()
	h.api("POST", "/api/v1/accounts", `{"service":"Linear","origin":"https://linear.app","username":"m@example.com","agents":["Claude"]}`, 200)
	tokens := h.authorize(clientID, "Claude")
	// Demoted to member: reading accounts still works; sign-in and activity do not.
	if _, e := h.store.Pool.Exec(context.Background(), "UPDATE memberships SET role='member' WHERE user_id=(SELECT id FROM users WHERE email='member@example.com')"); e != nil {
		t.Fatal(e)
	}
	if r := h.tool(tokens.AccessToken, "list_sign_in_accounts", `{}`); r.Result.IsError || len(r.Result.StructuredContent["accounts"].([]any)) != 1 {
		t.Fatalf("list %+v", r)
	}
	if r := h.tool(tokens.AccessToken, "request_sign_in", `{"origin":"https://linear.app"}`); !r.Result.IsError || !strings.Contains(r.Result.Content[0].Text, "owner or admin") {
		t.Fatalf("member requested sign-in %+v", r)
	}
	if r := h.tool(tokens.AccessToken, "list_recent_sign_in_activity", `{}`); !r.Result.IsError {
		t.Fatalf("member read activity %+v", r)
	}
	// Members see and revoke only their own connections.
	var listed struct {
		Connections []core.AgentConnection `json:"connections"`
	}
	json.Unmarshal(h.api("GET", "/api/v1/agent-connections", "", 200), &listed)
	if len(listed.Connections) != 1 || !listed.Connections[0].Mine {
		t.Fatalf("member connections %+v", listed)
	}
}
