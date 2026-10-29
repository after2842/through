package httpapi

import (
	"context"
	"io"
	"log/slog"
	"net/http"
	"net/http/httptest"
	"os"
	"path/filepath"
	"strings"
	"testing"
	"time"

	"through/backend/internal/config"
	"through/backend/internal/core"
)

type stubStore struct{ core.Store }

func (stubStore) Authenticate(context.Context, string) (*core.Principal, error) {
	return &core.Principal{CSRFToken: "good-csrf"}, nil
}
func (stubStore) Ping(context.Context) error                             { return nil }
func (stubStore) SetPaused(context.Context, *core.Principal, bool) error { return core.ErrForbidden }
func newTestServer(t *testing.T, dir string) *Server {
	t.Helper()
	s, e := New(stubStore{}, config.Config{AllowedOrigins: map[string]bool{"http://localhost:3000": true}, StaticDir: dir}, slog.New(slog.NewTextHandler(io.Discard, nil)))
	if e != nil {
		t.Fatal(e)
	}
	t.Cleanup(func() { s.Close() })
	return s
}
func TestOriginCSRFAndJSON(t *testing.T) {
	s := newTestServer(t, "")
	h := s.Handler()
	for _, tt := range []struct {
		name, origin, csrf, body, content string
		want                              int
	}{{"missing origin", "", "good-csrf", `{"paused":true}`, "application/json", 403}, {"wrong origin", "http://evil.test", "good-csrf", `{"paused":true}`, "application/json", 403}, {"missing csrf", "http://localhost:3000", "", `{"paused":true}`, "application/json", 403}, {"wrong csrf", "http://localhost:3000", "bad", `{"paused":true}`, "application/json", 403}, {"unknown field", "http://localhost:3000", "good-csrf", `{"paused":true,"role":"owner"}`, "application/json", 400}, {"extra json", "http://localhost:3000", "good-csrf", `{"paused":true}{}`, "application/json", 400}, {"null flag", "http://localhost:3000", "good-csrf", `{"paused":null}`, "application/json", 400}, {"oversized", "http://localhost:3000", "good-csrf", `{"paused":true,"extra":"` + strings.Repeat("x", 17000) + `"}`, "application/json", 400}, {"media type", "http://localhost:3000", "good-csrf", `{"paused":true}`, "text/plain", 415}, {"role denied", "http://localhost:3000", "good-csrf", `{"paused":true}`, "application/json", 403}} {
		t.Run(tt.name, func(t *testing.T) {
			r := httptest.NewRequest("PATCH", "/api/v1/workspace/access", strings.NewReader(tt.body))
			r.Header.Set("Origin", tt.origin)
			r.Header.Set("X-CSRF-Token", tt.csrf)
			r.Header.Set("Content-Type", tt.content)
			r.AddCookie(&http.Cookie{Name: CookieName, Value: "test"})
			w := httptest.NewRecorder()
			h.ServeHTTP(w, r)
			if w.Code != tt.want {
				t.Fatalf("status %d body%s", w.Code, w.Body)
			}
			if w.Header().Get("X-Request-ID") == "" {
				t.Fatal("missing request id")
			}
		})
	}
}
func TestStaticIsolationAndCSP(t *testing.T) {
	dir := t.TempDir()
	outside := t.TempDir()
	os.WriteFile(filepath.Join(dir, "index.html"), []byte(`<html><script>window.x=1</script></html>`), 0600)
	os.WriteFile(filepath.Join(outside, "private"), []byte("SECRET"), 0600)
	os.Symlink(filepath.Join(outside, "private"), filepath.Join(dir, "leak"))
	os.Mkdir(filepath.Join(dir, "folder"), 0700)
	os.WriteFile(filepath.Join(dir, ".env"), []byte("SECRET"), 0600)
	h := newTestServer(t, dir).Handler()
	for _, route := range []string{"/leak", "/.env", "/folder/", "/api/v1/unknown", "/../private"} {
		w := httptest.NewRecorder()
		h.ServeHTTP(w, httptest.NewRequest("GET", route, nil))
		if strings.Contains(w.Body.String(), "SECRET") || w.Code == 200 {
			t.Fatalf("unsafe static response %s: %d %s", route, w.Code, w.Body)
		}
	}
	w := httptest.NewRecorder()
	h.ServeHTTP(w, httptest.NewRequest("GET", "/", nil))
	csp := w.Header().Get("Content-Security-Policy")
	if w.Code != 200 || !strings.Contains(csp, "'sha256-") || strings.Contains(strings.Split(csp, "style-src")[0], "unsafe-inline") {
		t.Fatalf("unexpected static CSP %s status %d", csp, w.Code)
	}
}
func TestLimiterBoundedAndExpires(t *testing.T) {
	l := &limiter{entries: map[string]bucket{}}
	now := time.Now()
	if !l.allow("a", 1, now) || l.allow("a", 1, now) {
		t.Fatal("limit not applied")
	}
	if !l.allow("a", 1, now.Add(time.Minute)) {
		t.Fatal("window not reset")
	}
	for i := 0; i < 10000; i++ {
		l.entries[core.NewID()] = bucket{until: now.Add(time.Hour)}
	}
	if l.allow("new", 1, now) {
		t.Fatal("unbounded limiter")
	}
}
func TestMetricsDisabledAndPreflight(t *testing.T) {
	h := newTestServer(t, "").Handler()
	w := httptest.NewRecorder()
	h.ServeHTTP(w, httptest.NewRequest("GET", "/metrics", nil))
	if w.Code != 404 {
		t.Fatal("metrics public")
	}
	r := httptest.NewRequest("OPTIONS", "/api/v1/session", nil)
	r.Header.Set("Origin", "http://localhost:3000")
	w = httptest.NewRecorder()
	h.ServeHTTP(w, r)
	if w.Code != 204 || w.Header().Get("Access-Control-Allow-Credentials") != "true" {
		t.Fatal("preflight failed")
	}
}
