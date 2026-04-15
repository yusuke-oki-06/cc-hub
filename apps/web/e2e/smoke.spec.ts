import { test, expect } from './_fixtures';

test.describe('E2E smoke: prompt → Claude runs → 完了', () => {
  test('submit a trivial prompt and reach success state', async ({ authedPage: page }) => {
    const prompt = 'ちょうど "pong" とだけ一言で返答して、それ以外は何もしないでください。';
    await page.getByPlaceholder(/今日はどんな/).fill(prompt);

    await page.getByRole('button', { name: /送信/ }).click();

    // Phase label card shows up
    await expect(page.getByText(/現在:\s*(セッション作成中|Claude 起動中)/)).toBeVisible({ timeout: 30_000 });

    // Navigation to /tasks/:id
    await page.waitForURL(/\/tasks\/[0-9a-f-]+/, { timeout: 45_000 });

    // Running indicator OR completed within 90s
    const done = page.getByText(/完了しました/);
    await expect(done).toBeVisible({ timeout: 90_000 });

    // Error card must not be present
    const errorCard = page.locator('text=実行エラー');
    await expect(errorCard).toHaveCount(0);
  });
});
