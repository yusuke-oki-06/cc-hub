import { test, expect } from './_fixtures';
import path from 'node:path';

const SHOTS = path.resolve(__dirname, '..', '..', '..', 'docs', 'demo');

test.describe.configure({ mode: 'serial' });

test('capture screenshots for article', async ({ authedPage: page }) => {
  test.setTimeout(180_000);

  // 1. Landing
  await page.goto('/');
  await page.waitForLoadState('networkidle');
  await page.screenshot({ path: path.join(SHOTS, '01-landing.png'), fullPage: false });

  // 2. Wiki graph (user vault already seeded with 14 nodes)
  await page.goto('/wiki');
  await page.waitForLoadState('networkidle');
  // Let force-directed graph settle for a moment
  await page.waitForTimeout(3_000);
  await page.screenshot({ path: path.join(SHOTS, '02-wiki-graph.png'), fullPage: false });

  // 3. Wiki reading view — click the "リーディング" tab
  await page.getByRole('button', { name: /^リーディング$/ }).click();
  // Click the concepts/memex page from the tree
  const memexLink = page.getByRole('button', { name: /memex\.md$/ }).first();
  if (await memexLink.isVisible().catch(() => false)) {
    await memexLink.click();
    await page.waitForTimeout(500);
  }
  await page.screenshot({ path: path.join(SHOTS, '03-wiki-reading.png'), fullPage: false });

  // 4. Tasks sidebar with active/past tasks
  await page.goto('/');
  await page.waitForLoadState('networkidle');
  await page.screenshot({ path: path.join(SHOTS, '04-landing-sidebar.png'), fullPage: true });

  // 5. Submit a quick prompt and capture task page mid-stream
  await page.getByPlaceholder(/例:/).fill('"pong" とだけ返答してください。');
  await page.getByRole('button', { name: /実行/ }).click();
  await page.waitForURL(/\/tasks\/[0-9a-f-]+/, { timeout: 45_000 });
  // Wait until we see either ThinkingIndicator or the first assistant bubble
  await expect(
    page.getByText(/Claude が考えています|完了しました|pong/i).first(),
  ).toBeVisible({ timeout: 60_000 });
  await page.waitForTimeout(1500);
  await page.screenshot({ path: path.join(SHOTS, '05-task-view.png'), fullPage: false });
});

test('capture Langfuse trace UI', async ({ browser }) => {
  test.setTimeout(90_000);
  const ctx = await browser.newContext({ viewport: { width: 1440, height: 860 } });
  const lf = await ctx.newPage();
  await lf.goto('http://localhost:3100/auth/sign-in');
  await lf.waitForLoadState('networkidle');

  // Langfuse v3 sign-in form — email field has name="email", password has name="password"
  const emailInput = lf.locator('input[name="email"]').first();
  await emailInput.waitFor({ state: 'visible', timeout: 10_000 });
  await emailInput.fill('local@cc-hub.local');
  const pwInput = lf.locator('input[name="password"]').first();
  await pwInput.fill('cchub-local-password');

  // Submit and wait for redirect away from sign-in
  await Promise.all([
    lf.waitForURL((url) => !url.toString().includes('sign-in'), { timeout: 15_000 }).catch(() => undefined),
    lf.locator('button[type=submit]').first().click(),
  ]);
  await lf.waitForLoadState('networkidle');

  // Still on sign-in? Give up and screenshot what we have for debugging.
  if (lf.url().includes('sign-in')) {
    await lf.screenshot({ path: path.join(SHOTS, '06-langfuse-traces.png'), fullPage: false });
    console.warn('[capture] Langfuse login failed — screenshot shows sign-in');
    await ctx.close();
    return;
  }

  await lf.goto('http://localhost:3100/project/cmnyyhcf6000cqf07nmfqx60t/traces');
  await lf.waitForLoadState('networkidle');
  await lf.waitForTimeout(2_000);
  await lf.screenshot({ path: path.join(SHOTS, '06-langfuse-traces.png'), fullPage: false });
  await ctx.close();
});
