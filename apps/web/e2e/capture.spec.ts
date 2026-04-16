import { test, expect } from './_fixtures';
import path from 'node:path';

const SHOTS = path.resolve(__dirname, '..', '..', '..', 'docs', 'demo');

test.describe.configure({ mode: 'serial' });

test('capture full screenshots for README', async ({ authedPage: page }) => {
  test.setTimeout(300_000);

  // フルスクリーン相当の viewport
  await page.setViewportSize({ width: 1920, height: 1080 });

  // 1. Landing
  await page.goto('/');
  await page.waitForLoadState('networkidle');
  await page.screenshot({ path: path.join(SHOTS, '01-landing.png'), fullPage: false });

  // 2. Wiki graph
  await page.goto('/wiki');
  await page.waitForLoadState('networkidle');
  await page.waitForTimeout(4_000);
  await page.screenshot({ path: path.join(SHOTS, '02-wiki-graph.png'), fullPage: false });

  // 3. Wiki reading view
  await page.getByRole('button', { name: /^リーディング$/ }).click();
  const memexLink = page.getByRole('button', { name: /memex\.md$/ }).first();
  if (await memexLink.isVisible().catch(() => false)) {
    await memexLink.click();
    await page.waitForTimeout(500);
  }
  await page.screenshot({ path: path.join(SHOTS, '03-wiki-reading.png'), fullPage: false });

  // 4. Landing sidebar (full page)
  await page.goto('/');
  await page.waitForLoadState('networkidle');
  await page.screenshot({ path: path.join(SHOTS, '04-landing-sidebar.png'), fullPage: true });

  // 5. Submit prompt → task view (タイムアウトしやすいので失敗しても続行)
  try {
    await page.getByPlaceholder(/今日はどんな/).fill('"pong" とだけ返答してください。');
    await page.getByRole('button', { name: /送信/ }).click();
    await page.waitForURL(/\/tasks\/[0-9a-f-]+/, { timeout: 45_000 });
    await expect(
      page.getByText(/Claude が考えています|pong/i).first(),
    ).toBeVisible({ timeout: 60_000 });
    await page.waitForTimeout(2000);
    await page.screenshot({ path: path.join(SHOTS, '05-task-view.png'), fullPage: false });
  } catch {
    console.warn('[capture] task-view screenshot skipped (timeout or error)');
  }

  // 6. Skills マーケットプレイス
  await page.goto('/skills');
  await page.waitForLoadState('networkidle');
  await page.waitForTimeout(1000);
  await page.screenshot({ path: path.join(SHOTS, '06-skills.png'), fullPage: false });

  // 7. Skills レビュー (admin)
  await page.goto('/admin/skills/review');
  await page.waitForLoadState('networkidle');
  await page.waitForTimeout(500);
  await page.screenshot({ path: path.join(SHOTS, '07-skills-review.png'), fullPage: false });

  // 8. 利用状況ダッシュボード
  await page.goto('/admin/insights');
  await page.waitForLoadState('networkidle');
  await page.waitForTimeout(1500);
  await page.screenshot({ path: path.join(SHOTS, '08-insights.png'), fullPage: false });

  // 9. 利用状況 (フルページ — トレンドまで)
  await page.screenshot({ path: path.join(SHOTS, '09-insights-full.png'), fullPage: true });
});

test('capture Coral White theme', async ({ authedPage: page }) => {
  test.setTimeout(60_000);
  await page.setViewportSize({ width: 1920, height: 1080 });

  await page.goto('/');
  await page.evaluate(() => {
    localStorage.setItem('cc-hub-theme', 'airbnb');
    document.documentElement.setAttribute('data-theme', 'airbnb');
  });

  await page.reload();
  await page.waitForLoadState('networkidle');
  await page.screenshot({ path: path.join(SHOTS, 'airbnb-01-landing.png'), fullPage: false });

  await page.goto('/wiki');
  await page.waitForLoadState('networkidle');
  await page.waitForTimeout(3000);
  await page.screenshot({ path: path.join(SHOTS, 'airbnb-02-wiki-graph.png'), fullPage: false });

  await page.evaluate(() => {
    localStorage.removeItem('cc-hub-theme');
    document.documentElement.removeAttribute('data-theme');
  });
});

test('capture Langfuse trace UI', async ({ browser }) => {
  test.setTimeout(90_000);
  const ctx = await browser.newContext({ viewport: { width: 1920, height: 1080 } });
  const lf = await ctx.newPage();
  await lf.goto('http://localhost:3100/auth/sign-in');
  await lf.waitForLoadState('networkidle');

  const emailInput = lf.locator('input[name="email"]').first();
  await emailInput.waitFor({ state: 'visible', timeout: 10_000 });
  await emailInput.fill('local@cc-hub.local');
  const pwInput = lf.locator('input[name="password"]').first();
  await pwInput.fill('cchub-local-password');

  await Promise.all([
    lf.waitForURL((url) => !url.toString().includes('sign-in'), { timeout: 15_000 }).catch(() => undefined),
    lf.locator('button[type=submit]').first().click(),
  ]);
  await lf.waitForLoadState('networkidle');

  if (lf.url().includes('sign-in')) {
    await lf.screenshot({ path: path.join(SHOTS, '10-langfuse-traces.png'), fullPage: false });
    console.warn('[capture] Langfuse login failed — screenshot shows sign-in');
    await ctx.close();
    return;
  }

  await lf.goto('http://localhost:3100/project/cmnyyhcf6000cqf07nmfqx60t/traces');
  await lf.waitForLoadState('networkidle');
  await lf.waitForTimeout(2_000);
  await lf.screenshot({ path: path.join(SHOTS, '10-langfuse-traces.png'), fullPage: false });
  await ctx.close();
});
