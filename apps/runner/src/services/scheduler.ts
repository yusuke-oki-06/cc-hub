import cron from 'node-cron';
import { sql } from '../db/client.js';

export interface Schedule {
  id: string;
  userId: string;
  name: string;
  /** null = manual-only routine (not registered with node-cron). */
  cronExpr: string | null;
  prompt: string;
  profileId: string;
  projectId: string | null;
  enabled: boolean;
  lastRunAt: string | null;
  lastTaskId: string | null;
  createdAt: string;
}

const tasks = new Map<string, cron.ScheduledTask>();

export async function listSchedules(userId: string): Promise<Schedule[]> {
  return sql<Schedule[]>`
    SELECT id::text,
           user_id::text     AS "userId",
           name,
           cron_expr         AS "cronExpr",
           prompt,
           profile_id        AS "profileId",
           project_id::text  AS "projectId",
           enabled,
           last_run_at::text AS "lastRunAt",
           last_task_id::text AS "lastTaskId",
           created_at::text  AS "createdAt"
      FROM schedules
     WHERE user_id = ${userId}::uuid
     ORDER BY created_at DESC
  `;
}

export async function createSchedule(input: {
  userId: string;
  name: string;
  cronExpr: string | null;
  prompt: string;
  profileId?: string;
  projectId?: string | null;
}): Promise<Schedule> {
  if (input.cronExpr !== null && !cron.validate(input.cronExpr)) {
    throw new Error(`invalid cron expression: ${input.cronExpr}`);
  }
  const [row] = await sql<Schedule[]>`
    INSERT INTO schedules (user_id, name, cron_expr, prompt, profile_id, project_id)
    VALUES (${input.userId}::uuid, ${input.name}, ${input.cronExpr}, ${input.prompt},
            ${input.profileId ?? 'default'},
            ${input.projectId ?? null}${input.projectId ? sql`::uuid` : sql``})
    RETURNING id::text,
              user_id::text     AS "userId",
              name,
              cron_expr         AS "cronExpr",
              prompt,
              profile_id        AS "profileId",
              project_id::text  AS "projectId",
              enabled,
              last_run_at::text AS "lastRunAt",
              last_task_id::text AS "lastTaskId",
              created_at::text  AS "createdAt"
  `;
  if (!row) throw new Error('failed to create schedule');
  scheduleOne(row);
  return row;
}

export async function getSchedule(userId: string, id: string): Promise<Schedule | null> {
  const [row] = await sql<Schedule[]>`
    SELECT id::text,
           user_id::text     AS "userId",
           name,
           cron_expr         AS "cronExpr",
           prompt,
           profile_id        AS "profileId",
           project_id::text  AS "projectId",
           enabled,
           last_run_at::text AS "lastRunAt",
           last_task_id::text AS "lastTaskId",
           created_at::text  AS "createdAt"
      FROM schedules
     WHERE id = ${id}::uuid AND user_id = ${userId}::uuid
     LIMIT 1
  `;
  return row ?? null;
}

export async function deleteSchedule(userId: string, id: string): Promise<void> {
  await sql`
    DELETE FROM schedules
     WHERE id = ${id}::uuid AND user_id = ${userId}::uuid
  `;
  const t = tasks.get(id);
  if (t) {
    t.stop();
    tasks.delete(id);
  }
}

/** Register one schedule with node-cron. Idempotent: replaces any existing task for the id.
 *  cronExpr === null means manual-only — no cron registration. */
function scheduleOne(s: Schedule): void {
  if (!s.enabled) return;
  const existing = tasks.get(s.id);
  if (existing) existing.stop();
  if (!s.cronExpr) return;
  const task = cron.schedule(
    s.cronExpr,
    async () => {
      try {
        // Dynamic import to avoid a circular dependency on session services.
        const { fireScheduledRun } = await import('./scheduled-run.js');
        await fireScheduledRun(s);
      } catch (err) {
        console.error(`[scheduler] fire failed for ${s.id}`, err);
      }
    },
    { timezone: 'Asia/Tokyo' },
  );
  tasks.set(s.id, task);
}

/** Load all enabled schedules at runner boot and register them. */
export async function startScheduler(): Promise<void> {
  const rows = await sql<Schedule[]>`
    SELECT id::text,
           user_id::text     AS "userId",
           name,
           cron_expr         AS "cronExpr",
           prompt,
           profile_id        AS "profileId",
           project_id::text  AS "projectId",
           enabled,
           last_run_at::text AS "lastRunAt",
           last_task_id::text AS "lastTaskId",
           created_at::text  AS "createdAt"
      FROM schedules WHERE enabled = true
  `;
  for (const r of rows) scheduleOne(r);
  if (rows.length > 0) {
    console.log(`[scheduler] registered ${rows.length} schedule(s)`);
  }
}

export async function markScheduleFired(scheduleId: string, taskId: string): Promise<void> {
  await sql`
    UPDATE schedules
       SET last_run_at = now(), last_task_id = ${taskId}::uuid
     WHERE id = ${scheduleId}::uuid
  `;
}
