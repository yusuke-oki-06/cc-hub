-- Skills marketplace: add category + install counter so the catalog
-- can be grouped and sorted by popularity.
ALTER TABLE skills
  ADD COLUMN IF NOT EXISTS category TEXT NOT NULL DEFAULT 'general',
  ADD COLUMN IF NOT EXISTS install_count INTEGER NOT NULL DEFAULT 0;

CREATE INDEX IF NOT EXISTS skills_category_idx ON skills(category);
CREATE INDEX IF NOT EXISTS skills_install_count_idx ON skills(install_count DESC);
