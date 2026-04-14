import { sql } from '../db/client.js';

export interface UsageSummary {
  todayUsd: number;
  weekUsd: number;
  monthUsd: number;
  taskCount: number;
  activeUsers: number;
  topTasks: Array<{ taskId: string; prompt: string; costUsd: number; createdAt: string }>;
  perDay: Array<{ day: string; cost: number; tasks: number }>;
}

export async function getUsageSummary(): Promise<UsageSummary> {
  const [today] = await sql<{ sum: string }[]>`
    SELECT COALESCE(SUM(cost_usd),0)::text AS sum FROM tasks
    WHERE created_at >= date_trunc('day', now())
  `;
  const [week] = await sql<{ sum: string }[]>`
    SELECT COALESCE(SUM(cost_usd),0)::text AS sum FROM tasks
    WHERE created_at >= date_trunc('week', now())
  `;
  const [month] = await sql<{ sum: string }[]>`
    SELECT COALESCE(SUM(cost_usd),0)::text AS sum FROM tasks
    WHERE created_at >= date_trunc('month', now())
  `;
  const [tc] = await sql<{ count: string }[]>`
    SELECT count(*)::text FROM tasks WHERE created_at >= date_trunc('month', now())
  `;
  const [au] = await sql<{ count: string }[]>`
    SELECT count(DISTINCT user_id)::text FROM tasks
    WHERE created_at >= date_trunc('month', now())
  `;
  const topTasks = await sql<
    { id: string; prompt: string; cost: string; created_at: string }[]
  >`
    SELECT id::text, prompt, cost_usd::text AS cost, created_at::text
    FROM tasks ORDER BY cost_usd DESC NULLS LAST LIMIT 10
  `;
  const perDay = await sql<{ day: string; cost: string; tasks: string }[]>`
    SELECT date_trunc('day', created_at)::date::text AS day,
           COALESCE(SUM(cost_usd),0)::text AS cost,
           count(*)::text AS tasks
    FROM tasks
    WHERE created_at >= now() - interval '28 days'
    GROUP BY 1 ORDER BY 1
  `;

  return {
    todayUsd: Number(today?.sum ?? 0),
    weekUsd: Number(week?.sum ?? 0),
    monthUsd: Number(month?.sum ?? 0),
    taskCount: Number(tc?.count ?? 0),
    activeUsers: Number(au?.count ?? 0),
    topTasks: topTasks.map((t) => ({
      taskId: t.id,
      prompt: t.prompt,
      costUsd: Number(t.cost),
      createdAt: t.created_at,
    })),
    perDay: perDay.map((p) => ({
      day: p.day,
      cost: Number(p.cost),
      tasks: Number(p.tasks),
    })),
  };
}
