import { z } from 'zod';
import { sql } from '../db/client.js';

export const McpIntegrationSchema = z.object({
  id: z.string().uuid().optional(),
  slug: z.string().min(1),
  displayName: z.string().min(1),
  command: z.string().min(1),
  args: z.array(z.string()).default([]),
  env: z.record(z.string(), z.string()).default({}),
  enabled: z.boolean().default(true),
});
export type McpIntegration = z.infer<typeof McpIntegrationSchema>;

export async function listMcpIntegrations(): Promise<McpIntegration[]> {
  const rows = await sql<{
    id: string;
    slug: string;
    display_name: string;
    command: string;
    args: unknown;
    env: unknown;
    enabled: boolean;
  }[]>`
    SELECT id::text, slug, display_name, command, args, env, enabled FROM mcp_integrations
    ORDER BY slug
  `;
  return rows.map((r) => ({
    id: r.id,
    slug: r.slug,
    displayName: r.display_name,
    command: r.command,
    args: (r.args as string[]) ?? [],
    env: (r.env as Record<string, string>) ?? {},
    enabled: r.enabled,
  }));
}

export async function upsertMcpIntegration(input: McpIntegration): Promise<void> {
  const valid = McpIntegrationSchema.parse(input);
  await sql`
    INSERT INTO mcp_integrations (slug, display_name, command, args, env, enabled)
    VALUES (${valid.slug}, ${valid.displayName}, ${valid.command},
            ${sql.json(valid.args as never)}, ${sql.json(valid.env as never)}, ${valid.enabled})
    ON CONFLICT (slug) DO UPDATE SET
      display_name = EXCLUDED.display_name,
      command = EXCLUDED.command,
      args = EXCLUDED.args,
      env = EXCLUDED.env,
      enabled = EXCLUDED.enabled,
      updated_at = now()
  `;
}

export async function getMcpForProfile(profileId: string): Promise<McpIntegration[]> {
  const rows = await sql<{
    id: string;
    slug: string;
    display_name: string;
    command: string;
    args: unknown;
    env: unknown;
    enabled: boolean;
  }[]>`
    SELECT m.id::text, m.slug, m.display_name, m.command, m.args, m.env, m.enabled
    FROM mcp_integrations m
    JOIN profile_mcp pm ON pm.mcp_id = m.id
    WHERE pm.profile_id = ${profileId} AND m.enabled = TRUE
  `;
  return rows.map((r) => ({
    id: r.id,
    slug: r.slug,
    displayName: r.display_name,
    command: r.command,
    args: (r.args as string[]) ?? [],
    env: (r.env as Record<string, string>) ?? {},
    enabled: r.enabled,
  }));
}

export async function setProfileMcp(profileId: string, mcpIds: string[]): Promise<void> {
  await sql.begin(async (tx) => {
    await tx`DELETE FROM profile_mcp WHERE profile_id = ${profileId}`;
    for (const id of mcpIds) {
      await tx`INSERT INTO profile_mcp (profile_id, mcp_id) VALUES (${profileId}, ${id}::uuid)`;
    }
  });
}

/**
 * .mcp.json を生成する。Claude Code は `/workspace/.mcp.json` を自動検出。
 * env 値は実際の secret を含むので、Runner → container では command 引数ではなく
 * container 起動時の extraEnv で渡す (bind mount より揮発性高)。
 */
export function buildMcpJson(integrations: McpIntegration[]): string {
  const mcpServers: Record<string, { command: string; args: string[]; env?: Record<string, string> }> = {};
  for (const m of integrations) {
    if (!m.enabled) continue;
    mcpServers[m.slug] = {
      command: m.command,
      args: m.args,
      // env は container 内の環境変数から Claude が参照する。ここに直接 secret を書かない
      env: Object.fromEntries(Object.keys(m.env).map((k) => [k, `\${${k}}`])),
    };
  }
  return JSON.stringify({ mcpServers }, null, 2);
}

export function collectMcpEnv(integrations: McpIntegration[]): Record<string, string> {
  const env: Record<string, string> = {};
  for (const m of integrations) {
    if (!m.enabled) continue;
    for (const [k, v] of Object.entries(m.env)) env[k] = v;
  }
  return env;
}
