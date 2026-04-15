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

  test('Plus menu reveals attach/skill/project options without emoji', async ({ authedPage: page }) => {
    // Composer's + button opens a popover with ファイル添付 / スキル / プロジェクト
    // (Git クローン は Phase 1.14 で撤去済み)
    await page.getByRole('button', { name: /添付メニュー/ }).click();
    const attach = page.getByRole('button', { name: /ファイル添付/ });
    const skill = page.getByRole('button', { name: /スキルを選ぶ/ });
    const project = page.getByRole('button', { name: /プロジェクトを選ぶ/ });
    await expect(attach).toBeVisible();
    await expect(skill).toBeVisible();
    await expect(project).toBeVisible();
    expect(await attach.innerText()).not.toMatch(EMOJI_RE);
    expect(await skill.innerText()).not.toMatch(EMOJI_RE);
    expect(await project.innerText()).not.toMatch(EMOJI_RE);
  });
});
