import { test, expect } from './_fixtures';

test.describe('Theme toggle', () => {
  test('parchment is default, airbnb toggle flips data-theme + primary color', async ({
    authedPage: page,
  }) => {
    await page.goto('/');

    // Default: no data-theme attribute (parchment).
    const initial = await page.evaluate(() =>
      document.documentElement.getAttribute('data-theme'),
    );
    expect(initial === null || initial === 'parchment').toBe(true);

    // Switch to airbnb via sidebar toggle.
    await page.getByRole('button', { name: /^Airbnb$/ }).click();

    // DOM attribute updated + persisted.
    await expect
      .poll(async () => page.evaluate(() => document.documentElement.dataset.theme))
      .toBe('airbnb');
    const persisted = await page.evaluate(() => localStorage.getItem('cc-hub-theme'));
    expect(persisted).toBe('airbnb');

    // Primary CSS var resolves to coral under airbnb.
    const primary = await page.evaluate(() =>
      getComputedStyle(document.documentElement).getPropertyValue('--primary').trim(),
    );
    expect(primary).toBe('#ff385c');

    // Switch back to parchment.
    await page.getByRole('button', { name: /^Parchment$/ }).click();
    await expect
      .poll(async () =>
        page.evaluate(() => document.documentElement.getAttribute('data-theme')),
      )
      .toBe(null);
  });

  test('theme persists across reload (no FOUC)', async ({ authedPage: page }) => {
    await page.goto('/');
    await page.getByRole('button', { name: /^Airbnb$/ }).click();
    await expect
      .poll(async () => page.evaluate(() => document.documentElement.dataset.theme))
      .toBe('airbnb');

    await page.reload();
    // After reload, inline head script must apply theme BEFORE first paint.
    const theme = await page.evaluate(() => document.documentElement.dataset.theme);
    expect(theme).toBe('airbnb');
  });
});
