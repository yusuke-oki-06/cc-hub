import { z } from 'zod';
import { sql } from '../db/client.js';
import { ToolProfileSchema, type ToolProfile, DEFAULT_PROFILE } from '@cc-hub/shared';

export async function getProfile(id: string): Promise<ToolProfile> {
  const rows = await sql<{ config: unknown }[]>`
    SELECT config FROM profiles WHERE id = ${id} LIMIT 1
  `;
  if (!rows[0]) {
    if (id === 'default') return DEFAULT_PROFILE;
    throw new Error(`profile not found: ${id}`);
  }
  const parsed = ToolProfileSchema.safeParse(rows[0].config);
  if (!parsed.success) throw new Error(`invalid profile config: ${parsed.error.message}`);
  return parsed.data;
}

export async function listProfiles(): Promise<ToolProfile[]> {
  const rows = await sql<{ config: unknown }[]>`SELECT config FROM profiles ORDER BY id`;
  return rows.flatMap((r) => {
    const parsed = ToolProfileSchema.safeParse(r.config);
    return parsed.success ? [parsed.data] : [];
  });
}

export async function upsertProfile(profile: ToolProfile): Promise<void> {
  const valid = ToolProfileSchema.parse(profile);
  await sql`
    INSERT INTO profiles (id, name, description, config)
    VALUES (${valid.id}, ${valid.name}, ${valid.description ?? null}, ${sql.json(valid as unknown as never)})
    ON CONFLICT (id) DO UPDATE
      SET name = EXCLUDED.name,
          description = EXCLUDED.description,
          config = EXCLUDED.config,
          updated_at = now()
  `;
}

export const CreateProfileSchema = ToolProfileSchema;
export type CreateProfile = z.infer<typeof CreateProfileSchema>;
