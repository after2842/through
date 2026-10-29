package postgres_test

import (
	"context"
	"encoding/json"
	"errors"
	"fmt"
	"io"
	"log/slog"
	"net/http"
	"net/http/cookiejar"
	"net/http/httptest"
	"os"
	"strings"
	"sync"
	"sync/atomic"
	"testing"
	"time"

	"github.com/jackc/pgx/v5/pgxpool"
	"through/backend/internal/config"
	"through/backend/internal/core"
	"through/backend/internal/httpapi"
	"through/backend/internal/postgres"
)

func database(t *testing.T) *postgres.Store {
	t.Helper()
	dsn := os.Getenv("THROUGH_TEST_DATABASE_URL")
	if dsn == "" {
		t.Skip("set THROUGH_TEST_DATABASE_URL to run PostgreSQL integration tests")
	}
	ctx := context.Background()
	admin, e := pgxpool.New(ctx, dsn)
	if e != nil {
		t.Fatal(e)
	}
	schema := "test_" + strings.ToLower(core.NewID())
	if _, e = admin.Exec(ctx, "CREATE SCHEMA "+schema); e != nil {
		t.Fatal(e)
	}
	cfg, e := pgxpool.ParseConfig(dsn)
	if e != nil {
		t.Fatal(e)
	}
	cfg.ConnConfig.RuntimeParams["search_path"] = schema
	pool, e := pgxpool.NewWithConfig(ctx, cfg)
	if e != nil {
		t.Fatal(e)
	}
	t.Cleanup(func() { pool.Close(); admin.Exec(ctx, "DROP SCHEMA "+schema+" CASCADE"); admin.Close() })
	if e = postgres.Migrate(ctx, pool); e != nil {
		t.Fatal(e)
	}
	if e = postgres.Migrate(ctx, pool); e != nil {
		t.Fatalf("migrations not repeatable: %v", e)
	}
	return postgres.New(pool, 8*time.Hour)
}
func login(t *testing.T, s *postgres.Store, email string) (*core.Principal, *core.AuthResult) {
	t.Helper()
	c, e := s.CreateChallenge(context.Background(), email)
	if e != nil {
		t.Fatal(e)
	}
	a, e := s.VerifyChallenge(context.Background(), c.ID, "0000")
	if e != nil {
		t.Fatal(e)
	}
	p, e := s.Authenticate(context.Background(), a.Token)
	if e != nil {
		t.Fatal(e)
	}
	return p, a
}
func wantError(t *testing.T, got, want error) {
	t.Helper()
	if !errors.Is(got, want) {
		t.Fatalf("got %v want %v", got, want)
	}
}
func TestChallengeLimitsAndOneUse(t *testing.T) {
	s := database(t)
	ctx := context.Background()
	c, e := s.CreateChallenge(ctx, "a@example.com")
	if e != nil {
		t.Fatal(e)
	}
	for i := 0; i < 4; i++ {
		_, e = s.VerifyChallenge(ctx, c.ID, "1234")
		wantError(t, e, core.ErrChallenge)
	}
	_, e = s.VerifyChallenge(ctx, c.ID, "1234")
	wantError(t, e, core.ErrChallengeExhausted)
	_, e = s.VerifyChallenge(ctx, c.ID, "0000")
	wantError(t, e, core.ErrChallengeExhausted)
	c, _ = s.CreateChallenge(ctx, "b@example.com")
	s.Pool.Exec(ctx, "UPDATE challenges SET expires_at=now()-interval '1 second' WHERE id=$1", c.ID)
	_, e = s.VerifyChallenge(ctx, c.ID, "0000")
	wantError(t, e, core.ErrChallengeExpired)
	c, _ = s.CreateChallenge(ctx, "c@example.com")
	var succeeded atomic.Int32
	var wg sync.WaitGroup
	for i := 0; i < 8; i++ {
		wg.Add(1)
		go func() {
			defer wg.Done()
			if _, e := s.VerifyChallenge(ctx, c.ID, "0000"); e == nil {
				succeeded.Add(1)
			}
		}()
	}
	wg.Wait()
	if succeeded.Load() != 1 {
		t.Fatalf("challenge consumed %d times", succeeded.Load())
	}
	for i := 0; i < 5; i++ {
		if _, e = s.CreateChallenge(ctx, "rate@example.com"); e != nil {
			t.Fatal(e)
		}
	}
	_, e = s.CreateChallenge(ctx, "rate@example.com")
	wantError(t, e, core.ErrRateLimit)
}
func TestSessionsTenantsRolesAndAudit(t *testing.T) {
	s := database(t)
	ctx := context.Background()
	a, auth := login(t, s, "a@company.example")
	b, _ := login(t, s, "b@company.example")
	if a.WorkspaceID == b.WorkspaceID {
		t.Fatal("same email domain must not imply shared tenant")
	}
	if e := s.AddAccount(ctx, a, "Linear", "Codex"); e != nil {
		t.Fatal(e)
	}
	wantError(t, s.AddAccount(ctx, a, "Linear", "Codex"), core.ErrDuplicate)
	sa, _ := s.Session(ctx, a)
	account := sa.Accounts[0]
	sb, _ := s.Session(ctx, b)
	if len(sb.Accounts) != 0 {
		t.Fatal("cross tenant accounts")
	}
	wantError(t, s.RemoveAccount(ctx, b, account.ID), core.ErrNotFound)
	if _, e := s.Pool.Exec(ctx, "UPDATE memberships SET role='viewer' WHERE workspace_id=$1", a.WorkspaceID); e != nil {
		t.Fatal(e)
	}
	wantError(t, s.AddAccount(ctx, a, "GitHub", "Cursor"), core.ErrForbidden)
	wantError(t, s.SetPaused(ctx, a, true), core.ErrForbidden)
	fresh, _ := s.Authenticate(ctx, auth.Token)
	_, e := s.Audit(ctx, fresh, 0, 25)
	wantError(t, e, core.ErrForbidden)
	s.Pool.Exec(ctx, "UPDATE memberships SET role='owner' WHERE workspace_id=$1", a.WorkspaceID)
	a, _ = s.Authenticate(ctx, auth.Token)
	page, e := s.Audit(ctx, a, 0, 1)
	if e != nil || len(page.Events) != 1 || page.NextCursor == "" {
		t.Fatalf("audit pagination %#v %v", page, e)
	}
	other, _ := s.Audit(ctx, b, 0, 25)
	for _, event := range other.Events {
		if event.ActorEmail != "b@company.example" {
			t.Fatal("audit leaked tenant")
		}
	}
	if _, e = s.Pool.Exec(ctx, "UPDATE audit_events SET action='tamper' WHERE workspace_id=$1", a.WorkspaceID); e == nil {
		t.Fatal("audit update allowed")
	}
	if _, e = s.Pool.Exec(ctx, "DELETE FROM audit_events WHERE workspace_id=$1", a.WorkspaceID); e == nil {
		t.Fatal("audit delete allowed")
	}
	var stored string
	s.Pool.QueryRow(ctx, "SELECT token_hash FROM sessions WHERE user_id=$1", a.UserID).Scan(&stored)
	if stored == auth.Token || stored != core.Hash(auth.Token) {
		t.Fatal("session token not hashed")
	}
	if e = s.Logout(ctx, a); e != nil {
		t.Fatal(e)
	}
	_, e = s.Authenticate(ctx, auth.Token)
	wantError(t, e, core.ErrUnauthorized)
	p, expired := login(t, s, "expired@example.com")
	s.Pool.Exec(ctx, "UPDATE sessions SET expires_at=now()-interval '1 second' WHERE token_hash=$1", p.SessionHash)
	_, e = s.Authenticate(ctx, expired.Token)
	wantError(t, e, core.ErrUnauthorized)
}

type countingBrowser struct{ calls atomic.Int32 }

func (*countingBrowser) Name() string { return "placeholder" }
func (b *countingBrowser) Consume(_ context.Context, _ core.Handoff) (string, error) {
	b.calls.Add(1)
	return "simulated", nil
}
func TestHandoffBindingIdempotencyRevocation(t *testing.T) {
	s := database(t)
	ctx := context.Background()
	p, _ := login(t, s, "owner@example.com")
	s.AddAccount(ctx, p, "Linear", "Codex")
	session, _ := s.Session(ctx, p)
	input := core.HandoffInput{AccountID: session.Accounts[0].ID, Agent: "Codex", TargetOrigin: "https://linear.app", BrowserSessionID: "browser-1", TabID: "tab-1"}
	browser := &countingBrowser{}
	s.Browser = browser
	var wg sync.WaitGroup
	ids := make(chan string, 12)
	errs := make(chan error, 12)
	for i := 0; i < 12; i++ {
		wg.Add(1)
		go func() {
			defer wg.Done()
			h, _, e := s.CreateHandoff(ctx, p, input, "same-request-key")
			if e != nil {
				errs <- e
				return
			}
			ids <- h.ID
		}()
	}
	wg.Wait()
	close(ids)
	close(errs)
	for e := range errs {
		t.Fatal(e)
	}
	first := ""
	for id := range ids {
		if first != "" && first != id {
			t.Fatal("idempotency returned different grants")
		}
		first = id
	}
	if browser.calls.Load() != 1 {
		t.Fatalf("adapter executed %d times", browser.calls.Load())
	}
	changed := input
	changed.TabID = "tab-2"
	_, _, e := s.CreateHandoff(ctx, p, changed, "same-request-key")
	wantError(t, e, core.ErrConflict)
	for _, origin := range []string{"https://linear.app.evil.test", "http://127.0.0.1:8888", "https://linear.app/path", "https://user@linear.app"} {
		changed = input
		changed.TargetOrigin = origin
		_, _, e = s.CreateHandoff(ctx, p, changed, "different-key")
		var api *core.Error
		if !errors.As(e, &api) || api.Status != 400 {
			t.Fatalf("origin accepted: %s", origin)
		}
	}
	changed = input
	changed.Agent = "Cursor"
	_, _, e = s.CreateHandoff(ctx, p, changed, "another-request")
	if e == nil {
		t.Fatal("agent mismatch accepted")
	}
	other, _ := login(t, s, "other@example.com")
	_, e = s.Handoff(ctx, other, first)
	wantError(t, e, core.ErrNotFound)
	_, _, e = s.CreateHandoff(ctx, other, input, "cross-tenant-key")
	wantError(t, e, core.ErrNotFound)
	s.SetPaused(ctx, p, true)
	_, _, e = s.CreateHandoff(ctx, p, input, "same-request-key")
	wantError(t, e, core.ErrPaused)
	s.SetPaused(ctx, p, false)
	s.RemoveAccount(ctx, p, input.AccountID)
	_, _, e = s.CreateHandoff(ctx, p, input, "same-request-key")
	wantError(t, e, core.ErrNotFound)
	var count int
	s.Pool.QueryRow(ctx, "SELECT count(*) FROM audit_events WHERE workspace_id=$1 AND action='handoff.simulated'", p.WorkspaceID).Scan(&count)
	if count != 1 {
		t.Fatalf("audit duplicate count %d", count)
	}
}
func TestHTTPFlowAndCookie(t *testing.T) {
	s := database(t)
	api, e := httpapi.New(s, config.Config{AllowedOrigins: map[string]bool{"http://client.test": true}}, slog.New(slog.NewTextHandler(io.Discard, nil)))
	if e != nil {
		t.Fatal(e)
	}
	defer api.Close()
	server := httptest.NewServer(api.Handler())
	defer server.Close()
	jar, _ := cookiejar.New(nil)
	client := &http.Client{Jar: jar}
	csrf := ""
	request := func(method, path, body string, want int) []byte {
		t.Helper()
		r, _ := http.NewRequest(method, server.URL+path, strings.NewReader(body))
		r.Header.Set("Origin", "http://client.test")
		r.Header.Set("Content-Type", "application/json")
		r.Header.Set("X-CSRF-Token", csrf)
		resp, e := client.Do(r)
		if e != nil {
			t.Fatal(e)
		}
		defer resp.Body.Close()
		data, _ := io.ReadAll(resp.Body)
		if resp.StatusCode != want {
			t.Fatalf("%s%s: %d %s", method, path, resp.StatusCode, data)
		}
		if path == "/api/v1/auth/verify" && want == 200 {
			cookies := resp.Cookies()
			if len(cookies) != 1 || !cookies[0].HttpOnly || cookies[0].SameSite != http.SameSiteStrictMode {
				t.Fatal("unsafe session cookie")
			}
		}
		return data
	}
	request("GET", "/api/v1/session", "", 401)
	var challenge core.Challenge
	json.Unmarshal(request("POST", "/api/v1/auth/challenges", `{"email":"http@example.com"}`, 201), &challenge)
	var session core.Session
	json.Unmarshal(request("POST", "/api/v1/auth/verify", fmt.Sprintf(`{"challengeId":%q,"code":"0000"}`, challenge.ID), 200), &session)
	csrf = session.CSRFToken
	request("POST", "/api/v1/accounts", `{"service":"Linear","agent":"Codex"}`, 200)
	request("POST", "/api/v1/accounts", `{"service":"Linear","agent":"Codex","password":"NEVER"}`, 400)
	request("PATCH", "/api/v1/workspace/access", `{"paused":true}`, 200)
	request("GET", "/api/v1/audit?limit=1", "", 200)
	request("POST", "/api/v1/auth/logout", "", 204)
	request("GET", "/api/v1/session", "", 401)
}

func TestHandoffCannotReplayAcrossActorsOrSessions(t *testing.T) {
	s := database(t)
	ctx := context.Background()
	p, original := login(t, s, "owner@example.com")
	if e := s.AddAccount(ctx, p, "Linear", "Codex"); e != nil {
		t.Fatal(e)
	}
	session, _ := s.Session(ctx, p)
	input := core.HandoffInput{AccountID: session.Accounts[0].ID, Agent: "Codex", TargetOrigin: "https://linear.app", BrowserSessionID: "browser-1", TabID: "tab-1"}
	receipt, _, e := s.CreateHandoff(ctx, p, input, "bound-request-key")
	if e != nil {
		t.Fatal(e)
	}
	fresh, _ := login(t, s, "owner@example.com")
	_, _, e = s.CreateHandoff(ctx, fresh, input, "bound-request-key")
	wantError(t, e, core.ErrConflict)
	other, otherAuth := login(t, s, "admin@example.com")
	if _, e = s.Pool.Exec(ctx, "INSERT INTO memberships(workspace_id,user_id,role) VALUES($1,$2,'admin')", p.WorkspaceID, other.UserID); e != nil {
		t.Fatal(e)
	}
	if _, e = s.Pool.Exec(ctx, "UPDATE sessions SET workspace_id=$1 WHERE token_hash=$2", p.WorkspaceID, other.SessionHash); e != nil {
		t.Fatal(e)
	}
	other, e = s.Authenticate(ctx, otherAuth.Token)
	if e != nil {
		t.Fatal(e)
	}
	_, _, e = s.CreateHandoff(ctx, other, input, "bound-request-key")
	wantError(t, e, core.ErrConflict)
	// Owner/admin can read historical receipts, which do not grant authority.
	if _, e = s.Handoff(ctx, other, receipt.ID); e != nil {
		t.Fatal(e)
	}
	for _, role := range []string{"member", "viewer"} {
		if _, e = s.Pool.Exec(ctx, "UPDATE memberships SET role=$1 WHERE workspace_id=$2 AND user_id=$3", role, p.WorkspaceID, other.UserID); e != nil {
			t.Fatal(e)
		}
		_, e = s.Handoff(ctx, other, receipt.ID)
		wantError(t, e, core.ErrForbidden)
		_, e = s.Audit(ctx, other, 0, 25)
		wantError(t, e, core.ErrForbidden)
		_, _, e = s.CreateHandoff(ctx, other, input, "new-request-key")
		wantError(t, e, core.ErrForbidden)
	}
	if e = s.Logout(ctx, p); e != nil {
		t.Fatal(e)
	}
	_, e = s.Authenticate(ctx, original.Token)
	wantError(t, e, core.ErrUnauthorized)
	_, _, e = s.CreateHandoff(ctx, p, input, "bound-request-key")
	wantError(t, e, core.ErrUnauthorized)
}

// Force a policy change to acquire the workspace lock before a request. The
// waiting handoff must observe the committed pause/revocation, not a pre-lock read.
func TestWaitingHandoffObservesPolicyCommit(t *testing.T) {
	for _, policy := range []string{"pause", "revoke"} {
		t.Run(policy, func(t *testing.T) {
			s := database(t)
			ctx := context.Background()
			p, _ := login(t, s, policy+"@example.com")
			s.AddAccount(ctx, p, "Linear", "Codex")
			session, _ := s.Session(ctx, p)
			accountID := session.Accounts[0].ID
			input := core.HandoffInput{AccountID: accountID, Agent: "Codex", TargetOrigin: "https://linear.app", BrowserSessionID: "browser", TabID: "tab"}
			tx, e := s.Pool.Begin(ctx)
			if e != nil {
				t.Fatal(e)
			}
			defer tx.Rollback(ctx)
			if _, e = tx.Exec(ctx, "SELECT id FROM workspaces WHERE id=$1 FOR UPDATE", p.WorkspaceID); e != nil {
				t.Fatal(e)
			}
			result := make(chan error, 1)
			go func() { _, _, e := s.CreateHandoff(ctx, p, input, "policy-race-request"); result <- e }()
			// This barrier establishes the policy transaction before the handoff regardless
			// of goroutine scheduling; the lock prevents any earlier policy decision.
			if policy == "pause" {
				_, e = tx.Exec(ctx, "UPDATE workspaces SET access_paused=true WHERE id=$1", p.WorkspaceID)
			} else {
				_, e = tx.Exec(ctx, "UPDATE accounts SET revoked_at=now() WHERE id=$1", accountID)
			}
			if e != nil {
				t.Fatal(e)
			}
			if e = tx.Commit(ctx); e != nil {
				t.Fatal(e)
			}
			e = <-result
			if policy == "pause" {
				wantError(t, e, core.ErrPaused)
			} else {
				wantError(t, e, core.ErrNotFound)
			}
			var count int
			s.Pool.QueryRow(ctx, "SELECT count(*) FROM handoffs WHERE workspace_id=$1", p.WorkspaceID).Scan(&count)
			if count != 0 {
				t.Fatal("denied handoff persisted")
			}
		})
	}
}

func TestAuditFailureRollsBackMutation(t *testing.T) {
	s := database(t)
	ctx := context.Background()
	p, _ := login(t, s, "rollback@example.com")
	// Simulate an unavailable audit sink inside the transaction, not a malformed
	// request rejected before a write. No account may survive the failed audit.
	_, e := s.Pool.Exec(ctx, `CREATE FUNCTION reject_test_audit() RETURNS trigger LANGUAGE plpgsql AS $$ BEGIN RAISE EXCEPTION 'injected audit failure'; END $$; CREATE TRIGGER injected_audit_failure BEFORE INSERT ON audit_events FOR EACH ROW WHEN (NEW.action='account.connected') EXECUTE FUNCTION reject_test_audit()`)
	if e != nil {
		t.Fatal(e)
	}
	if e = s.AddAccount(ctx, p, "Linear", "Codex"); e == nil {
		t.Fatal("mutation succeeded despite rejected audit")
	}
	var count int
	if e = s.Pool.QueryRow(ctx, "SELECT count(*) FROM accounts WHERE workspace_id=$1", p.WorkspaceID).Scan(&count); e != nil {
		t.Fatal(e)
	}
	if count != 0 {
		t.Fatal("account persisted without its audit event")
	}
	if _, e = s.Pool.Exec(ctx, "DROP TRIGGER injected_audit_failure ON audit_events"); e != nil {
		t.Fatal(e)
	}
	if e = s.AddAccount(ctx, p, "Linear", "Codex"); e != nil {
		t.Fatalf("rollback left unusable state: %v", e)
	}
	page, e := s.Audit(ctx, p, 0, 25)
	if e != nil {
		t.Fatal(e)
	}
	count = 0
	for _, event := range page.Events {
		if event.Action == "account.connected" {
			count++
		}
	}
	if count != 1 {
		t.Fatalf("expected exactly one committed audit, got %d", count)
	}
}

func TestFreshPoolAndHTTPServiceRetainDurableState(t *testing.T) {
	s := database(t)
	ctx := context.Background()
	p, auth := login(t, s, "durable@example.com")
	if e := s.AddAccount(ctx, p, "Linear", "Codex"); e != nil {
		t.Fatal(e)
	}
	session, _ := s.Session(ctx, p)
	input := core.HandoffInput{AccountID: session.Accounts[0].ID, Agent: "Codex", TargetOrigin: "https://linear.app", BrowserSessionID: "browser-1", TabID: "tab-1"}
	receipt, _, e := s.CreateHandoff(ctx, p, input, "durable-request")
	if e != nil {
		t.Fatal(e)
	}
	if e = s.SetPaused(ctx, p, true); e != nil {
		t.Fatal(e)
	}
	cfg := s.Pool.Config()
	s.Pool.Close()
	// Reconstruct the entire application data layer and HTTP service with a new
	// PostgreSQL pool. The raw cookie is the only client state carried forward.
	reopened, e := pgxpool.NewWithConfig(ctx, cfg)
	if e != nil {
		t.Fatal(e)
	}
	defer reopened.Close()
	fresh := postgres.New(reopened, 8*time.Hour)
	if e = postgres.Migrate(ctx, reopened); e != nil {
		t.Fatal(e)
	}
	api, e := httpapi.New(fresh, config.Config{AllowedOrigins: map[string]bool{"http://client.test": true}}, slog.New(slog.NewTextHandler(io.Discard, nil)))
	if e != nil {
		t.Fatal(e)
	}
	defer api.Close()
	server := httptest.NewServer(api.Handler())
	defer server.Close()
	r, _ := http.NewRequest("GET", server.URL+"/api/v1/session", nil)
	r.AddCookie(&http.Cookie{Name: httpapi.CookieName, Value: auth.Token})
	response, e := http.DefaultClient.Do(r)
	if e != nil {
		t.Fatal(e)
	}
	defer response.Body.Close()
	var restored core.Session
	if e = json.NewDecoder(response.Body).Decode(&restored); e != nil {
		t.Fatal(e)
	}
	if response.StatusCode != 200 || restored.User.ID != p.UserID || !restored.Workspace.AccessPaused || len(restored.Accounts) != 1 || restored.Accounts[0].ID != input.AccountID {
		t.Fatalf("durability failed: %#v", restored)
	}
	freshPrincipal, e := fresh.Authenticate(ctx, auth.Token)
	if e != nil {
		t.Fatal(e)
	}
	restoredReceipt, e := fresh.Handoff(ctx, freshPrincipal, receipt.ID)
	if e != nil || restoredReceipt.ID != receipt.ID {
		t.Fatalf("handoff missing after reopen: %v", e)
	}
	page, e := fresh.Audit(ctx, freshPrincipal, 0, 25)
	if e != nil || len(page.Events) != 4 {
		t.Fatalf("audit missing after reopen: %#v %v", page, e)
	}
	_, _, e = fresh.CreateHandoff(ctx, freshPrincipal, input, "durable-request")
	wantError(t, e, core.ErrPaused)
}
