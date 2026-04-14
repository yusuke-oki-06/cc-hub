import { test as base } from '@playwright/test';

const TOKEN = process.env.RUNNER_API_TOKEN ?? 'dev-token-change-me-in-production-0000000000000000';

/**
 * Shared test fixture that pre-seeds the API token into localStorage so
 * pages load without the TokenSetup prompt.
 */
export const test = base.extend<{ authedPage: import('@playwright/test').Page }>({
  authedPage: async ({ page, baseURL }, use) => {
    await page.goto(baseURL ?? 'http://localhost:3000');
    await page.evaluate((t) => {
      window.localStorage.setItem('cc-hub-token', t);
    }, TOKEN);
    await page.reload();
    await use(page);
  },
});

export { expect } from '@playwright/test';
