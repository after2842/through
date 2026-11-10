// Package httpapi exposes a same-origin, cookie-authenticated JSON API.
package httpapi

import (
	"context"
	"crypto/sha256"
	"crypto/subtle"
	"encoding/base64"
	"encoding/json"
	"errors"
	"fmt"
	"io"
	"log/slog"
	"net"
	"net/http"
	"os"
	"path"
	"regexp"
	"strconv"
	"strings"
	"sync"
	"sync/atomic"
	"time"

	"through/backend/internal/config"
	"through/backend/internal/core"
)

const CookieName = "through_session"

type contextKey uint8

const requestKey contextKey = 1
const principalKey contextKey = 2

type Server struct {
	store    core.Store
	cfg      config.Config
	log      *slog.Logger
	limiter  *limiter
	requests atomic.Uint64
	failures atomic.Uint64
	root     *os.Root
}

func New(store core.Store, cfg config.Config, log *slog.Logger) (*Server, error) {
	s := &Server{store: store, cfg: cfg, log: log, limiter: &limiter{entries: map[string]bucket{}}}
	if cfg.StaticDir != "" {
		var e error
		s.root, e = os.OpenRoot(cfg.StaticDir)
		if e != nil {
			return nil, e
		}
	}
	return s, nil
}
func (s *Server) Close() error {
	if s.root != nil {
		return s.root.Close()
	}
	return nil
}
func (s *Server) Handler() http.Handler {
	mux := http.NewServeMux()
	mux.HandleFunc("GET /healthz", func(w http.ResponseWriter, r *http.Request) { s.json(w, 200, map[string]string{"status": "ok"}) })
	mux.HandleFunc("GET /readyz", func(w http.ResponseWriter, r *http.Request) {
		ctx, cancel := context.WithTimeout(r.Context(), 2*time.Second)
		defer cancel()
		if e := s.store.Ping(ctx); e != nil {
			s.json(w, 503, map[string]string{"status": "unavailable"})
			return
		}
		s.json(w, 200, map[string]string{"status": "ready"})
	})
	mux.HandleFunc("GET /metrics", s.metrics)
	mux.HandleFunc("GET /api/v1/runtime", func(w http.ResponseWriter, r *http.Request) {
		s.json(w, 200, map[string]any{"mode": "demo", "backend": true, "externalIntegrations": "placeholder"})
	})
	mux.HandleFunc("POST /api/v1/auth/challenges", s.challenge)
	mux.HandleFunc("POST /api/v1/auth/verify", s.verify)
	mux.Handle("GET /api/v1/session", s.auth(http.HandlerFunc(s.session)))
	mux.Handle("POST /api/v1/auth/logout", s.auth(http.HandlerFunc(s.logout)))
	mux.Handle("POST /api/v1/auth/logout-others", s.auth(http.HandlerFunc(s.logoutOthers)))
	mux.Handle("PATCH /api/v1/me", s.auth(http.HandlerFunc(s.updateProfile)))
	mux.Handle("POST /api/v1/accounts", s.auth(http.HandlerFunc(s.addAccount)))
	mux.Handle("DELETE /api/v1/accounts/{id}", s.auth(http.HandlerFunc(s.removeAccount)))
	mux.Handle("PATCH /api/v1/accounts/{id}/agents", s.auth(http.HandlerFunc(s.accountAgents)))
	mux.Handle("PUT /api/v1/accounts/{id}/agents/{agent}", s.auth(http.HandlerFunc(s.accountAgent)))
	mux.Handle("DELETE /api/v1/accounts/{id}/agents/{agent}", s.auth(http.HandlerFunc(s.accountAgent)))
	mux.Handle("POST /api/v1/accounts/{id}/credential", s.auth(http.HandlerFunc(s.updateCredential)))
	mux.Handle("PATCH /api/v1/workspace/access", s.auth(http.HandlerFunc(s.access)))
	mux.Handle("GET /api/v1/audit", s.auth(http.HandlerFunc(s.audit)))
	mux.Handle("POST /api/v1/handoffs", s.auth(http.HandlerFunc(s.handoff)))
	mux.Handle("GET /api/v1/handoffs/{id}", s.auth(http.HandlerFunc(s.getHandoff)))
	mux.Handle("GET /api/v1/agent-connections", s.auth(http.HandlerFunc(s.agentConnections)))
	mux.Handle("DELETE /api/v1/agent-connections/{id}", s.auth(http.HandlerFunc(s.revokeAgentConnection)))
	// OAuth 2.1 authorization server and the MCP resource for agent connections.
	mux.HandleFunc("GET /.well-known/oauth-protected-resource", s.protectedResourceMetadata)
	mux.HandleFunc("GET /.well-known/oauth-protected-resource/mcp", s.protectedResourceMetadata)
	mux.HandleFunc("GET /.well-known/oauth-authorization-server", s.authorizationServerMetadata)
	mux.HandleFunc("GET /.well-known/openai-apps-challenge", s.openAIChallenge)
	mux.HandleFunc("POST /oauth/register", s.register)
	mux.HandleFunc("GET /oauth/authorize", s.authorize)
	mux.HandleFunc("POST /oauth/authorize", s.authorizeDecision)
	mux.HandleFunc("POST /oauth/token", s.token)
	mux.HandleFunc("/oauth/", func(w http.ResponseWriter, r *http.Request) { s.fail(w, r, core.ErrNotFound) })
	mux.HandleFunc("POST /mcp", s.mcp)
	mux.HandleFunc("/mcp", s.mcpMethodNotAllowed)
	// Method mismatches and unknown API routes are JSON, never a static fallback.
	mux.HandleFunc("/api/", func(w http.ResponseWriter, r *http.Request) { s.fail(w, r, core.ErrNotFound) })
	mux.HandleFunc("/", s.static)
	return s.middleware(mux)
}
func (s *Server) json(w http.ResponseWriter, status int, data any) {
	w.Header().Set("Content-Type", "application/json; charset=utf-8")
	w.Header().Set("Cache-Control", "no-store")
	w.WriteHeader(status)
	_ = json.NewEncoder(w).Encode(data)
}
func (s *Server) fail(w http.ResponseWriter, r *http.Request, err error) {
	var apiErr *core.Error
	if !errors.As(err, &apiErr) {
		apiErr = &core.Error{Code: "internal_error", Message: "Something went wrong. Please try again.", Status: 500}
	}
	if apiErr.Status == 429 {
		w.Header().Set("Retry-After", "60")
	}
	s.json(w, apiErr.Status, map[string]any{"error": map[string]string{"code": apiErr.Code, "message": apiErr.Message}, "requestId": requestID(r)})
}
func requestID(r *http.Request) string { v, _ := r.Context().Value(requestKey).(string); return v }
func principal(r *http.Request) *core.Principal {
	return r.Context().Value(principalKey).(*core.Principal)
}
func decode(w http.ResponseWriter, r *http.Request, target any) error {
	if strings.Split(r.Header.Get("Content-Type"), ";")[0] != "application/json" {
		return &core.Error{Code: "unsupported_media_type", Message: "Use application/json.", Status: 415}
	}
	r.Body = http.MaxBytesReader(w, r.Body, 16<<10)
	d := json.NewDecoder(r.Body)
	d.DisallowUnknownFields()
	if e := d.Decode(target); e != nil {
		return core.Invalid("Send one valid JSON object with supported fields.")
	}
	if e := d.Decode(&struct{}{}); e != io.EOF {
		return core.Invalid("Send exactly one JSON object.")
	}
	return nil
}
func (s *Server) auth(next http.Handler) http.Handler {
	return http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		c, e := r.Cookie(CookieName)
		if e != nil {
			s.fail(w, r, core.ErrUnauthorized)
			return
		}
		p, e := s.store.Authenticate(r.Context(), c.Value)
		if e != nil {
			s.fail(w, r, e)
			return
		}
		if unsafe(r.Method) && subtle.ConstantTimeCompare([]byte(r.Header.Get("X-CSRF-Token")), []byte(p.CSRFToken)) != 1 {
			s.fail(w, r, &core.Error{Code: "csrf_failed", Message: "Refresh the page and try again.", Status: 403})
			return
		}
		next.ServeHTTP(w, r.WithContext(context.WithValue(r.Context(), principalKey, p)))
	})
}
func (s *Server) challenge(w http.ResponseWriter, r *http.Request) {
	var body struct {
		Email string `json:"email"`
	}
	if e := decode(w, r, &body); e != nil {
		s.fail(w, r, e)
		return
	}
	email, e := core.Email(body.Email)
	if e != nil {
		s.fail(w, r, e)
		return
	}
	c, e := s.store.CreateChallenge(r.Context(), email)
	if e != nil {
		s.fail(w, r, e)
		return
	}
	s.json(w, 201, c)
}
func (s *Server) verify(w http.ResponseWriter, r *http.Request) {
	var body struct {
		ChallengeID string `json:"challengeId"`
		Code        string `json:"code"`
	}
	if e := decode(w, r, &body); e != nil {
		s.fail(w, r, e)
		return
	}
	if len(body.ChallengeID) > 64 || len(body.Code) > 16 {
		s.fail(w, r, core.ErrChallenge)
		return
	}
	result, e := s.store.VerifyChallenge(r.Context(), body.ChallengeID, body.Code)
	if e != nil {
		s.fail(w, r, e)
		return
	}
	http.SetCookie(w, &http.Cookie{Name: CookieName, Value: result.Token, Path: "/", Secure: s.cfg.CookieSecure, HttpOnly: true, SameSite: http.SameSiteStrictMode, Expires: result.Session.ExpiresAt, MaxAge: int(time.Until(result.Session.ExpiresAt).Seconds())})
	s.json(w, 200, result.Session)
}
func (s *Server) session(w http.ResponseWriter, r *http.Request) {
	data, e := s.store.Session(r.Context(), principal(r))
	if e != nil {
		s.fail(w, r, e)
		return
	}
	s.json(w, 200, data)
}
func (s *Server) logout(w http.ResponseWriter, r *http.Request) {
	if e := s.store.Logout(r.Context(), principal(r)); e != nil {
		s.fail(w, r, e)
		return
	}
	http.SetCookie(w, &http.Cookie{Name: CookieName, Value: "", Path: "/", Secure: s.cfg.CookieSecure, HttpOnly: true, SameSite: http.SameSiteStrictMode, Expires: time.Unix(1, 0), MaxAge: -1})
	w.WriteHeader(204)
}
func (s *Server) logoutOthers(w http.ResponseWriter, r *http.Request) {
	// This endpoint accepts no caller-selected user or session identifiers.
	if r.ContentLength != 0 || len(r.TransferEncoding) != 0 {
		s.fail(w, r, core.Invalid("This action does not accept a request body."))
		return
	}
	count, e := s.store.LogoutOthers(r.Context(), principal(r))
	if e != nil {
		s.fail(w, r, e)
		return
	}
	s.json(w, 200, map[string]int64{"revokedSessions": count})
}
func (s *Server) updateProfile(w http.ResponseWriter, r *http.Request) {
	var body struct {
		DisplayName *string `json:"displayName"`
	}
	if e := decode(w, r, &body); e != nil {
		s.fail(w, r, e)
		return
	}
	if body.DisplayName == nil {
		s.fail(w, r, core.Invalid("Specify a display name, or leave it empty to clear it."))
		return
	}
	if e := s.store.UpdateProfile(r.Context(), principal(r), *body.DisplayName); e != nil {
		s.fail(w, r, e)
		return
	}
	s.session(w, r)
}
func (s *Server) addAccount(w http.ResponseWriter, r *http.Request) {
	var body struct {
		Service  string    `json:"service"`
		Agent    *string   `json:"agent"`
		Origin   *string   `json:"origin"`
		Username *string   `json:"username"`
		Agents   *[]string `json:"agents"`
	}
	if e := decode(w, r, &body); e != nil {
		s.fail(w, r, e)
		return
	}
	var e error
	if body.Agent != nil && body.Origin == nil && body.Username == nil && body.Agents == nil {
		e = s.store.AddAccount(r.Context(), principal(r), body.Service, *body.Agent)
	} else if body.Agent == nil && body.Origin != nil && body.Username != nil && body.Agents != nil {
		e = s.store.CreateAccount(r.Context(), principal(r), core.AccountInput{Service: body.Service, Origin: *body.Origin, Username: *body.Username, Agents: *body.Agents})
	} else {
		e = core.Invalid("Specify a platform, HTTPS origin, username, and permitted agents.")
	}
	if e != nil {
		s.fail(w, r, e)
		return
	}
	s.session(w, r)
}
func (s *Server) accountAgents(w http.ResponseWriter, r *http.Request) {
	var body struct {
		Agents *[]string `json:"agents"`
	}
	if e := decode(w, r, &body); e != nil {
		s.fail(w, r, e)
		return
	}
	if body.Agents == nil {
		s.fail(w, r, core.Invalid("Specify permitted agents, or an empty list to remove all access."))
		return
	}
	if e := s.store.SetAccountAgents(r.Context(), principal(r), r.PathValue("id"), *body.Agents); e != nil {
		s.fail(w, r, e)
		return
	}
	s.session(w, r)
}
func (s *Server) updateCredential(w http.ResponseWriter, r *http.Request) {
	if r.ContentLength != 0 || len(r.TransferEncoding) != 0 {
		s.fail(w, r, core.Invalid("This demo action does not accept a password or any request body."))
		return
	}
	if e := s.store.UpdateCredential(r.Context(), principal(r), r.PathValue("id")); e != nil {
		s.fail(w, r, e)
		return
	}
	s.session(w, r)
}
func (s *Server) accountAgent(w http.ResponseWriter, r *http.Request) {
	if r.ContentLength != 0 || len(r.TransferEncoding) != 0 {
		s.fail(w, r, core.Invalid("This action does not accept a request body."))
		return
	}
	if e := s.store.SetAccountAgent(r.Context(), principal(r), r.PathValue("id"), r.PathValue("agent"), r.Method == http.MethodPut); e != nil {
		s.fail(w, r, e)
		return
	}
	s.session(w, r)
}
func (s *Server) removeAccount(w http.ResponseWriter, r *http.Request) {
	if e := s.store.RemoveAccount(r.Context(), principal(r), r.PathValue("id")); e != nil {
		s.fail(w, r, e)
		return
	}
	s.session(w, r)
}
func (s *Server) access(w http.ResponseWriter, r *http.Request) {
	var body struct {
		Paused *bool `json:"paused"`
	}
	if e := decode(w, r, &body); e != nil {
		s.fail(w, r, e)
		return
	}
	if body.Paused == nil {
		s.fail(w, r, core.Invalid("Specify whether access is paused."))
		return
	}
	if e := s.store.SetPaused(r.Context(), principal(r), *body.Paused); e != nil {
		s.fail(w, r, e)
		return
	}
	s.session(w, r)
}
func (s *Server) audit(w http.ResponseWriter, r *http.Request) {
	limit := 25
	cursor := int64(0)
	var e error
	if v := r.URL.Query().Get("limit"); v != "" {
		limit, e = strconv.Atoi(v)
		if e != nil || limit < 1 || limit > 100 {
			s.fail(w, r, core.Invalid("Limit must be between 1 and 100."))
			return
		}
	}
	if v := r.URL.Query().Get("cursor"); v != "" {
		cursor, e = strconv.ParseInt(v, 10, 64)
		if e != nil || cursor < 1 {
			s.fail(w, r, core.Invalid("Invalid cursor."))
			return
		}
	}
	data, e := s.store.Audit(r.Context(), principal(r), cursor, limit, r.URL.Query().Get("accountId"))
	if e != nil {
		s.fail(w, r, e)
		return
	}
	s.json(w, 200, data)
}

var keyPattern = regexp.MustCompile(`^[A-Za-z0-9_-]{8,128}$`)

func (s *Server) handoff(w http.ResponseWriter, r *http.Request) {
	var body core.HandoffInput
	if e := decode(w, r, &body); e != nil {
		s.fail(w, r, e)
		return
	}
	key := r.Header.Get("Idempotency-Key")
	if !keyPattern.MatchString(key) {
		s.fail(w, r, core.Invalid("Send an Idempotency-Key of 8–128 letters, digits, underscores, or hyphens."))
		return
	}
	h, replayed, e := s.store.CreateHandoff(r.Context(), principal(r), body, key)
	if e != nil {
		s.fail(w, r, e)
		return
	}
	status := 201
	if replayed {
		status = 200
		w.Header().Set("Idempotency-Replayed", "true")
	}
	s.json(w, status, h)
}
func (s *Server) getHandoff(w http.ResponseWriter, r *http.Request) {
	h, e := s.store.Handoff(r.Context(), principal(r), r.PathValue("id"))
	if e != nil {
		s.fail(w, r, e)
		return
	}
	s.json(w, 200, h)
}
func (s *Server) metrics(w http.ResponseWriter, r *http.Request) {
	supplied := strings.TrimPrefix(r.Header.Get("Authorization"), "Bearer ")
	if s.cfg.MetricsToken == "" || subtle.ConstantTimeCompare([]byte(supplied), []byte(s.cfg.MetricsToken)) != 1 {
		s.fail(w, r, core.ErrNotFound)
		return
	}
	w.Header().Set("Content-Type", "text/plain; version=0.0.4")
	fmt.Fprintf(w, "# TYPE through_http_requests_total counter\nthrough_http_requests_total %d\n# TYPE through_http_failures_total counter\nthrough_http_failures_total %d\n", s.requests.Load(), s.failures.Load())
}
func unsafe(method string) bool { return method != "GET" && method != "HEAD" && method != "OPTIONS" }

type recorder struct {
	http.ResponseWriter
	status int
}

func (w *recorder) WriteHeader(status int) {
	if w.status == 0 {
		w.status = status
		w.ResponseWriter.WriteHeader(status)
	}
}
func (w *recorder) Write(b []byte) (int, error) {
	if w.status == 0 {
		w.WriteHeader(200)
	}
	return w.ResponseWriter.Write(b)
}
func (w *recorder) Unwrap() http.ResponseWriter { return w.ResponseWriter }
func (s *Server) middleware(next http.Handler) http.Handler {
	return http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		started := time.Now()
		id := core.NewID()
		r = r.WithContext(context.WithValue(r.Context(), requestKey, id))
		rw := &recorder{ResponseWriter: w}
		w = rw
		w.Header().Set("X-Request-ID", id)
		w.Header().Set("X-Content-Type-Options", "nosniff")
		w.Header().Set("X-Frame-Options", "DENY")
		w.Header().Set("Referrer-Policy", "no-referrer")
		w.Header().Set("Permissions-Policy", "camera=(), microphone=(), geolocation=()")
		w.Header().Set("Cross-Origin-Opener-Policy", "same-origin")
		w.Header().Set("Content-Security-Policy", "default-src 'none'; frame-ancestors 'none'")
		w.Header().Set("Cache-Control", "no-store")
		if s.cfg.CookieSecure {
			w.Header().Set("Strict-Transport-Security", "max-age=31536000")
		}
		defer func() {
			if recover() != nil {
				if rw.status == 0 {
					s.fail(w, r, errors.New("panic"))
				}
				s.log.Error("request recovered", "request_id", id)
			}
			s.requests.Add(1)
			if rw.status >= 500 {
				s.failures.Add(1)
			}
			s.log.Info("request completed", "request_id", id, "method", r.Method, "status", rw.status, "duration_ms", time.Since(started).Milliseconds())
		}()
		origin := r.Header.Get("Origin")
		if strings.HasPrefix(r.URL.Path, "/api/") {
			if origin != "" && !s.cfg.AllowedOrigins[origin] {
				s.fail(w, r, &core.Error{Code: "origin_denied", Message: "This origin is not allowed.", Status: 403})
				return
			}
			if unsafe(r.Method) && !s.cfg.AllowedOrigins[origin] {
				s.fail(w, r, &core.Error{Code: "origin_required", Message: "An allowed Origin header is required.", Status: 403})
				return
			}
			if origin != "" {
				w.Header().Set("Access-Control-Allow-Origin", origin)
				w.Header().Set("Access-Control-Allow-Credentials", "true")
				w.Header().Add("Vary", "Origin")
			}
			if r.Method == "OPTIONS" {
				if origin == "" {
					s.fail(w, r, core.ErrForbidden)
					return
				}
				w.Header().Set("Access-Control-Allow-Methods", "GET, POST, PUT, PATCH, DELETE, OPTIONS")
				w.Header().Set("Access-Control-Allow-Headers", "Content-Type, X-CSRF-Token, Idempotency-Key")
				w.Header().Set("Access-Control-Max-Age", "600")
				w.WriteHeader(204)
				return
			}
			ip, _, err := net.SplitHostPort(r.RemoteAddr)
			if err != nil {
				ip = r.RemoteAddr
			}
			bucketKey := ip
			max := 120
			if strings.HasPrefix(r.URL.Path, "/api/v1/auth/") {
				bucketKey += "/auth"
				max = 30
			}
			if !s.limiter.allow(bucketKey, max, started) {
				s.fail(w, r, core.ErrRateLimit)
				return
			}
			ctx, cancel := context.WithTimeout(r.Context(), 10*time.Second)
			defer cancel()
			r = r.WithContext(ctx)
		} else if strings.HasPrefix(r.URL.Path, "/oauth/") || r.URL.Path == "/mcp" || strings.HasPrefix(r.URL.Path, "/.well-known/") {
			// Called server-to-server by MCP clients, so no Origin is required here;
			// the consent form checks its own Origin and CSRF token.
			ip, _, err := net.SplitHostPort(r.RemoteAddr)
			if err != nil {
				ip = r.RemoteAddr
			}
			bucketKey, max := ip+"/agent", 240
			if r.URL.Path == "/oauth/register" {
				bucketKey, max = ip+"/register", 20
			}
			if !s.limiter.allow(bucketKey, max, started) {
				s.fail(w, r, core.ErrRateLimit)
				return
			}
			ctx, cancel := context.WithTimeout(r.Context(), 10*time.Second)
			defer cancel()
			r = r.WithContext(ctx)
		}
		next.ServeHTTP(w, r)
	})
}

type bucket struct {
	count int
	until time.Time
}
type limiter struct {
	mu      sync.Mutex
	entries map[string]bucket
	cleaned time.Time
}

func (l *limiter) allow(key string, max int, now time.Time) bool {
	l.mu.Lock()
	defer l.mu.Unlock()
	if now.Sub(l.cleaned) > time.Minute {
		for k, v := range l.entries {
			if !v.until.After(now) {
				delete(l.entries, k)
			}
		}
		l.cleaned = now
	}
	b, exists := l.entries[key]
	if !exists && len(l.entries) >= 10000 {
		return false
	}
	if !b.until.After(now) {
		b = bucket{until: now.Add(time.Minute)}
	}
	if b.count >= max {
		return false
	}
	b.count++
	l.entries[key] = b
	return true
}

var inlineScripts = regexp.MustCompile(`(?s)<script\b[^>]*>(.*?)</script>`)

func (s *Server) static(w http.ResponseWriter, r *http.Request) {
	if r.Method != "GET" && r.Method != "HEAD" {
		s.fail(w, r, core.ErrNotFound)
		return
	}
	if s.root == nil {
		s.fail(w, r, core.ErrNotFound)
		return
	}
	for _, part := range strings.Split(r.URL.Path, "/") {
		if strings.HasPrefix(part, ".") || strings.Contains(part, "\\") {
			s.fail(w, r, core.ErrNotFound)
			return
		}
	}
	name := strings.TrimPrefix(path.Clean(r.URL.Path), "/")
	if name == "." || name == "" {
		name = "index.html"
	}
	f, e := s.root.Open(name)
	if e != nil {
		s.fail(w, r, core.ErrNotFound)
		return
	}
	defer f.Close()
	info, e := f.Stat()
	if e != nil {
		s.fail(w, r, core.ErrNotFound)
		return
	}
	if info.IsDir() {
		f.Close()
		name = path.Join(name, "index.html")
		f, e = s.root.Open(name)
		if e != nil {
			s.fail(w, r, core.ErrNotFound)
			return
		}
		defer f.Close()
		info, e = f.Stat()
		if e != nil {
			s.fail(w, r, core.ErrNotFound)
			return
		}
	}
	if !info.Mode().IsRegular() {
		s.fail(w, r, core.ErrNotFound)
		return
	}
	if strings.HasSuffix(name, ".html") {
		data, e := io.ReadAll(io.LimitReader(f, 4<<20))
		if e != nil {
			s.fail(w, r, e)
			return
		}
		scripts := "'self'"
		for _, match := range inlineScripts.FindAllSubmatch(data, -1) {
			if len(match[1]) > 0 {
				digest := sha256.Sum256(match[1])
				scripts += " 'sha256-" + base64.StdEncoding.EncodeToString(digest[:]) + "'"
			}
		}
		w.Header().Set("Content-Security-Policy", "default-src 'self'; script-src "+scripts+"; style-src 'self' 'unsafe-inline'; img-src 'self' data: https://www.google.com https://*.gstatic.com; font-src 'self'; connect-src 'self'; object-src 'none'; base-uri 'none'; frame-ancestors 'none'; form-action 'self'")
		w.Header().Set("Cache-Control", "no-cache")
		http.ServeContent(w, r, name, info.ModTime(), strings.NewReader(string(data)))
		return
	}
	if strings.HasPrefix(name, "_next/static/") {
		w.Header().Set("Cache-Control", "public, max-age=31536000, immutable")
	}
	http.ServeContent(w, r, name, info.ModTime(), f)
}
