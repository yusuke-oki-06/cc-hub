import { createHash } from 'node:crypto';
import { z } from 'zod';
import { sql } from '../db/client.js';
import { scanSkillContent, type SkillScanReport } from './skill-scanner.js';

export const PublishSkillSchema = z.object({
  slug: z.string().regex(/^[a-z0-9-]{2,64}$/, '英小文字/数字/ハイフンのみ、2〜64文字'),
  version: z.string().regex(/^\d+\.\d+\.\d+$/, 'SemVer (例: 0.1.0)'),
  title: z.string().min(1).max(120),
  description: z.string().max(2000).optional(),
  contentBase64: z.string().min(10), // base64 of tar.gz, for now allow plain SKILL.md as base64 text
  contentKind: z.enum(['skill_md', 'tar_gz']).default('skill_md'),
});
export type PublishSkillInput = z.infer<typeof PublishSkillSchema>;

export interface SkillRow {
  id: string;
  slug: string;
  version: string;
  title: string;
  description: string | null;
  authorId: string;
  status: 'draft' | 'scan_passed' | 'scan_failed' | 'published' | 'rejected';
  scanReport: SkillScanReport | null;
  category: string;
  installCount: number;
  /** Number of users who favorited this skill (global). */
  favoriteCount: number;
  /** Whether the current user has favorited this skill. Only populated when
   *  a userId is passed to listSkills; null otherwise. */
  favoritedByMe: boolean | null;
  createdAt: string;
}

export async function publishSkill(
  userId: string,
  input: PublishSkillInput,
): Promise<SkillRow> {
  const content = Buffer.from(input.contentBase64, 'base64');
  const hash = createHash('sha256').update(content).digest('hex');

  let scanReport: SkillScanReport | null = null;
  if (input.contentKind === 'skill_md') {
    const text = content.toString('utf8');
    scanReport = scanSkillContent(text);
  }
  const status: SkillRow['status'] = scanReport
    ? scanReport.passed
      ? 'scan_passed'
      : 'scan_failed'
    : 'draft';

  const [row] = await sql<SkillRow[]>`
    INSERT INTO skills (slug, version, author_id, title, description, content, content_sha256, status, scan_report)
    VALUES (${input.slug}, ${input.version}, ${userId}::uuid, ${input.title}, ${input.description ?? null},
            ${content}, ${hash}, ${status}, ${scanReport ? sql.json(scanReport as never) : null})
    ON CONFLICT (slug, version) DO UPDATE SET
      title = EXCLUDED.title, description = EXCLUDED.description,
      content = EXCLUDED.content, content_sha256 = EXCLUDED.content_sha256,
      status = EXCLUDED.status, scan_report = EXCLUDED.scan_report
    RETURNING id::text, slug, version, title, description,
      author_id::text AS "authorId", status,
      scan_report AS "scanReport",
      category,
      install_count AS "installCount",
      0::int AS "favoriteCount",
      NULL::boolean AS "favoritedByMe",
      created_at::text AS "createdAt"
  `;
  if (!row) throw new Error('publish failed');
  return row;
}

export async function toggleFavorite(
  userId: string,
  skillId: string,
): Promise<{ favorited: boolean }> {
  // Attempt insert; if the row already exists, delete to toggle off.
  const inserted = await sql<{ ok: number }[]>`
    INSERT INTO skill_favorites (user_id, skill_id)
    VALUES (${userId}::uuid, ${skillId}::uuid)
    ON CONFLICT DO NOTHING
    RETURNING 1 AS ok
  `;
  if (inserted.length > 0) return { favorited: true };
  await sql`
    DELETE FROM skill_favorites
    WHERE user_id = ${userId}::uuid AND skill_id = ${skillId}::uuid
  `;
  return { favorited: false };
}

export async function listSkills(filter?: {
  status?: SkillRow['status'];
  category?: string;
  orderBy?: 'popular' | 'recent' | 'favorites';
  userId?: string;
  favoritedBy?: string; // user id — restrict to their favorites only
  search?: string; // case-insensitive match against slug/title/description
}): Promise<SkillRow[]> {
  const orderSql =
    filter?.orderBy === 'popular'
      ? sql`ORDER BY s.install_count DESC, s.created_at DESC`
      : filter?.orderBy === 'favorites'
        ? sql`ORDER BY "favoriteCount" DESC, s.created_at DESC`
        : sql`ORDER BY s.created_at DESC`;

  // Per-user favorited flag. We LEFT JOIN skill_favorites filtered by the
  // current user's id so every row gets a boolean.
  const uid = filter?.userId ?? null;
  const favedMe = uid
    ? sql`EXISTS (SELECT 1 FROM skill_favorites sf2
                  WHERE sf2.skill_id = s.id AND sf2.user_id = ${uid}::uuid)`
    : sql`NULL::boolean`;

  // WHERE clauses composed conditionally.
  const statusFilter = filter?.status
    ? sql`AND s.status = ${filter.status}`
    : sql``;
  const categoryFilter = filter?.category
    ? sql`AND s.category = ${filter.category}`
    : sql``;
  const favFilter = filter?.favoritedBy
    ? sql`AND EXISTS (SELECT 1 FROM skill_favorites sfF
                       WHERE sfF.skill_id = s.id AND sfF.user_id = ${filter.favoritedBy}::uuid)`
    : sql``;
  // Text search across slug, title, description. Use ILIKE with the caller's
  // raw pattern wrapped in % — postgres.js parametrizes, so SQL injection
  // is not a concern, but trim first to avoid "% %" matching everything.
  const q = filter?.search?.trim();
  const searchFilter = q
    ? sql`AND (s.slug ILIKE ${'%' + q + '%'}
           OR s.title ILIKE ${'%' + q + '%'}
           OR COALESCE(s.description, '') ILIKE ${'%' + q + '%'})`
    : sql``;

  return sql<SkillRow[]>`
    SELECT
      s.id::text,
      s.slug,
      s.version,
      s.title,
      s.description,
      s.author_id::text AS "authorId",
      s.status,
      s.scan_report AS "scanReport",
      s.category,
      s.install_count AS "installCount",
      COALESCE((SELECT count(*)::int FROM skill_favorites sfC WHERE sfC.skill_id = s.id), 0) AS "favoriteCount",
      ${favedMe} AS "favoritedByMe",
      s.created_at::text AS "createdAt"
    FROM skills s
    WHERE 1 = 1
      ${statusFilter}
      ${categoryFilter}
      ${favFilter}
      ${searchFilter}
    ${orderSql}
    LIMIT 100
  `;
}

export async function getSkill(
  skillId: string,
  userId?: string,
): Promise<(SkillRow & { contentText: string | null }) | null> {
  const favedMe = userId
    ? sql`EXISTS (SELECT 1 FROM skill_favorites sf WHERE sf.skill_id = s.id AND sf.user_id = ${userId}::uuid)`
    : sql`NULL::boolean`;
  const rows = await sql<Array<SkillRow & { content: Buffer }>>`
    SELECT s.id::text, s.slug, s.version, s.title, s.description,
      s.author_id::text AS "authorId", s.status, s.scan_report AS "scanReport",
      s.category, s.install_count AS "installCount",
      COALESCE((SELECT count(*)::int FROM skill_favorites sfC WHERE sfC.skill_id = s.id), 0) AS "favoriteCount",
      ${favedMe} AS "favoritedByMe",
      s.created_at::text AS "createdAt", s.content
    FROM skills s WHERE s.id = ${skillId}::uuid LIMIT 1
  `;
  const row = rows[0];
  if (!row) return null;
  const { content, ...rest } = row;
  // best-effort: SKILL.md plain text. tar.gz binary skipped.
  let contentText: string | null = null;
  try {
    const text = content.toString('utf8');
    if (text.startsWith('---') || text.length < 100_000) contentText = text;
  } catch {
    // noop
  }
  return { ...rest, contentText };
}

export async function approveSkill(
  skillId: string,
  adminId: string,
): Promise<void> {
  await sql`
    UPDATE skills
    SET status = 'published', admin_reviewer_id = ${adminId}::uuid, reviewed_at = now()
    WHERE id = ${skillId}::uuid AND status = 'scan_passed'
  `;
}

export async function rejectSkill(skillId: string, adminId: string): Promise<void> {
  await sql`
    UPDATE skills
    SET status = 'rejected', admin_reviewer_id = ${adminId}::uuid, reviewed_at = now()
    WHERE id = ${skillId}::uuid
  `;
}

export async function installSkill(input: {
  userId: string;
  profileId: string;
  skillId: string;
}): Promise<void> {
  const r = await sql`
    INSERT INTO skill_installs (user_id, profile_id, skill_id)
    VALUES (${input.userId}::uuid, ${input.profileId}, ${input.skillId}::uuid)
    ON CONFLICT DO NOTHING
    RETURNING 1 AS inserted
  `;
  // Only increment the popularity counter when this (user, profile, skill)
  // pair is new — repeated install calls shouldn't inflate the ranking.
  if (r.length > 0) {
    await sql`
      UPDATE skills SET install_count = install_count + 1
       WHERE id = ${input.skillId}::uuid
    `;
  }
}

export async function listInstalledSkills(
  userId: string,
  profileId: string,
): Promise<Array<{ slug: string; content: Buffer }>> {
  const rows = await sql<{ slug: string; content: Buffer }[]>`
    SELECT s.slug, s.content
    FROM skill_installs si JOIN skills s ON s.id = si.skill_id
    WHERE si.user_id = ${userId}::uuid AND si.profile_id = ${profileId} AND s.status = 'published'
  `;
  return rows;
}
