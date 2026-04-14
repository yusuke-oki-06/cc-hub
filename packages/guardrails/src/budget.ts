export interface BudgetState {
  userId: string;
  dailyUsedUsd: number;
  monthlyUsedUsd: number;
  dailyCapUsd: number;
  monthlyCapUsd: number;
}

export interface BudgetCheckResult {
  ok: boolean;
  reason?: string;
  remainingDailyUsd: number;
  remainingMonthlyUsd: number;
}

export function checkBudget(state: BudgetState, incrementUsd = 0): BudgetCheckResult {
  const remainingDailyUsd = state.dailyCapUsd - state.dailyUsedUsd - incrementUsd;
  const remainingMonthlyUsd = state.monthlyCapUsd - state.monthlyUsedUsd - incrementUsd;
  if (remainingDailyUsd < 0) {
    return { ok: false, reason: 'daily budget exceeded', remainingDailyUsd, remainingMonthlyUsd };
  }
  if (remainingMonthlyUsd < 0) {
    return { ok: false, reason: 'monthly budget exceeded', remainingDailyUsd, remainingMonthlyUsd };
  }
  return { ok: true, remainingDailyUsd, remainingMonthlyUsd };
}
