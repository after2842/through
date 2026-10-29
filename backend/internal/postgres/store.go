// Package postgres implements durable tenant-scoped state and atomic policy checks.
package postgres

import (
	"context"
	"encoding/json"
	"errors"
	"strconv"
	"time"

	"github.com/jackc/pgx/v5"
	"github.com/jackc/pgx/v5/pgconn"
	"github.com/jackc/pgx/v5/pgxpool"
	"through/backend/internal/core"
)

type Store struct {
	Pool       *pgxpool.Pool
	Identity   core.IdentityProvider
	Browser    core.BrowserAdapter
	SessionTTL time.Duration
}

func New(pool *pgxpool.Pool, ttl time.Duration) *Store {
	return &Store{Pool: pool, Identity: core.DemoIdentity{}, Browser: core.PlaceholderBrowser{}, SessionTTL: ttl}
}
func (s *Store) Ping(ctx context.Context) error { return s.Pool.Ping(ctx) }
func (s *Store) CreateChallenge(ctx context.Context, email string) (*core.Challenge, error) {
	tx, e := s.Pool.Begin(ctx)
	if e != nil {
		return nil, e
	}
	defer tx.Rollback(ctx)
	// Database-backed email throttling is shared across replicas and serialized.
	if _, e = tx.Exec(ctx, "SELECT pg_advisory_xact_lock(hashtextextended($1, 1))", email); e != nil {
		return nil, e
	}
	var count int
	if e = tx.QueryRow(ctx, "SELECT count(*) FROM challenges WHERE email=$1 AND created_at>now()-interval '15 minutes'", email).Scan(&count); e != nil {
		return nil, e
	}
	if count >= 5 {
		return nil, core.ErrRateLimit
	}
	c := &core.Challenge{ID: core.NewID(), Mode: "demo"}
	if e = tx.QueryRow(ctx, "INSERT INTO challenges(id,email,expires_at) VALUES($1,$2,now()+interval '5 minutes') RETURNING expires_at", c.ID, email).Scan(&c.ExpiresAt); e != nil {
		return nil, e
	}
	if e = tx.Commit(ctx); e != nil {
		return nil, e
	}
	return c, nil
}
func (s *Store) VerifyChallenge(ctx context.Context, id, code string) (*core.AuthResult, error) {
	tx, e := s.Pool.Begin(ctx)
	if e != nil {
		return nil, e
	}
	defer tx.Rollback(ctx)
	var email string
	var attempts int
	var valid bool
	e = tx.QueryRow(ctx, "SELECT email,attempts,expires_at>now() AND consumed_at IS NULL FROM challenges WHERE id=$1 FOR UPDATE", id).Scan(&email, &attempts, &valid)
	if errors.Is(e, pgx.ErrNoRows) {
		return nil, core.ErrChallenge
	}
	if e != nil {
		return nil, e
	}
	if !valid {
		return nil, core.ErrChallengeExpired
	}
	if attempts >= 5 {
		return nil, core.ErrChallengeExhausted
	}
	if e = s.Identity.Verify(ctx, code); e != nil {
		if _, e = tx.Exec(ctx, "UPDATE challenges SET attempts=attempts+1 WHERE id=$1", id); e != nil {
			return nil, e
		}
		if e = tx.Commit(ctx); e != nil {
			return nil, e
		}
		if attempts+1 >= 5 {
			return nil, core.ErrChallengeExhausted
		}
		return nil, core.ErrChallenge
	}
	if _, e = tx.Exec(ctx, "SELECT pg_advisory_xact_lock(hashtextextended($1, 1))", email); e != nil {
		return nil, e
	}
	var userID, workspaceID string
	e = tx.QueryRow(ctx, "SELECT u.id,m.workspace_id FROM users u JOIN memberships m ON m.user_id=u.id WHERE u.email=$1 ORDER BY m.workspace_id LIMIT 1", email).Scan(&userID, &workspaceID)
	if errors.Is(e, pgx.ErrNoRows) {
		userID, workspaceID = core.NewID(), core.NewID()
		if _, e = tx.Exec(ctx, "INSERT INTO users(id,email) VALUES($1,$2)", userID, email); e != nil {
			return nil, e
		}
		if _, e = tx.Exec(ctx, "INSERT INTO workspaces(id,name) VALUES($1,'Personal workspace')", workspaceID); e != nil {
			return nil, e
		}
		if _, e = tx.Exec(ctx, "INSERT INTO memberships(workspace_id,user_id,role) VALUES($1,$2,'owner')", workspaceID, userID); e != nil {
			return nil, e
		}
	} else if e != nil {
		return nil, e
	}
	token, csrf := core.NewID()+core.NewID(), core.NewID()+core.NewID()
	if _, e = tx.Exec(ctx, "INSERT INTO sessions(token_hash,user_id,workspace_id,csrf_token,expires_at) VALUES($1,$2,$3,$4,now()+$5::interval)", core.Hash(token), userID, workspaceID, csrf, s.SessionTTL.String()); e != nil {
		return nil, e
	}
	if _, e = tx.Exec(ctx, "UPDATE challenges SET consumed_at=now(),attempts=attempts+1 WHERE id=$1", id); e != nil {
		return nil, e
	}
	p := &core.Principal{UserID: userID, WorkspaceID: workspaceID, SessionHash: core.Hash(token), CSRFToken: csrf}
	if e = audit(ctx, tx, p, "session.signed_in", ""); e != nil {
		return nil, e
	}
	if e = tx.Commit(ctx); e != nil {
		return nil, e
	}
	session, e := s.Session(ctx, p)
	if e != nil {
		return nil, e
	}
	return &core.AuthResult{Session: session, Token: token}, nil
}
func (s *Store) Authenticate(ctx context.Context, token string) (*core.Principal, error) {
	if len(token) < 40 || len(token) > 128 {
		return nil, core.ErrUnauthorized
	}
	p := &core.Principal{SessionHash: core.Hash(token)}
	e := s.Pool.QueryRow(ctx, "SELECT s.user_id,s.workspace_id,s.csrf_token,m.role FROM sessions s JOIN memberships m ON m.workspace_id=s.workspace_id AND m.user_id=s.user_id WHERE s.token_hash=$1 AND s.expires_at>now()", p.SessionHash).Scan(&p.UserID, &p.WorkspaceID, &p.CSRFToken, &p.Role)
	if errors.Is(e, pgx.ErrNoRows) {
		return nil, core.ErrUnauthorized
	}
	if e != nil {
		return nil, e
	}
	return p, nil
}
func (s *Store) Session(ctx context.Context, p *core.Principal) (*core.Session, error) {
	result := &core.Session{Mode: "demo", Accounts: []core.Account{}}
	e := s.Pool.QueryRow(ctx, "SELECT u.id,u.email,u.display_name,m.role,w.id,w.name,w.access_paused,s.csrf_token,s.expires_at FROM sessions s JOIN users u ON u.id=s.user_id JOIN workspaces w ON w.id=s.workspace_id JOIN memberships m ON m.workspace_id=w.id AND m.user_id=u.id WHERE s.token_hash=$1 AND s.workspace_id=$2 AND s.user_id=$3 AND s.expires_at>now()", p.SessionHash, p.WorkspaceID, p.UserID).Scan(&result.User.ID, &result.User.Email, &result.User.DisplayName, &result.User.Role, &result.Workspace.ID, &result.Workspace.Name, &result.Workspace.AccessPaused, &result.CSRFToken, &result.ExpiresAt)
	if errors.Is(e, pgx.ErrNoRows) {
		return nil, core.ErrUnauthorized
	}
	if e != nil {
		return nil, e
	}
	rows, e := s.Pool.Query(ctx, "SELECT id,service,agent,simulated FROM accounts WHERE workspace_id=$1 AND revoked_at IS NULL ORDER BY created_at,id", p.WorkspaceID)
	if e != nil {
		return nil, e
	}
	defer rows.Close()
	for rows.Next() {
		var a core.Account
		if e = rows.Scan(&a.ID, &a.Service, &a.Agent, &a.Simulated); e != nil {
			return nil, e
		}
		result.Accounts = append(result.Accounts, a)
	}
	return result, rows.Err()
}
func audit(ctx context.Context, tx pgx.Tx, p *core.Principal, action, target string) error {
	_, e := tx.Exec(ctx, "INSERT INTO audit_events(workspace_id,actor_id,action,target) VALUES($1,$2,$3,$4)", p.WorkspaceID, p.UserID, action, target)
	return e
}

// lockPolicy serializes account/pause/handoff changes in one workspace. Session
// and role are revalidated inside the transaction, never trusted from the client.
func lockPolicy(ctx context.Context, tx pgx.Tx, p *core.Principal, write bool) (bool, error) {
	var paused bool
	e := tx.QueryRow(ctx, "SELECT access_paused FROM workspaces WHERE id=$1 FOR UPDATE", p.WorkspaceID).Scan(&paused)
	if errors.Is(e, pgx.ErrNoRows) {
		return false, core.ErrUnauthorized
	}
	if e != nil {
		return false, e
	}
	var role string
	e = tx.QueryRow(ctx, "SELECT m.role FROM sessions s JOIN memberships m ON m.workspace_id=s.workspace_id AND m.user_id=s.user_id WHERE s.token_hash=$1 AND s.workspace_id=$2 AND s.user_id=$3 AND s.expires_at>now() FOR SHARE OF s,m", p.SessionHash, p.WorkspaceID, p.UserID).Scan(&role)
	if errors.Is(e, pgx.ErrNoRows) {
		return false, core.ErrUnauthorized
	}
	if e != nil {
		return false, e
	}
	if write && !core.CanWrite(role) {
		return false, core.ErrForbidden
	}
	return paused, nil
}
func (s *Store) mutate(ctx context.Context, p *core.Principal, write bool, fn func(pgx.Tx) error) error {
	tx, e := s.Pool.Begin(ctx)
	if e != nil {
		return e
	}
	defer tx.Rollback(ctx)
	if _, e = lockPolicy(ctx, tx, p, write); e != nil {
		return e
	}
	if e = fn(tx); e != nil {
		return e
	}
	return tx.Commit(ctx)
}
func (s *Store) Logout(ctx context.Context, p *core.Principal) error {
	return s.mutate(ctx, p, false, func(tx pgx.Tx) error {
		if _, e := tx.Exec(ctx, "DELETE FROM sessions WHERE token_hash=$1 AND workspace_id=$2", p.SessionHash, p.WorkspaceID); e != nil {
			return e
		}
		return audit(ctx, tx, p, "session.signed_out", "")
	})
}

// LogoutOthers revokes this user's sessions across all workspaces. Taking a
// per-user advisory lock before workspace/session locks prevents concurrent
// callers in different workspaces from waiting on each other's session rows.
func (s *Store) LogoutOthers(ctx context.Context, p *core.Principal) (int64, error) {
	tx, e := s.Pool.Begin(ctx)
	if e != nil {
		return 0, e
	}
	defer tx.Rollback(ctx)
	if _, e = tx.Exec(ctx, "SELECT pg_advisory_xact_lock(hashtextextended($1, 2))", p.UserID); e != nil {
		return 0, e
	}
	if _, e = lockPolicy(ctx, tx, p, false); e != nil {
		return 0, e
	}
	result, e := tx.Exec(ctx, "DELETE FROM sessions WHERE user_id=$1 AND token_hash<>$2", p.UserID, p.SessionHash)
	if e != nil {
		return 0, e
	}
	count := result.RowsAffected()
	if count > 0 {
		if e = audit(ctx, tx, p, "session.others_signed_out", ""); e != nil {
			return 0, e
		}
	}
	if e = tx.Commit(ctx); e != nil {
		return 0, e
	}
	return count, nil
}

func (s *Store) UpdateProfile(ctx context.Context, p *core.Principal, value string) error {
	displayName, e := core.DisplayName(value)
	if e != nil {
		return e
	}
	return s.mutate(ctx, p, false, func(tx pgx.Tx) error {
		result, e := tx.Exec(ctx, "UPDATE users SET display_name=$1 WHERE id=$2 AND display_name IS DISTINCT FROM $1", displayName, p.UserID)
		if e != nil {
			return e
		}
		if result.RowsAffected() == 0 {
			return nil
		}
		// The new/previous name is intentionally absent from audit metadata.
		return audit(ctx, tx, p, "profile.updated", "")
	})
}
func (s *Store) AddAccount(ctx context.Context, p *core.Principal, service, agent string) error {
	if !core.ValidAccount(service, agent) {
		return core.Invalid("Choose a supported account and agent.")
	}
	return s.mutate(ctx, p, true, func(tx pgx.Tx) error {
		id := core.NewID()
		_, e := tx.Exec(ctx, "INSERT INTO accounts(id,workspace_id,service,agent) VALUES($1,$2,$3,$4)", id, p.WorkspaceID, service, agent)
		var pe *pgconn.PgError
		if errors.As(e, &pe) && pe.Code == "23505" {
			return core.ErrDuplicate
		}
		if e != nil {
			return e
		}
		return audit(ctx, tx, p, "account.connected", service+" / "+agent)
	})
}
func (s *Store) RemoveAccount(ctx context.Context, p *core.Principal, id string) error {
	return s.mutate(ctx, p, true, func(tx pgx.Tx) error {
		var service, agent string
		e := tx.QueryRow(ctx, "UPDATE accounts SET revoked_at=now() WHERE workspace_id=$1 AND id=$2 AND revoked_at IS NULL RETURNING service,agent", p.WorkspaceID, id).Scan(&service, &agent)
		if errors.Is(e, pgx.ErrNoRows) {
			return core.ErrNotFound
		}
		if e != nil {
			return e
		}
		return audit(ctx, tx, p, "account.revoked", service+" / "+agent)
	})
}
func (s *Store) SetPaused(ctx context.Context, p *core.Principal, paused bool) error {
	return s.mutate(ctx, p, true, func(tx pgx.Tx) error {
		r, e := tx.Exec(ctx, "UPDATE workspaces SET access_paused=$1 WHERE id=$2 AND access_paused IS DISTINCT FROM $1", paused, p.WorkspaceID)
		if e != nil {
			return e
		}
		if r.RowsAffected() == 0 {
			return nil
		}
		action := "access.resumed"
		if paused {
			action = "access.paused"
		}
		return audit(ctx, tx, p, action, "")
	})
}
func (s *Store) Audit(ctx context.Context, p *core.Principal, cursor int64, limit int) (*core.AuditPage, error) {
	if e := s.authorizeAdminRead(ctx, p); e != nil {
		return nil, e
	}
	page := &core.AuditPage{Events: []core.AuditEvent{}}
	rows, e := s.Pool.Query(ctx, "SELECT e.id,e.action,u.email,e.occurred_at,e.target FROM audit_events e JOIN users u ON u.id=e.actor_id WHERE e.workspace_id=$1 AND ($2::bigint=0 OR e.id<$2) ORDER BY e.id DESC LIMIT $3", p.WorkspaceID, cursor, limit+1)
	if e != nil {
		return nil, e
	}
	defer rows.Close()
	for rows.Next() {
		var event core.AuditEvent
		if e = rows.Scan(&event.ID, &event.Action, &event.ActorEmail, &event.OccurredAt, &event.Target); e != nil {
			return nil, e
		}
		page.Events = append(page.Events, event)
	}
	if e = rows.Err(); e != nil {
		return nil, e
	}
	if len(page.Events) > limit {
		page.Events = page.Events[:limit]
		page.NextCursor = strconv.FormatInt(page.Events[len(page.Events)-1].ID, 10)
	}
	return page, nil
}

const handoffColumns = "id,account_id,agent,target_origin,browser_session_id,tab_id,status,simulated,created_at,expires_at"

func scanHandoff(row pgx.Row) (*core.Handoff, error) {
	h := &core.Handoff{}
	e := row.Scan(&h.ID, &h.AccountID, &h.Agent, &h.TargetOrigin, &h.BrowserSessionID, &h.TabID, &h.Status, &h.Simulated, &h.CreatedAt, &h.ExpiresAt)
	return h, e
}
func (s *Store) CreateHandoff(ctx context.Context, p *core.Principal, input core.HandoffInput, key string) (*core.Handoff, bool, error) {
	if e := input.Validate(); e != nil {
		return nil, false, e
	}
	tx, e := s.Pool.Begin(ctx)
	if e != nil {
		return nil, false, e
	}
	defer tx.Rollback(ctx)
	paused, e := lockPolicy(ctx, tx, p, true)
	if e != nil {
		return nil, false, e
	}
	if paused {
		return nil, false, core.ErrPaused
	}
	var service, agent string
	e = tx.QueryRow(ctx, "SELECT service,agent FROM accounts WHERE workspace_id=$1 AND id=$2 AND revoked_at IS NULL", p.WorkspaceID, input.AccountID).Scan(&service, &agent)
	if errors.Is(e, pgx.ErrNoRows) {
		return nil, false, core.ErrNotFound
	}
	if e != nil {
		return nil, false, e
	}
	if input.Agent != agent || input.TargetOrigin != core.ServiceOrigins[service] {
		return nil, false, core.Invalid("The origin and agent must match the connected account.")
	}
	// A request key cannot transfer authority to a second actor or new session.
	encoded, _ := json.Marshal(struct {
		Input       core.HandoffInput
		ActorID     string
		SessionHash string
	}{input, p.UserID, p.SessionHash})
	fingerprint := core.Hash(string(encoded))
	var previousHash string
	e = tx.QueryRow(ctx, "SELECT request_hash FROM handoffs WHERE workspace_id=$1 AND idempotency_key=$2", p.WorkspaceID, key).Scan(&previousHash)
	if e == nil {
		if previousHash != fingerprint {
			return nil, false, core.ErrConflict
		}
		h, e := scanHandoff(tx.QueryRow(ctx, "SELECT "+handoffColumns+" FROM handoffs WHERE workspace_id=$1 AND idempotency_key=$2", p.WorkspaceID, key))
		return h, true, e
	}
	if !errors.Is(e, pgx.ErrNoRows) {
		return nil, false, e
	}
	now := time.Now().UTC()
	h := &core.Handoff{ID: core.NewID(), AccountID: input.AccountID, Agent: agent, TargetOrigin: input.TargetOrigin, BrowserSessionID: input.BrowserSessionID, TabID: input.TabID, Simulated: true, CreatedAt: now, ExpiresAt: now.Add(time.Minute)}
	h.Status, e = s.Browser.Consume(ctx, *h)
	if e != nil {
		return nil, false, e
	}
	// The placeholder consumes immediately and has no network effects. A real
	// asynchronous adapter requires a transactional outbox and durable grant worker.
	_, e = tx.Exec(ctx, "INSERT INTO handoffs(id,workspace_id,account_id,agent,target_origin,browser_session_id,tab_id,status,simulated,created_at,expires_at,consumed_at,idempotency_key,request_hash,actor_id,session_hash) VALUES($1,$2,$3,$4,$5,$6,$7,$8,true,$9,$10,$9,$11,$12,$13,$14)", h.ID, p.WorkspaceID, h.AccountID, h.Agent, h.TargetOrigin, h.BrowserSessionID, h.TabID, h.Status, h.CreatedAt, h.ExpiresAt, key, fingerprint, p.UserID, p.SessionHash)
	if e != nil {
		return nil, false, e
	}
	if e = audit(ctx, tx, p, "handoff.simulated", service+" / "+agent); e != nil {
		return nil, false, e
	}
	if e = tx.Commit(ctx); e != nil {
		return nil, false, e
	}
	return h, false, nil
}
func (s *Store) Handoff(ctx context.Context, p *core.Principal, id string) (*core.Handoff, error) {
	if e := s.authorizeAdminRead(ctx, p); e != nil {
		return nil, e
	}
	h, e := scanHandoff(s.Pool.QueryRow(ctx, "SELECT "+handoffColumns+" FROM handoffs WHERE workspace_id=$1 AND id=$2", p.WorkspaceID, id))
	if errors.Is(e, pgx.ErrNoRows) {
		return nil, core.ErrNotFound
	}
	return h, e
}

// Re-read authority instead of relying on a role snapshot from earlier middleware.
func (s *Store) authorizeAdminRead(ctx context.Context, p *core.Principal) error {
	var role string
	e := s.Pool.QueryRow(ctx, "SELECT m.role FROM sessions s JOIN memberships m ON m.workspace_id=s.workspace_id AND m.user_id=s.user_id WHERE s.token_hash=$1 AND s.workspace_id=$2 AND s.user_id=$3 AND s.expires_at>now()", p.SessionHash, p.WorkspaceID, p.UserID).Scan(&role)
	if errors.Is(e, pgx.ErrNoRows) {
		return core.ErrUnauthorized
	}
	if e != nil {
		return e
	}
	if !core.CanWrite(role) {
		return core.ErrForbidden
	}
	return nil
}

// Cleanup only ephemeral identity state. Audit and connection history are retained.
func (s *Store) Cleanup(ctx context.Context) error {
	_, e := s.Pool.Exec(ctx, "DELETE FROM sessions WHERE expires_at<now()-interval '1 day'")
	if e != nil {
		return e
	}
	_, e = s.Pool.Exec(ctx, "DELETE FROM challenges WHERE created_at<now()-interval '1 day'")
	return e
}
