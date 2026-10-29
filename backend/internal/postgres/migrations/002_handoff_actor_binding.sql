-- Historical rows remain readable but cannot match the new actor/session-bound
-- fingerprint. Session hashes intentionally have no session FK: logout deletes
-- sessions while the non-secret audit receipt must remain durable.
ALTER TABLE handoffs ADD COLUMN actor_id text REFERENCES users(id);
ALTER TABLE handoffs ADD COLUMN session_hash text;
ALTER TABLE handoffs ADD CONSTRAINT handoff_actor_binding CHECK (
  (actor_id IS NULL AND session_hash IS NULL) OR
  (actor_id IS NOT NULL AND session_hash IS NOT NULL AND length(session_hash)=64)
);
