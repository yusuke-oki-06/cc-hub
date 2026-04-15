-- Per-user favorites for the Skills marketplace. Separate from skill_installs
-- because users may favorite skills they have not (yet) installed into any
-- profile, and un-favoriting should not touch the install record.

CREATE TABLE IF NOT EXISTS skill_favorites (
  user_id     UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  skill_id    UUID NOT NULL REFERENCES skills(id) ON DELETE CASCADE,
  created_at  TIMESTAMPTZ NOT NULL DEFAULT now(),
  PRIMARY KEY (user_id, skill_id)
);

CREATE INDEX IF NOT EXISTS skill_favorites_skill_idx
  ON skill_favorites (skill_id, created_at DESC);
