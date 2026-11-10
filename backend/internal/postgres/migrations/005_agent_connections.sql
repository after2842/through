-- OAuth 2.1 authorization for MCP clients ("agent connections").
-- Dynamically registered clients are public (no secret) and must use PKCE.
CREATE TABLE oauth_clients (
  id text PRIMARY KEY,
  name text NOT NULL CHECK (char_length(name) BETWEEN 1 AND 80),
  redirect_uris text[] NOT NULL CHECK (cardinality(redirect_uris) BETWEEN 1 AND 10),
  created_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX oauth_clients_created ON oauth_clients(created_at);

-- A grant is one user's consent for one client to act as one agent in one workspace.
CREATE TABLE oauth_grants (
  id text PRIMARY KEY,
  workspace_id text NOT NULL,
  user_id text NOT NULL,
  client_id text NOT NULL REFERENCES oauth_clients(id),
  client_name text NOT NULL CHECK (char_length(client_name) BETWEEN 1 AND 80),
  redirect_host text NOT NULL CHECK (char_length(redirect_host) BETWEEN 1 AND 253),
  agent text NOT NULL CHECK (agent IN ('Claude','Codex','Cursor')),
  scope text NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  last_used_at timestamptz,
  revoked_at timestamptz,
  FOREIGN KEY (workspace_id,user_id) REFERENCES memberships(workspace_id,user_id)
);
CREATE INDEX oauth_grants_workspace ON oauth_grants(workspace_id,created_at DESC);

-- Authorization codes are single-use, short-lived, and stored only as digests.
CREATE TABLE oauth_codes (
  code_hash text PRIMARY KEY CHECK (length(code_hash)=64),
  client_id text NOT NULL REFERENCES oauth_clients(id),
  workspace_id text NOT NULL,
  user_id text NOT NULL,
  agent text NOT NULL CHECK (agent IN ('Claude','Codex','Cursor')),
  redirect_uri text NOT NULL,
  code_challenge text NOT NULL,
  scope text NOT NULL,
  expires_at timestamptz NOT NULL,
  consumed_at timestamptz,
  grant_id text REFERENCES oauth_grants(id),
  created_at timestamptz NOT NULL DEFAULT now(),
  FOREIGN KEY (workspace_id,user_id) REFERENCES memberships(workspace_id,user_id)
);

-- Refresh tokens rotate on every use; presenting a rotated token revokes the grant.
CREATE TABLE oauth_refresh_tokens (
  token_hash text PRIMARY KEY CHECK (length(token_hash)=64),
  grant_id text NOT NULL REFERENCES oauth_grants(id),
  expires_at timestamptz NOT NULL,
  rotated_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX oauth_refresh_grant ON oauth_refresh_tokens(grant_id);

-- Access tokens are sessions bound to a grant, so existing policy checks
-- (membership, role, pause, revocation) apply unchanged. Cookie authentication
-- rejects these rows, and bearer authentication accepts only these rows.
ALTER TABLE sessions ADD COLUMN oauth_grant_id text REFERENCES oauth_grants(id);
CREATE INDEX sessions_oauth_grant ON sessions(oauth_grant_id) WHERE oauth_grant_id IS NOT NULL;
