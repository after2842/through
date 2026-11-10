package httpapi

import (
	"crypto/sha256"
	"crypto/subtle"
	"encoding/base64"
	"encoding/json"
	"errors"
	"html/template"
	"io"
	"net/http"
	"net/url"
	"strings"

	"through/backend/internal/core"
)

// OAuth 2.1 authorization server for MCP clients (agent connections).
// Clients register dynamically as public clients and must use PKCE S256.

func (s *Server) resourceURL() string { return s.cfg.PublicOrigin + "/mcp" }

func (s *Server) protectedResourceMetadata(w http.ResponseWriter, r *http.Request) {
	w.Header().Set("Access-Control-Allow-Origin", "*")
	s.json(w, 200, map[string]any{
		"resource":                 s.resourceURL(),
		"authorization_servers":    []string{s.cfg.PublicOrigin},
		"scopes_supported":         []string{core.OAuthScope},
		"bearer_methods_supported": []string{"header"},
		"resource_name":            "through",
		"resource_documentation":   s.cfg.PublicOrigin + "/privacy/",
	})
}

func (s *Server) authorizationServerMetadata(w http.ResponseWriter, r *http.Request) {
	w.Header().Set("Access-Control-Allow-Origin", "*")
	o := s.cfg.PublicOrigin
	s.json(w, 200, map[string]any{
		"issuer":                                         o,
		"authorization_endpoint":                         o + "/oauth/authorize",
		"token_endpoint":                                 o + "/oauth/token",
		"registration_endpoint":                          o + "/oauth/register",
		"response_types_supported":                       []string{"code"},
		"grant_types_supported":                          []string{"authorization_code", "refresh_token"},
		"code_challenge_methods_supported":               []string{"S256"},
		"token_endpoint_auth_methods_supported":          []string{"none"},
		"scopes_supported":                               []string{core.OAuthScope, "offline_access"},
		"authorization_response_iss_parameter_supported": true,
		"service_documentation":                          o + "/privacy/",
	})
}

func (s *Server) openAIChallenge(w http.ResponseWriter, r *http.Request) {
	if s.cfg.OpenAIAppsChallenge == "" {
		s.fail(w, r, core.ErrNotFound)
		return
	}
	w.Header().Set("Content-Type", "text/plain; charset=utf-8")
	io.WriteString(w, s.cfg.OpenAIAppsChallenge)
}

func (s *Server) oauthFail(w http.ResponseWriter, err error) {
	var o *core.OAuthError
	if !errors.As(err, &o) {
		o = &core.OAuthError{Code: "server_error", Description: "Something went wrong. Try again.", Status: 500}
	}
	if o.Status == 401 {
		w.Header().Set("WWW-Authenticate", `Basic realm="through"`)
	}
	w.Header().Set("Pragma", "no-cache")
	s.json(w, o.Status, map[string]string{"error": o.Code, "error_description": o.Description})
}

func (s *Server) register(w http.ResponseWriter, r *http.Request) {
	if strings.Split(r.Header.Get("Content-Type"), ";")[0] != "application/json" {
		s.oauthFail(w, core.OAuthInvalid("invalid_client_metadata", "Send client metadata as application/json."))
		return
	}
	r.Body = http.MaxBytesReader(w, r.Body, 16<<10)
	// RFC 7591 clients send many optional fields; unknown ones are ignored.
	var body struct {
		ClientName              string   `json:"client_name"`
		RedirectURIs            []string `json:"redirect_uris"`
		GrantTypes              []string `json:"grant_types"`
		ResponseTypes           []string `json:"response_types"`
		TokenEndpointAuthMethod string   `json:"token_endpoint_auth_method"`
	}
	if e := json.NewDecoder(r.Body).Decode(&body); e != nil {
		s.oauthFail(w, core.OAuthInvalid("invalid_client_metadata", "Send one valid JSON object."))
		return
	}
	for _, g := range body.GrantTypes {
		if g != "authorization_code" && g != "refresh_token" {
			s.oauthFail(w, core.OAuthInvalid("invalid_client_metadata", "Only authorization_code and refresh_token grants are supported."))
			return
		}
	}
	for _, t := range body.ResponseTypes {
		if t != "code" {
			s.oauthFail(w, core.OAuthInvalid("invalid_client_metadata", "Only the code response type is supported."))
			return
		}
	}
	c, e := s.store.RegisterClient(r.Context(), body.ClientName, body.RedirectURIs)
	if e != nil {
		s.oauthFail(w, e)
		return
	}
	// Every client is public; the response tells the client so (RFC 7591 §3.2.1).
	s.json(w, 201, map[string]any{
		"client_id":                  c.ID,
		"client_id_issued_at":        c.CreatedAt.Unix(),
		"client_name":                c.Name,
		"redirect_uris":              c.RedirectURIs,
		"grant_types":                []string{"authorization_code", "refresh_token"},
		"response_types":             []string{"code"},
		"token_endpoint_auth_method": "none",
	})
}

// authorizeRequest holds the validated parameters shared by the consent page
// and the consent form.
type authorizeRequest struct {
	client                                    *core.OAuthClient
	redirectURI, state, challenge, scope, res string
}

// parseAuthorize validates an authorization request. A bad client or redirect
// renders an error page; anything else is returned to the client's redirect.
func (s *Server) parseAuthorize(w http.ResponseWriter, r *http.Request, values url.Values) (*authorizeRequest, bool) {
	for key, v := range values {
		if len(v) > 1 {
			s.consentError(w, http.StatusBadRequest, "The request repeats the parameter "+key+".")
			return nil, false
		}
	}
	client, e := s.store.OAuthClient(r.Context(), values.Get("client_id"))
	if e != nil {
		s.consentError(w, http.StatusBadRequest, "This app is not registered with through. Start the connection again from the app.")
		return nil, false
	}
	req := &authorizeRequest{client: client, redirectURI: values.Get("redirect_uri"), state: values.Get("state"), challenge: values.Get("code_challenge"), res: values.Get("resource")}
	if !core.RedirectMatches(client.RedirectURIs, req.redirectURI) {
		s.consentError(w, http.StatusBadRequest, "This app's return address does not match its registration. Start the connection again from the app.")
		return nil, false
	}
	if len(req.state) > 1024 {
		s.redirectError(w, r, req, "invalid_request", "state is too long")
		return nil, false
	}
	if values.Get("response_type") != "code" {
		s.redirectError(w, r, req, "unsupported_response_type", "Only response_type=code is supported.")
		return nil, false
	}
	if values.Get("code_challenge_method") != "S256" || !core.ValidCodeChallenge(req.challenge) {
		s.redirectError(w, r, req, "invalid_request", "PKCE with code_challenge_method=S256 is required.")
		return nil, false
	}
	if req.scope, e = core.Scope(values.Get("scope")); e != nil {
		s.redirectError(w, r, req, "invalid_scope", "Request the \"through\" scope.")
		return nil, false
	}
	if req.res != "" && strings.TrimSuffix(req.res, "/") != s.resourceURL() {
		s.redirectError(w, r, req, "invalid_target", "The resource must be "+s.resourceURL()+".")
		return nil, false
	}
	return req, true
}

func (s *Server) redirectTo(w http.ResponseWriter, r *http.Request, req *authorizeRequest, params map[string]string) {
	u, _ := url.Parse(req.redirectURI)
	q := u.Query()
	for k, v := range params {
		q.Set(k, v)
	}
	if req.state != "" {
		q.Set("state", req.state)
	}
	q.Set("iss", s.cfg.PublicOrigin)
	u.RawQuery = q.Encode()
	http.Redirect(w, r, u.String(), http.StatusSeeOther)
}

func (s *Server) redirectError(w http.ResponseWriter, r *http.Request, req *authorizeRequest, code, description string) {
	s.redirectTo(w, r, req, map[string]string{"error": code, "error_description": description})
}

func (s *Server) authorize(w http.ResponseWriter, r *http.Request) {
	req, ok := s.parseAuthorize(w, r, r.URL.Query())
	if !ok {
		return
	}
	// The SameSite=Strict session cookie is not sent on a navigation that started
	// on another site. The login page detects an existing session and returns here.
	c, e := r.Cookie(CookieName)
	var p *core.Principal
	if e == nil {
		p, e = s.store.Authenticate(r.Context(), c.Value)
	}
	if e != nil {
		http.Redirect(w, r, "/login/?next="+url.QueryEscape(r.URL.RequestURI()), http.StatusFound)
		return
	}
	session, e := s.store.Session(r.Context(), p)
	if e != nil {
		http.Redirect(w, r, "/login/?next="+url.QueryEscape(r.URL.RequestURI()), http.StatusFound)
		return
	}
	s.renderConsent(w, req, session, p.CSRFToken)
}

func (s *Server) authorizeDecision(w http.ResponseWriter, r *http.Request) {
	if r.Header.Get("Origin") != s.cfg.PublicOrigin {
		s.consentError(w, http.StatusForbidden, "This request did not come from the through consent page.")
		return
	}
	if strings.Split(r.Header.Get("Content-Type"), ";")[0] != "application/x-www-form-urlencoded" {
		s.consentError(w, http.StatusUnsupportedMediaType, "Submit the consent form.")
		return
	}
	r.Body = http.MaxBytesReader(w, r.Body, 16<<10)
	if e := r.ParseForm(); e != nil {
		s.consentError(w, http.StatusBadRequest, "Submit the consent form.")
		return
	}
	form := url.Values{}
	for _, key := range []string{"client_id", "redirect_uri", "state", "code_challenge", "code_challenge_method", "scope", "resource", "response_type"} {
		if v, present := r.PostForm[key]; present {
			form[key] = v
		}
	}
	req, ok := s.parseAuthorize(w, r, form)
	if !ok {
		return
	}
	c, e := r.Cookie(CookieName)
	var p *core.Principal
	if e == nil {
		p, e = s.store.Authenticate(r.Context(), c.Value)
	}
	if e != nil {
		s.consentError(w, http.StatusUnauthorized, "Your through session ended. Start the connection again from the app.")
		return
	}
	if subtle.ConstantTimeCompare([]byte(r.PostForm.Get("csrf")), []byte(p.CSRFToken)) != 1 {
		s.consentError(w, http.StatusForbidden, "This consent page expired. Start the connection again from the app.")
		return
	}
	if r.PostForm.Get("decision") != "allow" {
		s.redirectError(w, r, req, "access_denied", "The user declined the connection.")
		return
	}
	code, e := s.store.CreateAuthCode(r.Context(), p, core.AuthCodeInput{ClientID: req.client.ID, RedirectURI: req.redirectURI, CodeChallenge: req.challenge, Scope: req.scope, Agent: r.PostForm.Get("agent")})
	if e != nil {
		var apiErr *core.Error
		if errors.As(e, &apiErr) && apiErr.Status == 400 {
			s.consentError(w, http.StatusBadRequest, apiErr.Message)
			return
		}
		s.consentError(w, http.StatusInternalServerError, "The connection could not be created. Try again.")
		return
	}
	s.redirectTo(w, r, req, map[string]string{"code": code})
}

func (s *Server) token(w http.ResponseWriter, r *http.Request) {
	if strings.Split(r.Header.Get("Content-Type"), ";")[0] != "application/x-www-form-urlencoded" {
		s.oauthFail(w, core.OAuthInvalid("invalid_request", "Use application/x-www-form-urlencoded."))
		return
	}
	r.Body = http.MaxBytesReader(w, r.Body, 16<<10)
	if e := r.ParseForm(); e != nil {
		s.oauthFail(w, core.OAuthInvalid("invalid_request", "Send a valid form body."))
		return
	}
	f := r.PostForm
	clientID := f.Get("client_id")
	if user, secret, basic := r.BasicAuth(); basic {
		// Registered clients are public; a secret means the client is confused.
		if secret != "" || (clientID != "" && clientID != user) {
			s.oauthFail(w, core.ErrInvalidClient)
			return
		}
		clientID = user
	}
	if _, e := s.store.OAuthClient(r.Context(), clientID); e != nil {
		s.oauthFail(w, e)
		return
	}
	var tokens *core.TokenSet
	var e error
	switch f.Get("grant_type") {
	case "authorization_code":
		if f.Get("code") == "" || f.Get("code_verifier") == "" || f.Get("redirect_uri") == "" {
			s.oauthFail(w, core.OAuthInvalid("invalid_request", "code, redirect_uri and code_verifier are required."))
			return
		}
		tokens, e = s.store.ExchangeCode(r.Context(), f.Get("code"), clientID, f.Get("redirect_uri"), f.Get("code_verifier"))
	case "refresh_token":
		if f.Get("refresh_token") == "" {
			s.oauthFail(w, core.OAuthInvalid("invalid_request", "refresh_token is required."))
			return
		}
		if requested := f.Get("scope"); requested != "" {
			if _, e = core.Scope(requested); e != nil {
				s.oauthFail(w, e)
				return
			}
		}
		tokens, e = s.store.RefreshTokens(r.Context(), f.Get("refresh_token"), clientID)
	default:
		s.oauthFail(w, core.OAuthInvalid("unsupported_grant_type", "Use authorization_code or refresh_token."))
		return
	}
	if e != nil {
		s.oauthFail(w, e)
		return
	}
	w.Header().Set("Pragma", "no-cache")
	s.json(w, 200, tokens)
}

func (s *Server) agentConnections(w http.ResponseWriter, r *http.Request) {
	list, e := s.store.AgentConnections(r.Context(), principal(r))
	if e != nil {
		s.fail(w, r, e)
		return
	}
	s.json(w, 200, map[string]any{"connections": list})
}

func (s *Server) revokeAgentConnection(w http.ResponseWriter, r *http.Request) {
	if r.ContentLength != 0 || len(r.TransferEncoding) != 0 {
		s.fail(w, r, core.Invalid("This action does not accept a request body."))
		return
	}
	if e := s.store.RevokeAgentConnection(r.Context(), principal(r), r.PathValue("id")); e != nil {
		s.fail(w, r, e)
		return
	}
	s.agentConnections(w, r)
}

// ---- Consent page -------------------------------------------------------------

const consentStyle = `:root{color-scheme:light dark;--paper:#faf8f1;--surface:#fffdf8;--ink:#242b29;--muted:#687575;--line:#dedfd8;--field:#a3aca9;--accent:#3e7695;--tint:#c6e3f4;--focus:#417b9b}@media (prefers-color-scheme:dark){:root{--paper:#191a20;--surface:#23252e;--ink:#eae7e2;--muted:#aaaab6;--line:#383a46;--field:#6d7081;--accent:#b2c6e6;--tint:#38435b;--focus:#b2c6e6}}*{box-sizing:border-box}body{margin:0;min-height:100vh;display:grid;place-items:center;padding:24px 16px;background:var(--paper);color:var(--ink);font:15px/24px "DM Sans",-apple-system,BlinkMacSystemFont,"Segoe UI",Arial,sans-serif}main{width:min(440px,100%)}.mark{font:34px/1 "Instrument Serif",Georgia,serif;letter-spacing:-.03em}.mark span{color:var(--accent)}h1{margin:32px 0 8px;font:400 32px/1.1 "Instrument Serif",Georgia,serif;letter-spacing:-.02em}p{margin:0}.muted{color:var(--muted)}.small{font-size:13px;line-height:20px}.card{margin-top:24px;padding:20px;border:1px solid var(--line);border-radius:8px;background:var(--surface)}fieldset{margin:0;padding:0;border:0}legend{padding:0;font-weight:500}.agents{display:flex;flex-wrap:wrap;gap:8px;margin-top:8px}.agents label{display:inline-flex;align-items:center;gap:8px;min-height:44px;padding:0 14px;border:1px solid var(--field);border-radius:3px;cursor:pointer}.agents input{accent-color:var(--accent)}ul{margin:8px 0 0;padding-left:20px}li{margin-top:4px}.warn{margin-top:16px;padding:10px 12px;border-left:2px solid var(--accent);background:var(--tint)}.actions{display:flex;gap:12px;margin-top:24px}button{min-height:44px;padding:0 20px;border-radius:3px;font:500 14px/20px inherit;font-family:inherit;cursor:pointer}.allow{border:1px solid transparent;background:var(--ink);color:var(--paper)}.deny{border:1px solid var(--field);background:transparent;color:var(--ink)}button:focus-visible,input:focus-visible{outline:2px solid var(--focus);outline-offset:3px}.foot{margin-top:24px}.mt8{margin-top:8px}.mt12{margin-top:12px}.mt16{margin-top:16px}.strong{font-weight:500}`

var consentStyleHash = func() string {
	sum := sha256.Sum256([]byte(consentStyle))
	return "'sha256-" + base64.StdEncoding.EncodeToString(sum[:]) + "'"
}()

var consentPage = template.Must(template.New("consent").Parse(`<!doctype html>
<html lang="en"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width, initial-scale=1"><meta name="robots" content="noindex"><title>{{if .Error}}Connection problem{{else}}Connect an agent{{end}} — through</title><style>{{.Style}}</style></head>
<body><main>
<div class="mark">through<span>.</span></div>
{{if .Error}}
<h1>This connection can’t continue.</h1>
<p class="muted">{{.Error}}</p>
{{else}}
<h1>Connect {{.ClientName}}?</h1>
<p class="muted small">“{{.ClientName}}” is the name the app gave itself. After you choose, you return to <strong>{{.RedirectLabel}}</strong>.</p>
{{if .Loopback}}<p class="warn small">This app runs on your computer. Continue only if you just started this connection yourself.</p>{{end}}
<form method="post" action="/oauth/authorize">
<input type="hidden" name="csrf" value="{{.CSRF}}">
<input type="hidden" name="response_type" value="code">
<input type="hidden" name="client_id" value="{{.ClientID}}">
<input type="hidden" name="redirect_uri" value="{{.RedirectURI}}">
<input type="hidden" name="code_challenge" value="{{.Challenge}}">
<input type="hidden" name="code_challenge_method" value="S256">
<input type="hidden" name="scope" value="{{.Scope}}">
{{if .State}}<input type="hidden" name="state" value="{{.State}}">{{end}}
{{if .Resource}}<input type="hidden" name="resource" value="{{.Resource}}">{{end}}
<div class="card">
<p class="small muted">Signed in as {{.Email}} · {{.Workspace}}</p>
<fieldset class="mt16"><legend>This connection signs in as</legend>
<div class="agents">{{range .Agents}}<label><input type="radio" name="agent" value="{{.Name}}"{{if .Checked}} checked{{end}} required> {{.Name}}</label>{{end}}</div>
<p class="small muted mt8">It can use only the accounts you have allowed for this agent.</p>
</fieldset>
<p class="mt16 strong">It will be able to</p>
<ul class="small"><li>See your connected accounts and which agents may use them</li><li>Request sign-in to those sites for this agent</li><li>Read recent activity, if you are an owner or admin</li></ul>
<p class="small muted mt12">It can never see your passwords. Preview: sign-in requests are simulated and no credentials are entered.</p>
</div>
<div class="actions"><button class="allow" type="submit" name="decision" value="allow">Allow</button><button class="deny" type="submit" name="decision" value="deny">Cancel</button></div>
</form>
<p class="small muted foot">You can disconnect this app at any time in Settings.</p>
{{end}}
</main></body></html>`))

type consentAgent struct {
	Name    string
	Checked bool
}

func suggestedAgent(redirectLabel, clientName string) string {
	host := strings.ToLower(redirectLabel)
	name := strings.ToLower(clientName)
	switch {
	case strings.HasPrefix(host, "cursor") || strings.Contains(name, "cursor"):
		return "Cursor"
	case host == "chatgpt.com" || strings.HasSuffix(host, ".chatgpt.com") || host == "openai.com" || strings.HasSuffix(host, ".openai.com") || strings.Contains(name, "codex") || strings.Contains(name, "chatgpt") || strings.Contains(name, "openai"):
		return "Codex"
	default:
		return "Claude"
	}
}

func (s *Server) writeConsent(w http.ResponseWriter, status int, formAction string, data map[string]any) {
	data["Style"] = template.CSS(consentStyle)
	csp := "default-src 'none'; style-src " + consentStyleHash + "; form-action 'self'"
	if formAction != "" {
		csp += " " + formAction
	}
	csp += "; frame-ancestors 'none'; base-uri 'none'"
	w.Header().Set("Content-Security-Policy", csp)
	// With no-referrer, browsers send "Origin: null" on the consent form's POST;
	// same-origin keeps the real Origin for that check and still sends nothing
	// to the client's redirect.
	w.Header().Set("Referrer-Policy", "same-origin")
	w.Header().Set("Content-Type", "text/html; charset=utf-8")
	w.Header().Set("Cache-Control", "no-store")
	w.WriteHeader(status)
	_ = consentPage.Execute(w, data)
}

func (s *Server) consentError(w http.ResponseWriter, status int, message string) {
	s.writeConsent(w, status, "", map[string]any{"Error": message})
}

func (s *Server) renderConsent(w http.ResponseWriter, req *authorizeRequest, session *core.Session, csrf string) {
	label := core.RedirectLabel(req.redirectURI)
	suggested := suggestedAgent(label, req.client.Name)
	agents := []consentAgent{}
	for _, name := range []string{"Claude", "Codex", "Cursor"} {
		agents = append(agents, consentAgent{Name: name, Checked: name == suggested})
	}
	u, _ := url.Parse(req.redirectURI)
	loopback := u != nil && u.Scheme == "http"
	workspace := session.Workspace.Name
	if workspace == "" {
		workspace = "Workspace"
	}
	s.writeConsent(w, http.StatusOK, core.RedirectOrigin(req.redirectURI), map[string]any{
		"ClientName": req.client.Name, "ClientID": req.client.ID, "RedirectURI": req.redirectURI, "RedirectLabel": label,
		"Loopback": loopback, "State": req.state, "Challenge": req.challenge, "Scope": req.scope, "Resource": req.res,
		"CSRF": csrf, "Email": session.User.Email, "Workspace": workspace, "Agents": agents,
	})
}
