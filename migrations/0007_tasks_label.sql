-- Optional user-provided label for a task so it can be renamed in
-- the sidebar independently of the auto-derived prompt preview.
ALTER TABLE tasks
  ADD COLUMN IF NOT EXISTS label TEXT;
