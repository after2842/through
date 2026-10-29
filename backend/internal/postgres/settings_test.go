package postgres_test

import (
	"context"
	"encoding/json"
	"errors"
	"io"
	"log/slog"
	"net/http"
	"net/http/httptest"
	"strings"
	"testing"
	"time"

	"github.com/jackc/pgx/v5/pgxpool"
	"through/backend/internal/config"
	"through/backend/internal/core"
	"through/backend/internal/httpapi"
	"through/backend/internal/postgres"
)

func TestProfileValidationPersistenceAndIsolation(t *testing.T) {
	s := database(t)
	ctx := context.Background()
	p, auth := login(t, s, "profile@example.com")
	other, _ := login(t, s, "other@example.com")
	if auth.Session.User.DisplayName != "" {
		t.Fatal("new user must have an empty display name")
	}
	for _, tt := range []struct{ input, want string }{
		{"  Alex Rivera  ", "Alex Rivera"},
		{"\u2003김 Alex 🌻\u2003", "김 Alex 🌻"},
		{strings.Repeat("界", 80), strings.Repeat("界", 80)},
		{"   ", ""},
	} {
		if e := s.UpdateProfile(ctx, p, tt.input); e != nil {
			t.Fatal(e)
		}
		session, e := s.Session(ctx, p)
		if e != nil || session.User.DisplayName != tt.want {
			t.Fatalf("display name normalization failed: %v", e)
		}
	}
	if e := s.UpdateProfile(ctx, p, "Preserved"); e != nil {
		t.Fatal(e)
	}
	for _, value := range []string{strings.Repeat("a", 81), strings.Repeat("界", 81), "Alex\nRivera", "\tAlex", "Alex\u0000", "Alex\u0085", string([]byte{0xff})} {
		var apiErr *core.Error
		if e := s.UpdateProfile(ctx, p, value); !errors.As(e, &apiErr) || apiErr.Status != 400 {
			t.Fatalf("invalid display name accepted: %v", e)
		}
	}
	// A new pool reconstructs profile state from the database, not process memory.
	reopened, e := pgxpool.NewWithConfig(ctx, s.Pool.Config())
	if e != nil {
		t.Fatal(e)
	}
	defer reopened.Close()
	fresh := postgres.New(reopened, 8*time.Hour)
	session, e := fresh.Session(ctx, p)
	if e != nil || session.User.DisplayName != "Preserved" {
		t.Fatalf("profile was not persisted: %v", e)
	}
	otherSession, e := s.Session(ctx, other)
	if e != nil || otherSession.User.DisplayName != "" {
		t.Fatalf("another user's profile changed: %v", e)
	}
	page, e := s.Audit(ctx, p, 0, 100)
	if e != nil {
		t.Fatal(e)
	}
	updates := 0
	for _, event := range page.Events {
		if event.Action == "profile.updated" {
			updates++
			if event.Target != "" {
				t.Fatal("audit must not contain profile values")
			}
		}
	}
	if updates != 5 {
		t.Fatalf("expected five successful name changes, got %d", updates)
	}
	// Saving the same normalized value does not create misleading change events.
	if e = s.UpdateProfile(ctx, p, " Preserved "); e != nil {
		t.Fatal(e)
	}
	var count int
	if e = s.Pool.QueryRow(ctx, "SELECT count(*) FROM audit_events WHERE actor_id=$1 AND action='profile.updated'", p.UserID).Scan(&count); e != nil || count != updates {
		t.Fatalf("unchanged profile produced an audit event: %v", e)
	}
	// Possession of a stale or modified principal is not authority to write.
	forged := *p
	forged.UserID = other.UserID
	wantError(t, s.UpdateProfile(ctx, &forged, "Forbidden"), core.ErrUnauthorized)
	if e = s.Logout(ctx, p); e != nil {
		t.Fatal(e)
	}
	wantError(t, s.UpdateProfile(ctx, p, "Forbidden"), core.ErrUnauthorized)
}

func TestEveryRoleCanManageOwnProfileAndSessions(t *testing.T) {
	s := database(t)
	ctx := context.Background()
	p, _ := login(t, s, "roles@example.com")
	for _, role := range []string{"owner", "admin", "member", "viewer"} {
		if _, e := s.Pool.Exec(ctx, "UPDATE memberships SET role=$1 WHERE workspace_id=$2 AND user_id=$3", role, p.WorkspaceID, p.UserID); e != nil {
			t.Fatal(e)
		}
		if e := s.UpdateProfile(ctx, p, role); e != nil {
			t.Fatalf("%s cannot update own profile: %v", role, e)
		}
		if count, e := s.LogoutOthers(ctx, p); e != nil || count != 0 {
			t.Fatalf("%s cannot revoke own other sessions: %v", role, e)
		}
	}
	if _, e := s.Pool.Exec(ctx, "UPDATE sessions SET expires_at=now()-interval '1 second' WHERE token_hash=$1", p.SessionHash); e != nil {
		t.Fatal(e)
	}
	wantError(t, s.UpdateProfile(ctx, p, "Expired"), core.ErrUnauthorized)
	_, e := s.LogoutOthers(ctx, p)
	wantError(t, e, core.ErrUnauthorized)
}

func extraWorkspaceSession(t *testing.T, s *postgres.Store, p *core.Principal) (*core.Principal, string) {
	t.Helper()
	ctx := context.Background()
	workspaceID, token := core.NewID(), core.NewID()+core.NewID()
	if _, e := s.Pool.Exec(ctx, "INSERT INTO workspaces(id,name) VALUES($1,'Other workspace')", workspaceID); e != nil {
		t.Fatal(e)
	}
	if _, e := s.Pool.Exec(ctx, "INSERT INTO memberships(workspace_id,user_id,role) VALUES($1,$2,'viewer')", workspaceID, p.UserID); e != nil {
		t.Fatal(e)
	}
	if _, e := s.Pool.Exec(ctx, "INSERT INTO sessions(token_hash,user_id,workspace_id,csrf_token,expires_at) VALUES($1,$2,$3,$4,now()+interval '1 hour')", core.Hash(token), p.UserID, workspaceID, core.NewID()); e != nil {
		t.Fatal(e)
	}
	principal, e := s.Authenticate(ctx, token)
	if e != nil {
		t.Fatal(e)
	}
	return principal, token
}

func TestLogoutOthersScopesUserAcrossWorkspacesAndPreservesCurrent(t *testing.T) {
	s := database(t)
	ctx := context.Background()
	p, current := login(t, s, "sessions@example.com")
	second, secondAuth := login(t, s, "sessions@example.com")
	crossWorkspace, crossToken := extraWorkspaceSession(t, s, p)
	other, otherAuth := login(t, s, "other@example.com")
	count, e := s.LogoutOthers(ctx, p)
	if e != nil || count != 2 {
		t.Fatalf("revoked %d sessions: %v", count, e)
	}
	for _, token := range []string{secondAuth.Token, crossToken} {
		_, e = s.Authenticate(ctx, token)
		wantError(t, e, core.ErrUnauthorized)
	}
	for _, token := range []string{current.Token, otherAuth.Token} {
		if _, e = s.Authenticate(ctx, token); e != nil {
			t.Fatal("current or another user's session was revoked")
		}
	}
	// Revoked principals cannot use either endpoint after middleware has run.
	_, e = s.LogoutOthers(ctx, second)
	wantError(t, e, core.ErrUnauthorized)
	wantError(t, s.UpdateProfile(ctx, crossWorkspace, "Forbidden"), core.ErrUnauthorized)
	forged := *p
	forged.UserID = other.UserID
	_, e = s.LogoutOthers(ctx, &forged)
	wantError(t, e, core.ErrUnauthorized)
	count, e = s.LogoutOthers(ctx, p)
	if e != nil || count != 0 {
		t.Fatalf("repeat action did not reconcile: %d %v", count, e)
	}
	page, e := s.Audit(ctx, p, 0, 25)
	if e != nil {
		t.Fatal(e)
	}
	audits := 0
	for _, event := range page.Events {
		if event.Action == "session.others_signed_out" {
			audits++
			if event.Target != "" {
				t.Fatal("session audit contains personal/session identifiers")
			}
		}
	}
	if audits != 1 {
		t.Fatalf("expected one revocation audit, got %d", audits)
	}
}

func TestConcurrentLogoutOthersRevalidatesCaller(t *testing.T) {
	s := database(t)
	p, _ := login(t, s, "concurrent@example.com")
	other, _ := extraWorkspaceSession(t, s, p)
	ctx, cancel := context.WithTimeout(context.Background(), 5*time.Second)
	defer cancel()
	start, results := make(chan struct{}), make(chan error, 2)
	for _, caller := range []*core.Principal{p, other} {
		go func(caller *core.Principal) {
			<-start
			_, e := s.LogoutOthers(ctx, caller)
			results <- e
		}(caller)
	}
	close(start)
	succeeded, denied := 0, 0
	for range 2 {
		e := <-results
		switch {
		case e == nil:
			succeeded++
		case errors.Is(e, core.ErrUnauthorized):
			denied++
		default:
			t.Fatalf("concurrent revocation failed: %v", e)
		}
	}
	if succeeded != 1 || denied != 1 {
		t.Fatalf("revoked caller was not revalidated: %d success, %d denied", succeeded, denied)
	}
}

func TestSettingsAuditFailureRollsBack(t *testing.T) {
	s := database(t)
	ctx := context.Background()
	p, _ := login(t, s, "rollback@example.com")
	_, other := login(t, s, "rollback@example.com")
	if _, e := s.Pool.Exec(ctx, `CREATE FUNCTION reject_settings_audit() RETURNS trigger LANGUAGE plpgsql AS $$ BEGIN RAISE EXCEPTION 'injected audit failure'; END $$; CREATE TRIGGER reject_settings_audit BEFORE INSERT ON audit_events FOR EACH ROW WHEN (NEW.action IN ('profile.updated','session.others_signed_out')) EXECUTE FUNCTION reject_settings_audit()`); e != nil {
		t.Fatal(e)
	}
	if e := s.UpdateProfile(ctx, p, "Rollback"); e == nil {
		t.Fatal("profile changed without audit")
	}
	if _, e := s.LogoutOthers(ctx, p); e == nil {
		t.Fatal("sessions revoked without audit")
	}
	session, e := s.Session(ctx, p)
	if e != nil || session.User.DisplayName != "" {
		t.Fatalf("profile rollback failed: %v", e)
	}
	if _, e = s.Authenticate(ctx, other.Token); e != nil {
		t.Fatalf("session rollback failed: %v", e)
	}
}

func TestSettingsHTTPBoundariesAndDTO(t *testing.T) {
	s := database(t)
	p, auth := login(t, s, "http-settings@example.com")
	_, other := login(t, s, "http-settings@example.com")
	api, e := httpapi.New(s, config.Config{AllowedOrigins: map[string]bool{"http://client.test": true}}, slog.New(slog.NewTextHandler(io.Discard, nil)))
	if e != nil {
		t.Fatal(e)
	}
	defer api.Close()
	h := api.Handler()
	for _, tt := range []struct {
		name, method, path, body, origin, csrf, token string
		want                                          int
	}{
		{"missing cookie", "PATCH", "/api/v1/me", `{"displayName":"Alex"}`, "http://client.test", p.CSRFToken, "", 401},
		{"wrong origin", "PATCH", "/api/v1/me", `{"displayName":"Alex"}`, "http://evil.test", p.CSRFToken, auth.Token, 403},
		{"missing csrf", "PATCH", "/api/v1/me", `{"displayName":"Alex"}`, "http://client.test", "", auth.Token, 403},
		{"missing name", "PATCH", "/api/v1/me", `{}`, "http://client.test", p.CSRFToken, auth.Token, 400},
		{"null name", "PATCH", "/api/v1/me", `{"displayName":null}`, "http://client.test", p.CSRFToken, auth.Token, 400},
		{"caller user", "PATCH", "/api/v1/me", `{"displayName":"Alex","userId":"other"}`, "http://client.test", p.CSRFToken, auth.Token, 400},
		{"role escalation", "PATCH", "/api/v1/me", `{"displayName":"Alex","role":"owner"}`, "http://client.test", p.CSRFToken, auth.Token, 400},
		{"logout wrong origin", "POST", "/api/v1/auth/logout-others", "", "http://evil.test", p.CSRFToken, auth.Token, 403},
		{"logout missing csrf", "POST", "/api/v1/auth/logout-others", "", "http://client.test", "", auth.Token, 403},
		{"logout caller user", "POST", "/api/v1/auth/logout-others", `{"userId":"other"}`, "http://client.test", p.CSRFToken, auth.Token, 400},
		{"profile updated", "PATCH", "/api/v1/me", `{"displayName":" Alex 🌻 "}`, "http://client.test", p.CSRFToken, auth.Token, 200},
		{"logout others", "POST", "/api/v1/auth/logout-others", "", "http://client.test", p.CSRFToken, auth.Token, 200},
		{"revoked other", "GET", "/api/v1/session", "", "", "", other.Token, 401},
		{"current kept", "GET", "/api/v1/session", "", "", "", auth.Token, 200},
	} {
		t.Run(tt.name, func(t *testing.T) {
			r := httptest.NewRequest(tt.method, tt.path, strings.NewReader(tt.body))
			r.Header.Set("Origin", tt.origin)
			r.Header.Set("X-CSRF-Token", tt.csrf)
			r.Header.Set("Content-Type", "application/json")
			if tt.token != "" {
				r.AddCookie(&http.Cookie{Name: httpapi.CookieName, Value: tt.token})
			}
			w := httptest.NewRecorder()
			h.ServeHTTP(w, r)
			if w.Code != tt.want {
				t.Fatalf("status %d body %s", w.Code, w.Body)
			}
			if tt.name == "profile updated" || tt.name == "current kept" {
				var session core.Session
				if e := json.Unmarshal(w.Body.Bytes(), &session); e != nil || session.User.DisplayName != "Alex 🌻" {
					t.Fatalf("session DTO missing persisted name: %v", e)
				}
			}
			if tt.name == "logout others" && strings.TrimSpace(w.Body.String()) != `{"revokedSessions":1}` {
				t.Fatalf("wrong count: %s", w.Body)
			}
		})
	}
}
