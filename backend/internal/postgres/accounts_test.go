package postgres_test

import (
	"context"
	"encoding/json"
	"errors"
	"io"
	"log/slog"
	"net/http"
	"net/http/httptest"
	"os"
	"slices"
	"strconv"
	"strings"
	"testing"
	"time"

	"github.com/jackc/pgx/v5/pgxpool"
	"through/backend/internal/config"
	"through/backend/internal/core"
	"through/backend/internal/httpapi"
	"through/backend/internal/postgres"
)

func connectionInput() core.AccountInput {
	return core.AccountInput{Service: "Example portal", Origin: "https://portal.example.com", Username: "alex@example.com", Agents: []string{"Codex", "Claude"}}
}

func connection(t *testing.T, s *postgres.Store, p *core.Principal) core.Account {
	t.Helper()
	session, e := s.Session(context.Background(), p)
	if e != nil || len(session.Accounts) != 1 {
		t.Fatalf("expected one connection: %#v %v", session, e)
	}
	return session.Accounts[0]
}

func TestConnectionMetadataPermissionsAndReplay(t *testing.T) {
	s := database(t)
	ctx := context.Background()
	p, _ := login(t, s, "connections@example.com")
	input := connectionInput()
	input.Origin = "https://PORTAL.example.com/"
	input.Username = " alex@example.com "
	if e := s.CreateAccount(ctx, p, input); e != nil {
		t.Fatal(e)
	}
	a := connection(t, s, p)
	if a.Origin != "https://portal.example.com" || a.Username != "alex@example.com" || !slices.Equal(a.Agents, input.Agents) || a.Agent != "Codex" || a.CredentialVersion != 1 || a.CreatedAt.IsZero() || a.CredentialUpdatedAt.IsZero() || !a.Simulated {
		t.Fatalf("incorrect normalized metadata: %#v", a)
	}
	input.Agents = []string{"Cursor"}
	wantError(t, s.CreateAccount(ctx, p, input), core.ErrDuplicate)
	if e := s.UpdateCredential(ctx, p, a.ID); e != nil {
		t.Fatal(e)
	}
	updated := connection(t, s, p)
	if updated.CredentialVersion != 2 || !updated.CredentialUpdatedAt.After(a.CredentialUpdatedAt) || updated.CreatedAt != a.CreatedAt {
		t.Fatal("credential metadata did not update independently of creation time")
	}
	browser := &countingBrowser{}
	s.Browser = browser
	grant := core.HandoffInput{AccountID: a.ID, Agent: "Claude", TargetOrigin: a.Origin, BrowserSessionID: "browser", TabID: "tab"}
	if _, _, e := s.CreateHandoff(ctx, p, grant, "permission-replay"); e != nil {
		t.Fatal(e)
	}
	if e := s.SetAccountAgents(ctx, p, a.ID, []string{"Codex"}); e != nil {
		t.Fatal(e)
	}
	for _, key := range []string{"permission-replay", "new-attempt-key"} {
		_, _, e := s.CreateHandoff(ctx, p, grant, key)
		var apiErr *core.Error
		if !errors.As(e, &apiErr) || apiErr.Status != 400 {
			t.Fatalf("revoked agent returned success: %v", e)
		}
	}
	grant.Agent = "Codex"
	if _, _, e := s.CreateHandoff(ctx, p, grant, "remaining-agent"); e != nil {
		t.Fatal("revoking one agent prevented a remaining permission")
	}
	if e := s.SetAccountAgents(ctx, p, a.ID, []string{}); e != nil {
		t.Fatal(e)
	}
	updated = connection(t, s, p)
	if updated.Agent != "" || updated.Agents == nil || len(updated.Agents) != 0 {
		t.Fatalf("last-agent revocation did not return explicit empty grants: %#v", updated)
	}
	if _, _, e := s.CreateHandoff(ctx, p, grant, "remaining-agent"); e == nil {
		t.Fatal("last-agent revocation did not override cached success")
	}
	if browser.calls.Load() != 2 {
		t.Fatalf("denied replay invoked browser: %d calls", browser.calls.Load())
	}
	if e := s.SetAccountAgents(ctx, p, a.ID, []string{"Cursor", "Claude"}); e != nil {
		t.Fatal(e)
	}
	updated = connection(t, s, p)
	if updated.Agent != "Cursor" || !slices.Equal(updated.Agents, []string{"Cursor", "Claude"}) {
		t.Fatal("permission order was not persisted")
	}
}

func TestConnectionScopedAuditIsolationAndRoles(t *testing.T) {
	s := database(t)
	ctx := context.Background()
	p, _ := login(t, s, "owner@example.com")
	other, _ := login(t, s, "other@example.com")
	if e := s.CreateAccount(ctx, p, connectionInput()); e != nil {
		t.Fatal(e)
	}
	a := connection(t, s, p)
	for _, role := range []string{"member", "viewer"} {
		if _, e := s.Pool.Exec(ctx, "UPDATE memberships SET role=$1 WHERE workspace_id=$2 AND user_id=$3", role, p.WorkspaceID, p.UserID); e != nil {
			t.Fatal(e)
		}
		wantError(t, s.CreateAccount(ctx, p, connectionInput()), core.ErrForbidden)
		wantError(t, s.SetAccountAgents(ctx, p, a.ID, []string{}), core.ErrForbidden)
		wantError(t, s.SetAccountAgent(ctx, p, a.ID, "Claude", false), core.ErrForbidden)
		wantError(t, s.UpdateCredential(ctx, p, a.ID), core.ErrForbidden)
		_, e := s.Audit(ctx, p, 0, 25, a.ID)
		wantError(t, e, core.ErrForbidden)
	}
	if _, e := s.Pool.Exec(ctx, "UPDATE memberships SET role='admin' WHERE workspace_id=$1 AND user_id=$2", p.WorkspaceID, p.UserID); e != nil {
		t.Fatal(e)
	}
	wantError(t, s.SetAccountAgents(ctx, other, a.ID, []string{}), core.ErrNotFound)
	wantError(t, s.SetAccountAgent(ctx, other, a.ID, "Claude", false), core.ErrNotFound)
	wantError(t, s.UpdateCredential(ctx, other, a.ID), core.ErrNotFound)
	_, e := s.Audit(ctx, other, 0, 25, a.ID)
	wantError(t, e, core.ErrNotFound)
	for i := 0; i < 3; i++ {
		if e := s.UpdateCredential(ctx, p, a.ID); e != nil {
			t.Fatal(e)
		}
	}
	if e := s.AddAccount(ctx, p, "GitHub", "Cursor"); e != nil {
		t.Fatal(e)
	}
	page, e := s.Audit(ctx, p, 0, 2, a.ID)
	if e != nil || len(page.Events) != 2 || page.NextCursor == "" {
		t.Fatalf("filtered pagination: %#v %v", page, e)
	}
	cursor, _ := strconv.ParseInt(page.NextCursor, 10, 64)
	older, e := s.Audit(ctx, p, cursor, 2, a.ID)
	if e != nil || len(older.Events) != 2 || older.NextCursor != "" {
		t.Fatalf("filtered second page: %#v %v", older, e)
	}
	for _, event := range append(page.Events, older.Events...) {
		if event.AccountID != a.ID || !strings.HasPrefix(event.Target, a.Service) || strings.Contains(event.Target, a.Username) || event.Action == "session.signed_in" {
			t.Fatalf("scoped audit contains another target or personal login: %#v", event)
		}
	}
	if e := s.RemoveAccount(ctx, p, a.ID); e != nil {
		t.Fatal(e)
	}
	page, e = s.Audit(ctx, p, 0, 25, a.ID)
	if e != nil || len(page.Events) != 5 || page.Events[0].Action != "account.revoked" {
		t.Fatalf("disconnected account history was lost: %#v %v", page, e)
	}
	wantError(t, s.UpdateCredential(ctx, p, a.ID), core.ErrNotFound)
	wantError(t, s.SetAccountAgents(ctx, p, a.ID, []string{"Codex"}), core.ErrNotFound)
}

func TestWaitingHandoffObservesAgentRevocation(t *testing.T) {
	s := database(t)
	ctx, cancel := context.WithTimeout(context.Background(), 5*time.Second)
	defer cancel()
	p, _ := login(t, s, "waiting-permission@example.com")
	if e := s.CreateAccount(ctx, p, connectionInput()); e != nil {
		t.Fatal(e)
	}
	a := connection(t, s, p)
	input := core.HandoffInput{AccountID: a.ID, Agent: "Claude", TargetOrigin: a.Origin, BrowserSessionID: "browser", TabID: "tab"}
	if _, _, e := s.CreateHandoff(ctx, p, input, "waiting-replay-key"); e != nil {
		t.Fatal(e)
	}
	tx, e := s.Pool.Begin(ctx)
	if e != nil {
		t.Fatal(e)
	}
	defer tx.Rollback(ctx)
	if _, e = tx.Exec(ctx, "SELECT id FROM workspaces WHERE id=$1 FOR UPDATE", p.WorkspaceID); e != nil {
		t.Fatal(e)
	}
	result := make(chan error, 1)
	go func() { _, _, e := s.CreateHandoff(ctx, p, input, "waiting-replay-key"); result <- e }()
	if _, e = tx.Exec(ctx, "DELETE FROM account_agents WHERE workspace_id=$1 AND account_id=$2 AND agent='Claude'", p.WorkspaceID, a.ID); e != nil {
		t.Fatal(e)
	}
	if e = tx.Commit(ctx); e != nil {
		t.Fatal(e)
	}
	if e = <-result; e == nil {
		t.Fatal("waiting replay used a revoked agent permission")
	}
}

func TestConnectionChangesRollbackWithAuditFailure(t *testing.T) {
	s := database(t)
	ctx := context.Background()
	p, _ := login(t, s, "rollback@example.com")
	if e := s.CreateAccount(ctx, p, connectionInput()); e != nil {
		t.Fatal(e)
	}
	a := connection(t, s, p)
	if _, e := s.Pool.Exec(ctx, `CREATE FUNCTION reject_connection_audit() RETURNS trigger LANGUAGE plpgsql AS $$ BEGIN RAISE EXCEPTION 'injected audit failure'; END $$; CREATE TRIGGER reject_connection_audit BEFORE INSERT ON audit_events FOR EACH ROW WHEN (NEW.action IN ('account.agents_updated','credential.updated','account.revoked')) EXECUTE FUNCTION reject_connection_audit()`); e != nil {
		t.Fatal(e)
	}
	if e := s.SetAccountAgents(ctx, p, a.ID, []string{}); e == nil {
		t.Fatal("permission change committed without its audit")
	}
	if e := s.SetAccountAgent(ctx, p, a.ID, "Claude", false); e == nil {
		t.Fatal("single permission change committed without its audit")
	}
	if e := s.UpdateCredential(ctx, p, a.ID); e == nil {
		t.Fatal("credential update committed without its audit")
	}
	if e := s.RemoveAccount(ctx, p, a.ID); e == nil {
		t.Fatal("disconnect committed without its audit")
	}
	unchanged := connection(t, s, p)
	if !slices.Equal(unchanged.Agents, a.Agents) || unchanged.Agent != a.Agent || unchanged.CredentialVersion != a.CredentialVersion || !unchanged.CredentialUpdatedAt.Equal(a.CredentialUpdatedAt) {
		t.Fatalf("rollback did not restore account metadata: %#v", unchanged)
	}
}

func TestConnectionHTTPRejectsSecretsAndInvalidMetadata(t *testing.T) {
	s := database(t)
	p, auth := login(t, s, "http-connection@example.com")
	api, e := httpapi.New(s, config.Config{AllowedOrigins: map[string]bool{"http://client.test": true}}, slog.New(slog.NewTextHandler(io.Discard, nil)))
	if e != nil {
		t.Fatal(e)
	}
	defer api.Close()
	h := api.Handler()
	call := func(method, path, body string, csrf bool) *httptest.ResponseRecorder {
		r := httptest.NewRequest(method, path, strings.NewReader(body))
		r.AddCookie(&http.Cookie{Name: httpapi.CookieName, Value: auth.Token})
		r.Header.Set("Origin", "http://client.test")
		r.Header.Set("Content-Type", "application/json")
		if csrf {
			r.Header.Set("X-CSRF-Token", p.CSRFToken)
		}
		w := httptest.NewRecorder()
		h.ServeHTTP(w, r)
		return w
	}
	for _, body := range []string{
		`{"service":"GitHub","agent":"Codex","password":"fixture-only"}`,
		`{"service":"GitHub","origin":"https://github.com","username":"alex","agents":["Claude"],"password":"fixture-only"}`,
		`{"service":"GitHub","origin":"https://github.com","username":"alex","agents":[]}`,
		`{"service":"GitHub","origin":"https://github.com","username":"alex","agents":["Claude","Claude"]}`,
		`{"service":"GitHub","origin":"https://evil.example.com","username":"alex","agents":["Claude"]}`,
		`{"service":"Custom","origin":"http://localhost","username":"alex","agents":["Claude"]}`,
		`{"service":"Custom","origin":"https://example.com/login","username":"alex","agents":["Claude"]}`,
		`{"service":"Custom","origin":"https://example.com:443","username":"alex","agents":["Claude"]}`,
		`{"service":"Custom","origin":"https://10.0.0.1","username":"alex","agents":["Claude"]}`,
		`{"service":"Custom","origin":"https://example.com","username":null,"agents":["Claude"]}`,
	} {
		if w := call("POST", "/api/v1/accounts", body, true); w.Code != 400 {
			t.Fatalf("invalid account status %d: %s", w.Code, w.Body)
		}
	}
	input, _ := json.Marshal(connectionInput())
	w := call("POST", "/api/v1/accounts", string(input), true)
	if w.Code != 200 {
		t.Fatalf("custom connection: %d %s", w.Code, w.Body)
	}
	a := connection(t, s, p)
	base := "/api/v1/accounts/" + a.ID
	for _, tt := range []struct {
		method, path, body string
		csrf               bool
		status             int
	}{
		{"PATCH", base + "/agents", `{"agents":[]}`, false, 403},
		{"PATCH", base + "/agents", `{}`, true, 400},
		{"PATCH", base + "/agents", `{"agents":null}`, true, 400},
		{"PATCH", base + "/agents", `{"agents":["Unknown"]}`, true, 400},
		{"PATCH", base + "/agents", `{"agents":[],"role":"owner"}`, true, 400},
		{"POST", base + "/credential", "", false, 403},
		{"POST", base + "/credential", `{"password":"fixture-only"}`, true, 400},
		{"POST", base + "/credential", `{}`, true, 400},
		{"POST", base + "/credential", "", true, 200},
		{"PUT", base + "/agents/Cursor", "", false, 403},
		{"PUT", base + "/agents/Unknown", "", true, 400},
		{"DELETE", base + "/agents/Codex", `{"password":"fixture-only"}`, true, 400},
		{"PUT", base + "/agents/Cursor", "", true, 200},
		{"DELETE", base + "/agents/Cursor", "", true, 200},
		{"PATCH", base + "/agents", `{"agents":[]}`, true, 200},
		{"GET", "/api/v1/audit?accountId=" + a.ID + "&limit=1", "", false, 200},
		{"GET", "/api/v1/audit?accountId=missing", "", false, 404},
	} {
		w := call(tt.method, tt.path, tt.body, tt.csrf)
		if w.Code != tt.status {
			t.Fatalf("%s %s: %d %s", tt.method, tt.path, w.Code, w.Body)
		}
	}
	if current := connection(t, s, p); current.CredentialVersion != 2 || len(current.Agents) != 0 {
		t.Fatal("HTTP metadata changes did not persist")
	}
}

func TestConcurrentSingleAgentRevocationsPreserveBothChanges(t *testing.T) {
	s := database(t)
	ctx, cancel := context.WithTimeout(context.Background(), 5*time.Second)
	defer cancel()
	p, _ := login(t, s, "atomic-permissions@example.com")
	second, _ := login(t, s, "atomic-permissions@example.com")
	if e := s.CreateAccount(ctx, p, connectionInput()); e != nil {
		t.Fatal(e)
	}
	a := connection(t, s, p)
	// Both browser sessions loaded [Codex, Claude]. Each removes a different
	// agent; neither operation may regrant the other session's revoked agent.
	start := make(chan struct{})
	results := make(chan error, 2)
	for _, operation := range []struct {
		p     *core.Principal
		agent string
	}{{p, "Codex"}, {second, "Claude"}} {
		go func() {
			<-start
			results <- s.SetAccountAgent(ctx, operation.p, a.ID, operation.agent, false)
		}()
	}
	close(start)
	for range 2 {
		if e := <-results; e != nil {
			t.Fatal(e)
		}
	}
	if updated := connection(t, s, p); len(updated.Agents) != 0 || updated.Agent != "" {
		t.Fatalf("one removal restored the other permission: %#v", updated.Agents)
	}
	// Repeating an already applied single-agent operation has no new effect.
	if e := s.SetAccountAgent(ctx, p, a.ID, "Claude", false); e != nil {
		t.Fatal(e)
	}
	for range 2 {
		if e := s.SetAccountAgent(ctx, p, a.ID, "Cursor", true); e != nil {
			t.Fatal(e)
		}
	}
	if updated := connection(t, s, p); !slices.Equal(updated.Agents, []string{"Cursor"}) || updated.Agent != "Cursor" {
		t.Fatalf("single-agent allow did not preserve current state: %#v", updated.Agents)
	}
	var changes int
	if e := s.Pool.QueryRow(ctx, "SELECT count(*) FROM audit_events WHERE workspace_id=$1 AND account_id=$2 AND action='account.agents_updated'", p.WorkspaceID, a.ID).Scan(&changes); e != nil || changes != 3 {
		t.Fatalf("expected two revocations and one allow audit, got %d: %v", changes, e)
	}
}

func TestConnectionMigrationPreservesLegacyRows(t *testing.T) {
	dsn := os.Getenv("THROUGH_TEST_DATABASE_URL")
	if dsn == "" {
		t.Skip("set THROUGH_TEST_DATABASE_URL to run PostgreSQL integration tests")
	}
	ctx := context.Background()
	admin, e := pgxpool.New(ctx, dsn)
	if e != nil {
		t.Fatal(e)
	}
	defer admin.Close()
	schema := "migration_" + strings.ToLower(core.NewID())
	if _, e = admin.Exec(ctx, "CREATE SCHEMA "+schema); e != nil {
		t.Fatal(e)
	}
	defer admin.Exec(ctx, "DROP SCHEMA "+schema+" CASCADE")
	cfg, e := pgxpool.ParseConfig(dsn)
	if e != nil {
		t.Fatal(e)
	}
	cfg.ConnConfig.RuntimeParams["search_path"] = schema
	pool, e := pgxpool.NewWithConfig(ctx, cfg)
	if e != nil {
		t.Fatal(e)
	}
	defer pool.Close()
	if _, e = pool.Exec(ctx, "CREATE TABLE schema_migrations(version text PRIMARY KEY, applied_at timestamptz NOT NULL DEFAULT now())"); e != nil {
		t.Fatal(e)
	}
	for _, name := range []string{"001_initial.sql", "002_handoff_actor_binding.sql", "003_user_settings.sql"} {
		content, e := os.ReadFile("migrations/" + name)
		if e != nil {
			t.Fatal(e)
		}
		if _, e = pool.Exec(ctx, string(content)); e != nil {
			t.Fatal(e)
		}
		if _, e = pool.Exec(ctx, "INSERT INTO schema_migrations(version) VALUES($1)", "migrations/"+name); e != nil {
			t.Fatal(e)
		}
	}
	if _, e = pool.Exec(ctx, `INSERT INTO workspaces(id,name) VALUES('workspace','Migration fixture'); INSERT INTO users(id,email) VALUES('user','legacy@example.com'); INSERT INTO memberships(workspace_id,user_id,role) VALUES('workspace','user','owner'); INSERT INTO accounts(id,workspace_id,service,agent) VALUES('one','workspace','Linear','Codex'),('two','workspace','Linear','Claude'); INSERT INTO audit_events(workspace_id,actor_id,action,target) VALUES('workspace','user','account.connected','Linear / Codex');`); e != nil {
		t.Fatal(e)
	}
	if e = postgres.Migrate(ctx, pool); e != nil {
		t.Fatal(e)
	}
	if e = postgres.Migrate(ctx, pool); e != nil {
		t.Fatal(e)
	}
	token := core.NewID() + core.NewID()
	if _, e = pool.Exec(ctx, "INSERT INTO sessions(token_hash,user_id,workspace_id,csrf_token,expires_at) VALUES($1,'user','workspace','csrf',now()+interval '1 hour')", core.Hash(token)); e != nil {
		t.Fatal(e)
	}
	s := postgres.New(pool, time.Hour)
	p, e := s.Authenticate(ctx, token)
	if e != nil {
		t.Fatal(e)
	}
	session, e := s.Session(ctx, p)
	if e != nil || len(session.Accounts) != 2 {
		t.Fatalf("legacy duplicate-origin accounts lost: %#v %v", session, e)
	}
	for _, a := range session.Accounts {
		if a.Origin != "https://linear.app" || a.Username != "" || a.CredentialVersion != 1 || !a.CredentialUpdatedAt.Equal(a.CreatedAt) || len(a.Agents) != 1 || a.Agent != a.Agents[0] {
			t.Fatalf("legacy metadata changed: %#v", a)
		}
	}
	// Changing all grants must not cause a uniqueness conflict between old rows.
	for _, id := range []string{"one", "two"} {
		if e = s.SetAccountAgents(ctx, p, id, []string{}); e != nil {
			t.Fatal(e)
		}
	}
	var preserved string
	if e = pool.QueryRow(ctx, "SELECT target FROM audit_events WHERE action='account.connected'").Scan(&preserved); e != nil || preserved != "Linear / Codex" {
		t.Fatal("migration modified historical audit")
	}
}
