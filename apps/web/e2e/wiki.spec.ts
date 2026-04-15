import { test, expect } from './_fixtures';

test.describe('Wiki UI', () => {
  test('wiki page renders config + tree + graph', async ({ authedPage: page }) => {
    await page.goto('/wiki');

    // Either "vault not configured" or the real UI, depending on env.
    // In the dev environment with CC_HUB_VAULT_PATH set, we expect the real UI.
    const vaultDisabled = page.getByText(/vault が未設定です/);
    const realHeading = page.getByRole('heading', { name: /^Wiki$/ });
    await expect(realHeading).toBeVisible({ timeout: 10_000 });

    if (await vaultDisabled.isVisible().catch(() => false)) {
      // CI / unconfigured path — just verify the fallback message
      await expect(page.getByText(/CC_HUB_VAULT_PATH/)).toBeVisible();
      return;
    }

    // Real UI: sidebar (files label) and one of the view buttons
    await expect(page.getByText(/^files$/i)).toBeVisible();
    await expect(page.getByRole('button', { name: /^グラフ$/ })).toBeVisible();
    await expect(page.getByRole('button', { name: /^リーディング$/ })).toBeVisible();
  });

  test('help panel + composer preset buttons are present', async ({ authedPage: page }) => {
    await page.goto('/wiki');
    await expect(page.getByText(/Wiki の使い方/)).toBeVisible({ timeout: 10_000 });
    await expect(page.getByPlaceholder(/Wiki に依頼/)).toBeVisible();
    for (const label of ['準備する', '生データを整理', '質問する', '点検する', '矛盾を修復']) {
      await expect(page.getByRole('button', { name: label })).toBeVisible();
    }
  });

  test('files tree hides .claude and internal docs', async ({ authedPage: page }) => {
    await page.goto('/wiki');
    const filesPanel = page.locator('aside').filter({ hasText: /^files/i }).first();
    await expect(filesPanel).toBeVisible({ timeout: 10_000 });
    const text = await filesPanel.innerText();
    expect(text).not.toMatch(/\.claude/);
    expect(text).not.toContain('CLAUDE.md');
    expect(text).not.toContain('log.md');
  });

  test('sidebar has Wiki nav entry', async ({ authedPage: page }) => {
    await page.goto('/');
    const wikiLink = page.getByRole('link', { name: /^Wiki$/ });
    await expect(wikiLink).toBeVisible();
  });
});
