CREATE TABLE IF NOT EXISTS projects (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  name TEXT NOT NULL,
  description TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  archived_at TIMESTAMPTZ
);
CREATE INDEX IF NOT EXISTS projects_user_idx ON projects(user_id, archived_at NULLS FIRST);

INSERT INTO projects (id, user_id, name, description) VALUES (
  '00000000-0000-0000-0000-000000000100',
  '00000000-0000-0000-0000-000000000001',
  '未分類',
  '既存タスクを収容する既定プロジェクト'
) ON CONFLICT (id) DO NOTHING;

ALTER TABLE tasks ADD COLUMN IF NOT EXISTS project_id UUID REFERENCES projects(id);
UPDATE tasks SET project_id = '00000000-0000-0000-0000-000000000100'
  WHERE project_id IS NULL;
ALTER TABLE tasks ALTER COLUMN project_id SET NOT NULL;
CREATE INDEX IF NOT EXISTS tasks_project_idx ON tasks(project_id, created_at DESC);
