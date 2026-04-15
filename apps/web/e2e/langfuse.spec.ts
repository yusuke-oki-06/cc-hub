import { test, expect } from './_fixtures';

test.describe('Langfuse trace link', () => {
  test('trace link uses dynamic project id (not hardcoded cc-hub-phase1)', async ({
    authedPage: page,
  }) => {
    await page.getByPlaceholder(/例:/).fill('"pong" とだけ返答してください。');
    await page.getByRole('button', { name: /実行/ }).click();

    await page.waitForURL(/\/tasks\/[0-9a-f-]+/, { timeout: 45_000 });
    await expect(page.getByText(/完了しました/)).toBeVisible({ timeout: 90_000 });

    // The "詳細トレースを見る (Langfuse)" link should point to the resolved
    // project id, not the legacy cc-hub-phase1 slug. Wait for it to appear
    // since it is materialised once the runner publishes the trace URL via
    // SSE (could take an SSE tick after 完了しました renders).
    const link = page.getByRole('link', { name: /詳細トレースを見る/ });
    await expect(link).toBeVisible({ timeout: 10_000 });
    const href = await link.getAttribute('href');
    expect(href, 'trace link href').toBeTruthy();
    expect(href!).toMatch(/\/project\/[a-z0-9-]+\/traces\/[0-9a-f-]+/);
    expect(href!, 'trace link must NOT contain hardcoded slug').not.toContain('cc-hub-phase1');
  });
});
