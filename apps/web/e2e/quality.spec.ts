import { test, expect } from './_fixtures';

const EMOJI_RE = /[\u{1F300}-\u{1F9FF}\u{2600}-\u{27BF}\u{1F000}-\u{1F02F}]/u;

test.describe('Quality gates', () => {
  test('Landing page has no emoji', async ({ authedPage: page }) => {
    const text = await page.locator('body').innerText();
    expect(text).not.toMatch(EMOJI_RE);
  });

  test('Suggestion chips render without emoji span', async ({ authedPage: page }) => {
    const chips = await page
      .getByRole('button')
      .filter({ hasText: /^(ブレインストーミング|文章作成|Slack|Jira)$/ })
      .all();
    expect(chips.length).toBeGreaterThan(0);
    for (const chip of chips) {
      const txt = await chip.innerText();
      expect(txt, `chip text: ${txt}`).not.toMatch(EMOJI_RE);
    }
  });

  test('Langfuse health badge appears in sidebar', async ({ authedPage: page }) => {
    const badge = page.getByText(/Langfuse (接続中|未接続|確認中)/);
    await expect(badge).toBeVisible({ timeout: 10_000 });
  });

  test('Plus menu reveals attach/git options without emoji', async ({ authedPage: page }) => {
    // Composer's + button opens a popover with 「ファイル添付」+「Git クローン」
    await page.getByRole('button', { name: /添付メニュー/ }).click();
    const attach = page.getByRole('button', { name: /ファイル添付/ });
    const git = page.getByRole('button', { name: /Git クローン/ });
    await expect(attach).toBeVisible();
    await expect(git).toBeVisible();
    expect(await attach.innerText()).not.toMatch(EMOJI_RE);
    expect(await git.innerText()).not.toMatch(EMOJI_RE);
  });
});
