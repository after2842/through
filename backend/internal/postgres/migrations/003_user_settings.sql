ALTER TABLE users ADD COLUMN display_name text NOT NULL DEFAULT '' CHECK (char_length(display_name) <= 80);
CREATE INDEX sessions_user ON sessions(user_id);
