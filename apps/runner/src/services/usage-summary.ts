import { sql } from '../db/client.js';
import { getModelBreakdownSinceMonth } from '../observability/langfuse.js';

export interface UsageSummary {
  todayUsd: number;
  weekUsd: number;
  monthUsd: number;
  prevMonthUsd: number;
  taskCount: number;
  activeUsers: number;
  /** Estimated human-labour time saved. Derived per-task from actual session
   *  runtime + output token volume (see SAVED_MINUTES_EXPR). The estimate
   *  bounds each task to [10, 180] minutes so outliers don't skew the month. */
  timeSavedMinutesMonth: number;
  timeSavedMinutesPrevMonth: number;
  /** Average saved-minutes per succeeded task this month — useful as a hint
   *  next to the headline number so operators can sanity-check the formula. */
  avgSavedMinutesPerTask: number;
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
    savedMinutes: number;
  }>;
  /** Top-5 users this month by tasks run — for exec "adoption/exemplars" card. */
  topUsers: Array<{
    userId: string;
    displayName: string | null;
    taskCount: number;
    succeededCount: number;
    costUsd: number;
    timeSavedMinutes: number;
  }>;
  /** Model usage breakdown pulled from Langfuse observations this month.
   *  `null` when Langfuse is unreachable (renders "—" in UI). */
  modelBreakdown:
    | Array<{
        model: string;
        count: number;
        inputTokens: number;
        outputTokens: number;
      }>
    | null;
}

/**
 * Per-task "saved human minutes" estimator — applied to succeeded tasks only.
 *
 *   saved = clamp(10, 180,
 *     ROUND( duration_minutes * 3        // 人は Claude の約 3 倍の時間を要する
 *          + output_tokens   * 0.005 ))  // 1,000 output tokens ≒ 5 分の執筆
 *
 *   - 下限 10 分: 「問題把握 + エディタを開く」だけでも最低限かかる時間
 *   - 上限 180 分: 1 タスクで 3 時間を超えた推定は外れ値として丸める
 */
const savedMinutesExpr = () => sql`
  GREATEST(10, LEAST(180,
    ROUND(
      COALESCE(EXTRACT(EPOCH FROM (finished_at - created_at))/60, 0)::float * 3
      + COALESCE(total_output_tokens, 0)::float * 0.005
    )
  ))
`;

export async function getUsageSummary(): Promise<UsageSummary> {
  const saved = savedMinutesExpr();
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

  // Succeeded tasks + saved-minutes aggregated from the per-task estimator.
  const [savedRow] = await sql<{ count: string; saved: string }[]>`
    SELECT count(*)::text AS count,
           COALESCE(SUM(${saved}), 0)::text AS saved
    FROM tasks
    WHERE created_at >= date_trunc('month', now())
      AND status = 'succeeded'
  `;
  const succeededCountMonth = Number(savedRow?.count ?? 0);
  const timeSavedMinutesMonth = Number(savedRow?.saved ?? 0);
  const avgSavedMinutesPerTask =
    succeededCountMonth > 0 ? Math.round(timeSavedMinutesMonth / succeededCountMonth) : 0;

  const [prevMonth] = await sql<{ sum: string }[]>`
    SELECT COALESCE(SUM(cost_usd),0)::text AS sum FROM tasks
    WHERE created_at >= date_trunc('month', now()) - interval '1 month'
      AND created_at <  date_trunc('month', now())
  `;
  const [prevSaved] = await sql<{ saved: string }[]>`
    SELECT COALESCE(SUM(${saved}), 0)::text AS saved FROM tasks
    WHERE created_at >= date_trunc('month', now()) - interval '1 month'
      AND created_at <  date_trunc('month', now())
      AND status = 'succeeded'
  `;
  const timeSavedMinutesPrevMonth = Number(prevSaved?.saved ?? 0);

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

  // Rolling 6-month breakdown (oldest first). `saved_minutes` uses the same
  // per-task estimator, filtered to succeeded rows.
  const perMonth = await sql<{
    month: string;
    cost: string;
    tasks: string;
    succeeded: string;
    users: string;
    saved_minutes: string;
  }[]>`
    SELECT
      to_char(date_trunc('month', created_at), 'YYYY-MM') AS month,
      COALESCE(SUM(cost_usd),0)::text AS cost,
      count(*)::text AS tasks,
      count(*) FILTER (WHERE status = 'succeeded')::text AS succeeded,
      count(DISTINCT user_id)::text AS users,
      COALESCE(SUM(${saved}) FILTER (WHERE status = 'succeeded'), 0)::text AS saved_minutes
    FROM tasks
    WHERE created_at >= date_trunc('month', now()) - interval '5 months'
    GROUP BY 1 ORDER BY 1
  `;

  // Top users this month — aggregate per-user first from the bare `tasks`
  // table (so the saved-minutes expression's unqualified columns resolve),
  // then LEFT JOIN users for display_name.
  const topUsersRows = await sql<{
    user_id: string;
    display_name: string | null;
    tasks: string;
    succeeded: string;
    cost: string;
    saved_minutes: string;
  }[]>`
    WITH per_user AS (
      SELECT
        user_id,
        count(*)::text AS tasks,
        count(*) FILTER (WHERE status = 'succeeded')::text AS succeeded,
        COALESCE(SUM(cost_usd),0)::text AS cost,
        COALESCE(SUM(${saved}) FILTER (WHERE status = 'succeeded'), 0)::text AS saved_minutes
      FROM tasks
      WHERE created_at >= date_trunc('month', now())
      GROUP BY user_id
    )
    SELECT
      p.user_id::text AS user_id,
      u.display_name,
      p.tasks, p.succeeded, p.cost, p.saved_minutes
    FROM per_user p LEFT JOIN users u ON u.id = p.user_id
    ORDER BY p.saved_minutes::float DESC, p.succeeded::int DESC
    LIMIT 5
  `;

  // Model breakdown via Langfuse — optional (nil if Langfuse is unavailable).
  let modelBreakdown: UsageSummary['modelBreakdown'] = null;
  try {
    modelBreakdown = await getModelBreakdownSinceMonth();
  } catch (err) {
    console.warn('[usage-summary] getModelBreakdown failed', err);
  }

  return {
    todayUsd: Number(today?.sum ?? 0),
    weekUsd: Number(week?.sum ?? 0),
    monthUsd: Number(month?.sum ?? 0),
    prevMonthUsd: Number(prevMonth?.sum ?? 0),
    taskCount: Number(tc?.count ?? 0),
    activeUsers: Number(au?.count ?? 0),
    timeSavedMinutesMonth,
    timeSavedMinutesPrevMonth,
    avgSavedMinutesPerTask,
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
      savedMinutes: Number(m.saved_minutes),
    })),
    topUsers: topUsersRows.map((r) => ({
      userId: r.user_id,
      displayName: r.display_name,
      taskCount: Number(r.tasks),
      succeededCount: Number(r.succeeded),
      costUsd: Number(r.cost),
      timeSavedMinutes: Number(r.saved_minutes),
    })),
    modelBreakdown,
  };
}
