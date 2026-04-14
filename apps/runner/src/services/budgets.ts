import { sql } from '../db/client.js';
import { checkBudget, type BudgetState } from '@cc-hub/guardrails';

function dayKey(d = new Date()): string {
  return d.toISOString().slice(0, 10);
}
function monthKey(d = new Date()): string {
  return d.toISOString().slice(0, 7);
}

export async function getBudgetState(userId: string): Promise<BudgetState> {
  const [cap] = await sql<{ daily_cap_usd: string; monthly_cap_usd: string }[]>`
    SELECT daily_cap_usd::text, monthly_cap_usd::text FROM budgets WHERE user_id = ${userId}::uuid LIMIT 1
  `;
  if (!cap) throw new Error(`budget not configured for user ${userId}`);

  const [daily] = await sql<{ used_usd: string }[]>`
    SELECT used_usd::text FROM budget_usage
    WHERE user_id = ${userId}::uuid AND period_kind = 'day' AND period_key = ${dayKey()}
  `;
  const [monthly] = await sql<{ used_usd: string }[]>`
    SELECT used_usd::text FROM budget_usage
    WHERE user_id = ${userId}::uuid AND period_kind = 'month' AND period_key = ${monthKey()}
  `;

  return {
    userId,
    dailyUsedUsd: Number(daily?.used_usd ?? 0),
    monthlyUsedUsd: Number(monthly?.used_usd ?? 0),
    dailyCapUsd: Number(cap.daily_cap_usd),
    monthlyCapUsd: Number(cap.monthly_cap_usd),
  };
}

export async function addUsage(userId: string, usd: number): Promise<BudgetState> {
  await sql.begin(async (tx) => {
    await tx`
      INSERT INTO budget_usage (user_id, period_kind, period_key, used_usd)
      VALUES (${userId}::uuid, 'day', ${dayKey()}, ${usd})
      ON CONFLICT (user_id, period_kind, period_key)
        DO UPDATE SET used_usd = budget_usage.used_usd + EXCLUDED.used_usd, updated_at = now()
    `;
    await tx`
      INSERT INTO budget_usage (user_id, period_kind, period_key, used_usd)
      VALUES (${userId}::uuid, 'month', ${monthKey()}, ${usd})
      ON CONFLICT (user_id, period_kind, period_key)
        DO UPDATE SET used_usd = budget_usage.used_usd + EXCLUDED.used_usd, updated_at = now()
    `;
  });
  return getBudgetState(userId);
}

export async function assertBudgetOk(userId: string): Promise<void> {
  const state = await getBudgetState(userId);
  const r = checkBudget(state);
  if (!r.ok) {
    const err = new Error(`budget_exceeded: ${r.reason}`);
    (err as Error & { statusCode: number }).statusCode = 402;
    throw err;
  }
}
