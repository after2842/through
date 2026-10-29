-- Keep every old account and receipt. Old rows have no submitted username, so
-- their identities remain separate instead of merging different agent grants.
ALTER TABLE accounts DROP CONSTRAINT accounts_service_check;
ALTER TABLE accounts DROP CONSTRAINT accounts_agent_check;
ALTER TABLE accounts ADD CONSTRAINT accounts_service_length CHECK (char_length(service) BETWEEN 1 AND 80);
ALTER TABLE accounts ADD CONSTRAINT accounts_agent_check CHECK (agent IN ('','Claude','Codex','Cursor'));
ALTER TABLE accounts ADD COLUMN origin text;
ALTER TABLE accounts ADD COLUMN username text NOT NULL DEFAULT '' CHECK (char_length(username) <= 254);
ALTER TABLE accounts ADD COLUMN credential_version integer NOT NULL DEFAULT 1 CHECK (credential_version > 0);
ALTER TABLE accounts ADD COLUMN credential_updated_at timestamptz;
UPDATE accounts SET origin=CASE service WHEN 'GitHub' THEN 'https://github.com' WHEN 'Linear' THEN 'https://linear.app' WHEN 'Notion' THEN 'https://www.notion.so' END, credential_updated_at=created_at;
ALTER TABLE accounts ALTER COLUMN origin SET NOT NULL;
ALTER TABLE accounts ADD CONSTRAINT accounts_origin_length CHECK (char_length(origin) BETWEEN 10 AND 261);
ALTER TABLE accounts ALTER COLUMN credential_updated_at SET NOT NULL;
ALTER TABLE accounts ALTER COLUMN credential_updated_at SET DEFAULT now();
DROP INDEX account_active_identity;
CREATE UNIQUE INDEX account_active_identity ON accounts(workspace_id,origin,username) WHERE revoked_at IS NULL AND username<>'';
-- Empty usernames are reserved for the compatibility endpoint / migrated rows.
-- They retain their original per-agent identity when permissions are changed.
ALTER TABLE accounts ADD COLUMN legacy_agent text;
UPDATE accounts SET legacy_agent=agent;
CREATE UNIQUE INDEX account_legacy_identity ON accounts(workspace_id,origin,legacy_agent) WHERE revoked_at IS NULL AND username='';
CREATE TABLE account_agents (
  workspace_id text NOT NULL,
  account_id text NOT NULL,
  agent text NOT NULL CHECK (agent IN ('Claude','Codex','Cursor')),
  position integer NOT NULL CHECK (position BETWEEN 0 AND 2),
  PRIMARY KEY (workspace_id,account_id,agent),
  UNIQUE (workspace_id,account_id,position),
  FOREIGN KEY (workspace_id,account_id) REFERENCES accounts(workspace_id,id)
);
INSERT INTO account_agents(workspace_id,account_id,agent,position) SELECT workspace_id,id,agent,0 FROM accounts;
ALTER TABLE audit_events ADD COLUMN account_id text;
ALTER TABLE audit_events ADD CONSTRAINT audit_account_workspace FOREIGN KEY (workspace_id,account_id) REFERENCES accounts(workspace_id,id);
CREATE INDEX audit_account_id ON audit_events(workspace_id,account_id,id DESC) WHERE account_id IS NOT NULL;
