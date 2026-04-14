import { test, expect } from './_fixtures';

const EMOJI_RE = /[\u{1F300}-\u{1F9FF}\u{2600}-\u{27BF}\u{1F000}-\u{1F02F}]/u;

test.describe('Quality gates', () => {
  test('Landing page has no emoji', async ({ authedPage: page }) => {
    const text = await page.locator('body').innerText();
    expect(text).not.toMatch(EMOJI_RE);
  });

  test('Suggestion cards render without emoji span', async ({ authedPage: page }) => {
    const cards = await page.getByRole('button').filter({ hasText: /パケキャプ|Excel|パワポ|PDF/ }).all();
    expect(cards.length).toBeGreaterThan(0);
    for (const card of cards) {
      const txt = await card.innerText();
      expect(txt, `card text: ${txt}`).not.toMatch(EMOJI_RE);
    }
  });

  test('Langfuse health badge appears in sidebar', async ({ authedPage: page }) => {
    const badge = page.getByText(/Langfuse (接続中|未接続|確認中)/);
    await expect(badge).toBeVisible({ timeout: 10_000 });
  });

  test('Attach/Git buttons have no emoji', async ({ authedPage: page }) => {
    const attach = page.getByRole('button', { name: /添付/ });
    const git = page.getByRole('button', { name: /^Git$/ });
    await expect(attach).toBeVisible();
    await expect(git).toBeVisible();
    expect(await attach.innerText()).not.toMatch(EMOJI_RE);
    expect(await git.innerText()).not.toMatch(EMOJI_RE);
  });
});
