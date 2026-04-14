-- MCP integrations: admin-provisioned SaaS connections.
-- Tokens encrypted via pgsodium or (Phase 1) stored obfuscated.

CREATE TABLE IF NOT EXISTS mcp_integrations (
  id            UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  slug          TEXT NOT NULL UNIQUE,            -- e.g. 'jira', 'slack', 'datadog'
  display_name  TEXT NOT NULL,
  command       TEXT NOT NULL,                   -- e.g. 'npx'
  args          JSONB NOT NULL DEFAULT '[]'::jsonb,
  env           JSONB NOT NULL DEFAULT '{}'::jsonb,  -- {ENV_VAR: 'value'} runtime-injected
  enabled       BOOLEAN NOT NULL DEFAULT TRUE,
  created_at    TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at    TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- profile_mcp : which profile uses which MCP servers
CREATE TABLE IF NOT EXISTS profile_mcp (
  profile_id   TEXT NOT NULL REFERENCES profiles(id) ON DELETE CASCADE,
  mcp_id       UUID NOT NULL REFERENCES mcp_integrations(id) ON DELETE CASCADE,
  PRIMARY KEY (profile_id, mcp_id)
);
