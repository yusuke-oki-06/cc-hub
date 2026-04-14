import { describe, expect, it } from 'vitest';
import { checkBudget } from '../budget.js';

const base = {
  userId: 'u1',
  dailyCapUsd: 20,
  monthlyCapUsd: 300,
};

describe('checkBudget', () => {
  it('allows when within daily cap', () => {
    const r = checkBudget({ ...base, dailyUsedUsd: 5, monthlyUsedUsd: 50 });
    expect(r.ok).toBe(true);
    expect(r.remainingDailyUsd).toBe(15);
  });
  it('blocks when daily cap exceeded', () => {
    const r = checkBudget({ ...base, dailyUsedUsd: 20.5, monthlyUsedUsd: 50 });
    expect(r.ok).toBe(false);
    expect(r.reason).toBe('daily budget exceeded');
  });
  it('blocks when increment would exceed daily cap', () => {
    const r = checkBudget({ ...base, dailyUsedUsd: 18, monthlyUsedUsd: 50 }, 5);
    expect(r.ok).toBe(false);
  });
  it('blocks when monthly cap exceeded', () => {
    const r = checkBudget({ ...base, dailyUsedUsd: 5, monthlyUsedUsd: 305 });
    expect(r.ok).toBe(false);
    expect(r.reason).toBe('monthly budget exceeded');
  });
});
