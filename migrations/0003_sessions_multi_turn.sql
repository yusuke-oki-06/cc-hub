-- Multi-turn conversation: store Claude CLI's session_id (printed in system.init)
-- so follow-up exec can use --resume. Also track last activity for idle timeout.

ALTER TABLE sessions
  ADD COLUMN IF NOT EXISTS claude_session_id TEXT,
  ADD COLUMN IF NOT EXISTS last_activity_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  ADD COLUMN IF NOT EXISTS turn_count INTEGER NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS status TEXT NOT NULL DEFAULT 'active';

CREATE INDEX IF NOT EXISTS sessions_claude_session_id_idx ON sessions(claude_session_id);
CREATE INDEX IF NOT EXISTS sessions_last_activity_idx ON sessions(last_activity_at DESC);
