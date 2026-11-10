package postgres

import (
	"context"
	"errors"

	"github.com/jackc/pgx/v5"
	"through/backend/internal/core"
)

// RegisterClient stores a public client from RFC 7591 dynamic registration.
// Registration grants nothing: a user must still sign in and consent.
func (s *Store) RegisterClient(ctx context.Context, name string, redirectURIs []string) (*core.OAuthClient, error) {
	if len(redirectURIs) < 1 || len(redirectURIs) > 10 {
		return nil, core.OAuthInvalid("invalid_redirect_uri", "Register between one and ten redirect URIs.")
	}
	seen := map[string]bool{}
	uris := make([]string, 0, len(redirectURIs))
	for _, uri := range redirectURIs {
		if _, e := core.RedirectURI(uri); e != nil {
			return nil, e
		}
		if !seen[uri] {
			seen[uri] = true
			uris = append(uris, uri)
		}
	}
	c := &core.OAuthClient{ID: "thc_" + core.NewID(), Name: core.ClientName(name), RedirectURIs: uris}
	if e := s.Pool.QueryRow(ctx, "INSERT INTO oauth_clients(id,name,redirect_uris) VALUES($1,$2,$3) RETURNING created_at", c.ID, c.Name, c.RedirectURIs).Scan(&c.CreatedAt); e != nil {
		return nil, e
	}
	return c, nil
}

func (s *Store) OAuthClient(ctx context.Context, id string) (*core.OAuthClient, error) {
	if id == "" || len(id) > 64 {
		return nil, core.ErrInvalidClient
	}
	c := &core.OAuthClient{ID: id}
	e := s.Pool.QueryRow(ctx, "SELECT name,redirect_uris,created_at FROM oauth_clients WHERE id=$1", id).Scan(&c.Name, &c.RedirectURIs, &c.CreatedAt)
	if errors.Is(e, pgx.ErrNoRows) {
		return nil, core.ErrInvalidClient
	}
	if e != nil {
		return nil, e
	}
	return c, nil
}

// currentRole re-reads the browser session's membership; it is not trusted from
// the principal snapshot taken by middleware.
func currentRole(ctx context.Context, q interface {
	QueryRow(context.Context, string, ...any) pgx.Row
}, p *core.Principal) (string, error) {
	var role string
	e := q.QueryRow(ctx, "SELECT m.role FROM sessions s JOIN memberships m ON m.workspace_id=s.workspace_id AND m.user_id=s.user_id WHERE s.token_hash=$1 AND s.workspace_id=$2 AND s.user_id=$3 AND s.expires_at>now()", p.SessionHash, p.WorkspaceID, p.UserID).Scan(&role)
	if errors.Is(e, pgx.ErrNoRows) {
		return "", core.ErrUnauthorized
	}
	return role, e
}

// CreateAuthCode records the signed-in user's consent and returns a one-use code.
func (s *Store) CreateAuthCode(ctx context.Context, p *core.Principal, in core.AuthCodeInput) (string, error) {
	if !core.ValidAgent(in.Agent) {
		return "", core.Invalid("Choose which agent this connection signs in as.")
	}
	if !core.ValidCodeChallenge(in.CodeChallenge) {
		return "", core.Invalid("A valid PKCE code challenge is required.")
	}
	client, e := s.OAuthClient(ctx, in.ClientID)
	if e != nil {
		return "", e
	}
	if !core.RedirectMatches(client.RedirectURIs, in.RedirectURI) {
		return "", core.Invalid("That redirect URI is not registered for this client.")
	}
	if _, e = currentRole(ctx, s.Pool, p); e != nil {
		return "", e
	}
	code := "thcode_" + core.NewID() + core.NewID()
	_, e = s.Pool.Exec(ctx, "INSERT INTO oauth_codes(code_hash,client_id,workspace_id,user_id,agent,redirect_uri,code_challenge,scope,expires_at) VALUES($1,$2,$3,$4,$5,$6,$7,$8,now()+$9::interval)",
		core.Hash(code), client.ID, p.WorkspaceID, p.UserID, in.Agent, in.RedirectURI, in.CodeChallenge, in.Scope, core.AuthCodeTTL.String())
	if e != nil {
		return "", e
	}
	return code, nil
}

// issueTokens creates an access token (a grant-bound session) and a refresh token.
func issueTokens(ctx context.Context, tx pgx.Tx, grantID, userID, workspaceID, scope string) (*core.TokenSet, error) {
	access, refresh := "tha_"+core.NewID()+core.NewID(), "thr_"+core.NewID()+core.NewID()
	if _, e := tx.Exec(ctx, "INSERT INTO sessions(token_hash,user_id,workspace_id,csrf_token,expires_at,oauth_grant_id) VALUES($1,$2,$3,$4,now()+$5::interval,$6)",
		core.Hash(access), userID, workspaceID, core.NewID()+core.NewID(), core.AccessTokenTTL.String(), grantID); e != nil {
		return nil, e
	}
	if _, e := tx.Exec(ctx, "INSERT INTO oauth_refresh_tokens(token_hash,grant_id,expires_at) VALUES($1,$2,now()+$3::interval)", core.Hash(refresh), grantID, core.RefreshTokenTTL.String()); e != nil {
		return nil, e
	}
	return &core.TokenSet{AccessToken: access, TokenType: "Bearer", ExpiresIn: int(core.AccessTokenTTL.Seconds()), RefreshToken: refresh, Scope: scope}, nil
}

// revokeGrant ends a connection immediately: access sessions are deleted and
// refresh tokens can no longer rotate.
func revokeGrant(ctx context.Context, tx pgx.Tx, grantID string) error {
	if _, e := tx.Exec(ctx, "UPDATE oauth_grants SET revoked_at=now() WHERE id=$1 AND revoked_at IS NULL", grantID); e != nil {
		return e
	}
	if _, e := tx.Exec(ctx, "DELETE FROM sessions WHERE oauth_grant_id=$1", grantID); e != nil {
		return e
	}
	_, e := tx.Exec(ctx, "UPDATE oauth_refresh_tokens SET rotated_at=now() WHERE grant_id=$1 AND rotated_at IS NULL", grantID)
	return e
}

func (s *Store) ExchangeCode(ctx context.Context, code, clientID, redirectURI, verifier string) (*core.TokenSet, error) {
	if len(code) < 40 || len(code) > 128 {
		return nil, core.ErrInvalidGrant
	}
	tx, e := s.Pool.Begin(ctx)
	if e != nil {
		return nil, e
	}
	defer tx.Rollback(ctx)
	var storedClient, workspaceID, userID, agent, storedRedirect, challenge, scope, clientName string
	var valid, consumed bool
	var previousGrant *string
	e = tx.QueryRow(ctx, "SELECT c.client_id,c.workspace_id,c.user_id,c.agent,c.redirect_uri,c.code_challenge,c.scope,c.expires_at>now(),c.consumed_at IS NOT NULL,c.grant_id,o.name FROM oauth_codes c JOIN oauth_clients o ON o.id=c.client_id WHERE c.code_hash=$1 FOR UPDATE OF c", core.Hash(code)).
		Scan(&storedClient, &workspaceID, &userID, &agent, &storedRedirect, &challenge, &scope, &valid, &consumed, &previousGrant, &clientName)
	if errors.Is(e, pgx.ErrNoRows) {
		return nil, core.ErrInvalidGrant
	}
	if e != nil {
		return nil, e
	}
	if consumed {
		// A replayed code suggests interception: revoke what it produced (RFC 6749 §4.1.2).
		if previousGrant != nil {
			if e = revokeGrant(ctx, tx, *previousGrant); e != nil {
				return nil, e
			}
			if e = audit(ctx, tx, &core.Principal{UserID: userID, WorkspaceID: workspaceID}, "agent_connection.revoked", clientName+" as "+agent+" (code replay)"); e != nil {
				return nil, e
			}
			if e = tx.Commit(ctx); e != nil {
				return nil, e
			}
		}
		return nil, core.ErrInvalidGrant
	}
	if !valid || storedClient != clientID || storedRedirect != redirectURI || !core.VerifyPKCE(verifier, challenge) {
		return nil, core.ErrInvalidGrant
	}
	grantID := "thg_" + core.NewID()
	if _, e = tx.Exec(ctx, "INSERT INTO oauth_grants(id,workspace_id,user_id,client_id,client_name,redirect_host,agent,scope) VALUES($1,$2,$3,$4,$5,$6,$7,$8)",
		grantID, workspaceID, userID, clientID, clientName, core.RedirectLabel(redirectURI), agent, scope); e != nil {
		return nil, e
	}
	if _, e = tx.Exec(ctx, "UPDATE oauth_codes SET consumed_at=now(),grant_id=$2 WHERE code_hash=$1", core.Hash(code), grantID); e != nil {
		return nil, e
	}
	tokens, e := issueTokens(ctx, tx, grantID, userID, workspaceID, scope)
	if e != nil {
		return nil, e
	}
	if e = audit(ctx, tx, &core.Principal{UserID: userID, WorkspaceID: workspaceID}, "agent_connection.authorized", clientName+" as "+agent); e != nil {
		return nil, e
	}
	if e = tx.Commit(ctx); e != nil {
		return nil, e
	}
	return tokens, nil
}

func (s *Store) RefreshTokens(ctx context.Context, refreshToken, clientID string) (*core.TokenSet, error) {
	if len(refreshToken) < 40 || len(refreshToken) > 128 {
		return nil, core.ErrInvalidGrant
	}
	tx, e := s.Pool.Begin(ctx)
	if e != nil {
		return nil, e
	}
	defer tx.Rollback(ctx)
	var grantID, grantClient, userID, workspaceID, scope, clientName, agent string
	var valid, rotated, revoked bool
	e = tx.QueryRow(ctx, "SELECT r.grant_id,r.expires_at>now(),r.rotated_at IS NOT NULL,g.client_id,g.revoked_at IS NOT NULL,g.user_id,g.workspace_id,g.scope,g.client_name,g.agent FROM oauth_refresh_tokens r JOIN oauth_grants g ON g.id=r.grant_id WHERE r.token_hash=$1 FOR UPDATE OF r,g", core.Hash(refreshToken)).
		Scan(&grantID, &valid, &rotated, &grantClient, &revoked, &userID, &workspaceID, &scope, &clientName, &agent)
	if errors.Is(e, pgx.ErrNoRows) {
		return nil, core.ErrInvalidGrant
	}
	if e != nil {
		return nil, e
	}
	if grantClient != clientID || revoked {
		return nil, core.ErrInvalidGrant
	}
	if rotated {
		// Reuse of a rotated refresh token: assume theft and end the connection.
		if e = revokeGrant(ctx, tx, grantID); e != nil {
			return nil, e
		}
		if e = audit(ctx, tx, &core.Principal{UserID: userID, WorkspaceID: workspaceID}, "agent_connection.revoked", clientName+" as "+agent+" (refresh token reuse)"); e != nil {
			return nil, e
		}
		if e = tx.Commit(ctx); e != nil {
			return nil, e
		}
		return nil, core.ErrInvalidGrant
	}
	if !valid {
		return nil, core.ErrInvalidGrant
	}
	if _, e = tx.Exec(ctx, "UPDATE oauth_refresh_tokens SET rotated_at=now() WHERE token_hash=$1", core.Hash(refreshToken)); e != nil {
		return nil, e
	}
	tokens, e := issueTokens(ctx, tx, grantID, userID, workspaceID, scope)
	if e != nil {
		return nil, e
	}
	if e = tx.Commit(ctx); e != nil {
		return nil, e
	}
	return tokens, nil
}

// AuthenticateBearer accepts only access tokens of live grants. It returns the
// agent the user chose for this connection at consent time.
func (s *Store) AuthenticateBearer(ctx context.Context, token string) (*core.Principal, string, error) {
	if len(token) < 40 || len(token) > 128 {
		return nil, "", core.ErrUnauthorized
	}
	p := &core.Principal{SessionHash: core.Hash(token)}
	var agent, grantID string
	var stale bool
	e := s.Pool.QueryRow(ctx, "SELECT s.user_id,s.workspace_id,s.csrf_token,m.role,g.agent,g.id,g.last_used_at IS NULL OR g.last_used_at<now()-interval '5 minutes' FROM sessions s JOIN memberships m ON m.workspace_id=s.workspace_id AND m.user_id=s.user_id JOIN oauth_grants g ON g.id=s.oauth_grant_id WHERE s.token_hash=$1 AND s.expires_at>now() AND g.revoked_at IS NULL", p.SessionHash).
		Scan(&p.UserID, &p.WorkspaceID, &p.CSRFToken, &p.Role, &agent, &grantID, &stale)
	if errors.Is(e, pgx.ErrNoRows) {
		return nil, "", core.ErrUnauthorized
	}
	if e != nil {
		return nil, "", e
	}
	if stale {
		if _, e = s.Pool.Exec(ctx, "UPDATE oauth_grants SET last_used_at=now() WHERE id=$1", grantID); e != nil {
			return nil, "", e
		}
	}
	return p, agent, nil
}

// AgentConnections lists live grants: owners and admins see the workspace's,
// other roles see only their own.
func (s *Store) AgentConnections(ctx context.Context, p *core.Principal) ([]core.AgentConnection, error) {
	role, e := currentRole(ctx, s.Pool, p)
	if e != nil {
		return nil, e
	}
	rows, e := s.Pool.Query(ctx, "SELECT g.id,g.client_name,g.redirect_host,g.agent,u.email,g.user_id=$2,g.created_at,g.last_used_at FROM oauth_grants g JOIN users u ON u.id=g.user_id WHERE g.workspace_id=$1 AND g.revoked_at IS NULL AND ($3 OR g.user_id=$2) ORDER BY g.created_at DESC, g.id LIMIT 100", p.WorkspaceID, p.UserID, core.CanWrite(role))
	if e != nil {
		return nil, e
	}
	defer rows.Close()
	result := []core.AgentConnection{}
	for rows.Next() {
		var c core.AgentConnection
		if e = rows.Scan(&c.ID, &c.ClientName, &c.RedirectHost, &c.Agent, &c.UserEmail, &c.Mine, &c.CreatedAt, &c.LastUsedAt); e != nil {
			return nil, e
		}
		result = append(result, c)
	}
	return result, rows.Err()
}

func (s *Store) RevokeAgentConnection(ctx context.Context, p *core.Principal, id string) error {
	if id == "" || len(id) > 64 {
		return core.ErrNotFound
	}
	return s.mutate(ctx, p, false, func(tx pgx.Tx) error {
		var owner, clientName, agent string
		e := tx.QueryRow(ctx, "SELECT user_id,client_name,agent FROM oauth_grants WHERE workspace_id=$1 AND id=$2 AND revoked_at IS NULL FOR UPDATE", p.WorkspaceID, id).Scan(&owner, &clientName, &agent)
		if errors.Is(e, pgx.ErrNoRows) {
			return core.ErrNotFound
		}
		if e != nil {
			return e
		}
		if owner != p.UserID {
			role, e := currentRole(ctx, tx, p)
			if e != nil {
				return e
			}
			if !core.CanWrite(role) {
				return core.ErrNotFound
			}
		}
		if e = revokeGrant(ctx, tx, id); e != nil {
			return e
		}
		return audit(ctx, tx, p, "agent_connection.revoked", clientName+" as "+agent)
	})
}

// cleanupOAuth removes expired codes and tokens and abandoned registrations.
// Grants, including revoked ones, are retained with the audit history.
func (s *Store) cleanupOAuth(ctx context.Context) error {
	for _, statement := range []string{
		"DELETE FROM oauth_codes WHERE created_at<now()-interval '1 day'",
		"DELETE FROM oauth_refresh_tokens WHERE expires_at<now()-interval '1 day' OR (rotated_at IS NOT NULL AND rotated_at<now()-interval '30 days')",
		"DELETE FROM oauth_clients c WHERE c.created_at<now()-interval '1 day' AND NOT EXISTS(SELECT 1 FROM oauth_grants g WHERE g.client_id=c.id) AND NOT EXISTS(SELECT 1 FROM oauth_codes o WHERE o.client_id=c.id)",
	} {
		if _, e := s.Pool.Exec(ctx, statement); e != nil {
			return e
		}
	}
	return nil
}
