-- Per-routine connector selection. NULL means "use all connectors" (legacy).
-- A JSONB array of MCP slugs (e.g. ["Slack","WebSearch"]) scopes the routine
-- to only those connectors when fired via /api/schedules/:id/run.

ALTER TABLE schedules ADD COLUMN IF NOT EXISTS enabled_mcp_slugs JSONB;
