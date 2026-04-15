-- Scheduled prompts (cron-driven sessions).
-- Runner loads all enabled rows at boot and registers them with node-cron.
CREATE TABLE IF NOT EXISTS schedules (
  id            UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id       UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  name          TEXT NOT NULL,
  cron_expr     TEXT NOT NULL,
  prompt        TEXT NOT NULL,
  profile_id    TEXT NOT NULL REFERENCES profiles(id),
  project_id    UUID REFERENCES projects(id) ON DELETE SET NULL,
  enabled       BOOLEAN NOT NULL DEFAULT TRUE,
  last_run_at   TIMESTAMPTZ,
  last_task_id  UUID REFERENCES tasks(id) ON DELETE SET NULL,
  created_at    TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS schedules_enabled_idx ON schedules(enabled);
