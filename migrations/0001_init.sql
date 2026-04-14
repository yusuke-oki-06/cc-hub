-- CC Hub Runner DB initial schema (Phase 1, multi-user-ready)
-- All tables include user_id even in Phase 1 to keep Phase 2 migration trivial.

CREATE EXTENSION IF NOT EXISTS "pgcrypto";

-- ========== users ==========
CREATE TABLE IF NOT EXISTS users (
  id          UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  email       TEXT NOT NULL UNIQUE,
  display_name TEXT NOT NULL,
  role        TEXT NOT NULL CHECK (role IN ('admin', 'member')) DEFAULT 'member',
  created_at  TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- ========== profiles (tool allowlist / bash allowlist / budget caps) ==========
CREATE TABLE IF NOT EXISTS profiles (
  id           TEXT PRIMARY KEY,
  name         TEXT NOT NULL,
  description  TEXT,
  config       JSONB NOT NULL,            -- ToolProfile (zod-validated in app)
  created_by   UUID REFERENCES users(id),
  created_at   TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at   TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- ========== budgets (per-user daily/monthly cap) ==========
CREATE TABLE IF NOT EXISTS budgets (
  user_id           UUID PRIMARY KEY REFERENCES users(id) ON DELETE CASCADE,
  daily_cap_usd     NUMERIC(10,4) NOT NULL DEFAULT 20.0,
  monthly_cap_usd   NUMERIC(10,4) NOT NULL DEFAULT 300.0,
  updated_at        TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- ========== budget_usage (rolling daily / monthly counters) ==========
CREATE TABLE IF NOT EXISTS budget_usage (
  user_id     UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  period_kind TEXT NOT NULL CHECK (period_kind IN ('day', 'month')),
  period_key  TEXT NOT NULL,             -- 'YYYY-MM-DD' or 'YYYY-MM'
  used_usd    NUMERIC(10,4) NOT NULL DEFAULT 0,
  updated_at  TIMESTAMPTZ NOT NULL DEFAULT now(),
  PRIMARY KEY (user_id, period_kind, period_key)
);

-- ========== tasks (one per WebUI task) ==========
CREATE TABLE IF NOT EXISTS tasks (
  id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id         UUID NOT NULL REFERENCES users(id),
  profile_id      TEXT NOT NULL REFERENCES profiles(id),
  repo_path       TEXT NOT NULL,
  prompt          TEXT NOT NULL,
  status          TEXT NOT NULL CHECK (status IN ('queued','running','succeeded','failed','aborted')) DEFAULT 'queued',
  cost_usd        NUMERIC(10,4) NOT NULL DEFAULT 0,
  total_input_tokens  INTEGER NOT NULL DEFAULT 0,
  total_output_tokens INTEGER NOT NULL DEFAULT 0,
  created_at      TIMESTAMPTZ NOT NULL DEFAULT now(),
  finished_at     TIMESTAMPTZ
);
CREATE INDEX IF NOT EXISTS tasks_user_id_idx ON tasks(user_id);
CREATE INDEX IF NOT EXISTS tasks_status_idx ON tasks(status);

-- ========== sessions (Agent SDK sessionId) ==========
CREATE TABLE IF NOT EXISTS sessions (
  id              UUID PRIMARY KEY,                       -- Agent SDK session_id を入れる
  task_id         UUID NOT NULL REFERENCES tasks(id) ON DELETE CASCADE,
  user_id         UUID NOT NULL REFERENCES users(id),
  workspace_path  TEXT NOT NULL,
  created_at      TIMESTAMPTZ NOT NULL DEFAULT now(),
  resumed_count   INTEGER NOT NULL DEFAULT 0
);
CREATE INDEX IF NOT EXISTS sessions_task_id_idx ON sessions(task_id);

-- ========== events (durable event log; SSE は派生ビュー) ==========
CREATE TABLE IF NOT EXISTS events (
  id          BIGSERIAL PRIMARY KEY,
  session_id  UUID NOT NULL REFERENCES sessions(id) ON DELETE CASCADE,
  seq         INTEGER NOT NULL,
  event_type  TEXT NOT NULL,
  payload     JSONB NOT NULL,
  parent_tool_use_id TEXT,
  created_at  TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE(session_id, seq)
);
CREATE INDEX IF NOT EXISTS events_session_seq_idx ON events(session_id, seq);

-- ========== permission_requests (HITL queue) ==========
CREATE TABLE IF NOT EXISTS permission_requests (
  id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  session_id      UUID NOT NULL REFERENCES sessions(id) ON DELETE CASCADE,
  tool_name       TEXT NOT NULL,
  tool_input      JSONB NOT NULL,
  status          TEXT NOT NULL CHECK (status IN ('pending','allowed','allowed_once','denied','expired')) DEFAULT 'pending',
  decided_by      UUID REFERENCES users(id),
  decided_at      TIMESTAMPTZ,
  edited_input    JSONB,
  created_at      TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS permission_requests_session_idx ON permission_requests(session_id, status);

-- ========== audit_log (append-only) ==========
CREATE TABLE IF NOT EXISTS audit_log (
  id          BIGSERIAL PRIMARY KEY,
  ts          TIMESTAMPTZ NOT NULL DEFAULT now(),
  user_id     UUID REFERENCES users(id),
  session_id  UUID REFERENCES sessions(id),
  task_id     UUID REFERENCES tasks(id),
  kind        TEXT NOT NULL,                        -- prompt / tool_use / permission / guardrail / budget / system
  payload     JSONB NOT NULL,                       -- すでに secret-redactor を通したもの
  redacted    BOOLEAN NOT NULL DEFAULT FALSE
);
CREATE INDEX IF NOT EXISTS audit_log_ts_idx ON audit_log(ts DESC);
CREATE INDEX IF NOT EXISTS audit_log_user_idx ON audit_log(user_id, ts DESC);

-- audit_log は append-only にしたいので将来的に DB ロールで UPDATE/DELETE を剥奪する。
-- Phase 1 は単一ユーザーなので運用ルールで担保。

-- ========== seed: default profile + local user ==========
INSERT INTO users (id, email, display_name, role)
VALUES ('00000000-0000-0000-0000-000000000001', 'local@cc-hub.local', 'Local User', 'admin')
ON CONFLICT (email) DO NOTHING;

INSERT INTO profiles (id, name, description, config, created_by)
VALUES (
  'default',
  'Default (read-mostly)',
  'Read/Glob/Grep は自由、Write/Edit は worktree 内のみ、Bash は空 allowlist',
  '{
    "id": "default",
    "name": "Default (read-mostly)",
    "allowedTools": ["Read","Glob","Grep","Edit","Write"],
    "disallowedTools": ["WebFetch","WebSearch"],
    "bashAllowlist": [],
    "denyPipes": true,
    "denyRedirects": true,
    "allowWebFetch": false,
    "allowWebSearch": false,
    "maxTurns": 50,
    "timeLimitSeconds": 1800,
    "toolResultMaxBytes": 524288
  }'::jsonb,
  '00000000-0000-0000-0000-000000000001'
)
ON CONFLICT (id) DO NOTHING;

INSERT INTO budgets (user_id, daily_cap_usd, monthly_cap_usd)
VALUES ('00000000-0000-0000-0000-000000000001', 20.0, 300.0)
ON CONFLICT (user_id) DO NOTHING;
