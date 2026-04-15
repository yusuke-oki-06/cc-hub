import { sql } from '../db/client.js';

export interface UsageSummary {
  todayUsd: number;
  weekUsd: number;
  monthUsd: number;
  prevMonthUsd: number;
  taskCount: number;
  activeUsers: number;
  /** Estimated human-labour time saved by delegating to Claude.
   *  Modelled as `succeededTaskCount * MINUTES_SAVED_PER_TASK` where
   *  the factor is a rough proxy; refine via an admin setting later. */
  timeSavedMinutesMonth: number;
  timeSavedMinutesPrevMonth: number;
  minutesSavedPerTask: number;
  succeededCountMonth: number;
  successRateMonth: number;
  totalCostUsd: number;
  topTasks: Array<{ taskId: string; prompt: string; costUsd: number; createdAt: string }>;
  perDay: Array<{ day: string; cost: number; tasks: number }>;
  /** Rolling 6-month trend (current month included). Oldest first. */
  perMonth: Array<{
    month: string; // YYYY-MM
    costUsd: number;
    taskCount: number;
    succeededCount: number;
    activeUsers: number;
  }>;
}

const MINUTES_SAVED_PER_TASK = 30;

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

  // Count succeeded tasks this month for the time-saved estimate.
  const [succeededMonth] = await sql<{ count: string }[]>`
    SELECT count(*)::text FROM tasks
    WHERE created_at >= date_trunc('month', now())
      AND status = 'succeeded'
  `;
  const succeededCountMonth = Number(succeededMonth?.count ?? 0);

  const [prevMonth] = await sql<{ sum: string }[]>`
    SELECT COALESCE(SUM(cost_usd),0)::text AS sum FROM tasks
    WHERE created_at >= date_trunc('month', now()) - interval '1 month'
      AND created_at <  date_trunc('month', now())
  `;
  const [prevSucceeded] = await sql<{ count: string }[]>`
    SELECT count(*)::text FROM tasks
    WHERE created_at >= date_trunc('month', now()) - interval '1 month'
      AND created_at <  date_trunc('month', now())
      AND status = 'succeeded'
  `;
  const timeSavedMinutesPrevMonth =
    Number(prevSucceeded?.count ?? 0) * MINUTES_SAVED_PER_TASK;

  const [totalCost] = await sql<{ sum: string }[]>`
    SELECT COALESCE(SUM(cost_usd),0)::text AS sum FROM tasks
  `;

  // Success rate (this month) — helps frame quality alongside ROI.
  const [successRateRow] = await sql<{ rate: string }[]>`
    SELECT CASE WHEN count(*) = 0 THEN '0'
                ELSE (count(*) FILTER (WHERE status = 'succeeded')::float / count(*))::text
           END AS rate
    FROM tasks
    WHERE created_at >= date_trunc('month', now())
  `;

  // Rolling 6-month breakdown (oldest first).
  const perMonth = await sql<{
    month: string;
    cost: string;
    tasks: string;
    succeeded: string;
    users: string;
  }[]>`
    SELECT
      to_char(date_trunc('month', created_at), 'YYYY-MM') AS month,
      COALESCE(SUM(cost_usd),0)::text AS cost,
      count(*)::text AS tasks,
      count(*) FILTER (WHERE status = 'succeeded')::text AS succeeded,
      count(DISTINCT user_id)::text AS users
    FROM tasks
    WHERE created_at >= date_trunc('month', now()) - interval '5 months'
    GROUP BY 1 ORDER BY 1
  `;

  return {
    todayUsd: Number(today?.sum ?? 0),
    weekUsd: Number(week?.sum ?? 0),
    monthUsd: Number(month?.sum ?? 0),
    prevMonthUsd: Number(prevMonth?.sum ?? 0),
    taskCount: Number(tc?.count ?? 0),
    activeUsers: Number(au?.count ?? 0),
    timeSavedMinutesMonth: succeededCountMonth * MINUTES_SAVED_PER_TASK,
    timeSavedMinutesPrevMonth,
    minutesSavedPerTask: MINUTES_SAVED_PER_TASK,
    succeededCountMonth,
    successRateMonth: Number(successRateRow?.rate ?? 0),
    totalCostUsd: Number(totalCost?.sum ?? 0),
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
    perMonth: perMonth.map((m) => ({
      month: m.month,
      costUsd: Number(m.cost),
      taskCount: Number(m.tasks),
      succeededCount: Number(m.succeeded),
      activeUsers: Number(m.users),
    })),
  };
}
