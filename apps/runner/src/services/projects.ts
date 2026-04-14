import { z } from 'zod';
import { sql } from '../db/client.js';

export interface ProjectRow {
  id: string;
  userId: string;
  name: string;
  description: string | null;
  createdAt: string;
  archivedAt: string | null;
  taskCount?: number;
}

export const CreateProjectSchema = z.object({
  name: z.string().min(1).max(120),
  description: z.string().max(2000).optional(),
});

export async function listProjects(userId: string): Promise<ProjectRow[]> {
  return sql<ProjectRow[]>`
    SELECT
      p.id::text,
      p.user_id::text AS "userId",
      p.name,
      p.description,
      p.created_at::text AS "createdAt",
      p.archived_at::text AS "archivedAt",
      (SELECT count(*)::int FROM tasks t WHERE t.project_id = p.id) AS "taskCount"
    FROM projects p
    WHERE p.user_id = ${userId}::uuid AND p.archived_at IS NULL
    ORDER BY p.created_at ASC
  `;
}

export async function createProject(input: {
  userId: string;
  name: string;
  description?: string;
}): Promise<ProjectRow> {
  const [row] = await sql<ProjectRow[]>`
    INSERT INTO projects (user_id, name, description)
    VALUES (${input.userId}::uuid, ${input.name}, ${input.description ?? null})
    RETURNING
      id::text, user_id::text AS "userId", name, description,
      created_at::text AS "createdAt", archived_at::text AS "archivedAt"
  `;
  if (!row) throw new Error('failed to create project');
  return row;
}

export async function getProject(
  projectId: string,
  userId: string,
): Promise<ProjectRow | null> {
  const [row] = await sql<ProjectRow[]>`
    SELECT id::text, user_id::text AS "userId", name, description,
      created_at::text AS "createdAt", archived_at::text AS "archivedAt"
    FROM projects
    WHERE id = ${projectId}::uuid AND user_id = ${userId}::uuid
    LIMIT 1
  `;
  return row ?? null;
}

export async function listProjectTasks(
  projectId: string,
  userId: string,
  limit = 100,
): Promise<
  Array<{
    id: string;
    prompt: string;
    status: string;
    costUsd: number;
    createdAt: string;
  }>
> {
  return sql`
    SELECT
      id::text, prompt, status, cost_usd::float AS "costUsd",
      created_at::text AS "createdAt"
    FROM tasks
    WHERE project_id = ${projectId}::uuid AND user_id = ${userId}::uuid
    ORDER BY created_at DESC
    LIMIT ${Math.min(limit, 500)}
  ` as never;
}

export const DEFAULT_PROJECT_ID = '00000000-0000-0000-0000-000000000100';
