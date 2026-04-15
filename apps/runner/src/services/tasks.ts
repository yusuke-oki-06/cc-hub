import { sql } from '../db/client.js';

export interface TaskRow {
  id: string;
  userId: string;
  profileId: string;
  prompt: string;
  label: string | null;
  projectId: string | null;
  status: 'queued' | 'running' | 'succeeded' | 'failed' | 'aborted';
  costUsd: number;
  createdAt: string;
  finishedAt: string | null;
}

export async function createTask(input: {
  userId: string;
  profileId: string;
  prompt: string;
  repoPath?: string;
  projectId?: string;
}): Promise<TaskRow> {
  const projectId = input.projectId ?? '00000000-0000-0000-0000-000000000100';
  const [row] = await sql<TaskRow[]>`
    INSERT INTO tasks (user_id, profile_id, prompt, repo_path, status, project_id)
    VALUES (${input.userId}::uuid, ${input.profileId}, ${input.prompt},
            ${input.repoPath ?? '/workspace'}, 'queued', ${projectId}::uuid)
    RETURNING
      id::text,
      user_id::text   AS "userId",
      profile_id      AS "profileId",
      prompt,
      status,
      cost_usd::float AS "costUsd",
      created_at::text AS "createdAt",
      finished_at::text AS "finishedAt"
  `;
  if (!row) throw new Error('failed to create task');
  return row;
}

export async function setTaskStatus(
  taskId: string,
  status: TaskRow['status'],
): Promise<void> {
  await sql`
    UPDATE tasks
    SET status = ${status},
        finished_at = CASE WHEN ${status} IN ('succeeded','failed','aborted') THEN now() ELSE finished_at END
    WHERE id = ${taskId}::uuid
  `;
}

export async function addTaskCost(
  taskId: string,
  usd: number,
  inputTokens: number,
  outputTokens: number,
): Promise<void> {
  await sql`
    UPDATE tasks SET
      cost_usd = cost_usd + ${usd},
      total_input_tokens = total_input_tokens + ${inputTokens},
      total_output_tokens = total_output_tokens + ${outputTokens}
    WHERE id = ${taskId}::uuid
  `;
}

export async function getTask(taskId: string, userId: string): Promise<TaskRow | null> {
  const [row] = await sql<TaskRow[]>`
    SELECT
      id::text,
      user_id::text   AS "userId",
      profile_id      AS "profileId",
      prompt,
      status,
      cost_usd::float AS "costUsd",
      created_at::text AS "createdAt",
      finished_at::text AS "finishedAt"
    FROM tasks
    WHERE id = ${taskId}::uuid AND user_id = ${userId}::uuid
    LIMIT 1
  `;
  return row ?? null;
}

export async function getLatestSessionForTask(
  taskId: string,
  userId: string,
): Promise<string | null> {
  const [row] = await sql<{ id: string }[]>`
    SELECT s.id::text FROM sessions s
    WHERE s.task_id = ${taskId}::uuid AND s.user_id = ${userId}::uuid
    ORDER BY s.created_at DESC
    LIMIT 1
  `;
  return row?.id ?? null;
}

export async function listTasks(userId: string, limit = 50): Promise<TaskRow[]> {
  return sql<TaskRow[]>`
    SELECT
      id::text,
      user_id::text   AS "userId",
      profile_id      AS "profileId",
      prompt,
      label,
      project_id::text AS "projectId",
      status,
      cost_usd::float AS "costUsd",
      created_at::text AS "createdAt",
      finished_at::text AS "finishedAt"
    FROM tasks
    WHERE user_id = ${userId}::uuid
    ORDER BY created_at DESC
    LIMIT ${Math.min(limit, 500)}
  `;
}
