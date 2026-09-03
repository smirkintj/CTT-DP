import { test, expect } from '@playwright/test';
import { loginAsStakeholder, failOnServerErrors } from './helpers';

/**
 * Every admin page loads without a server error.
 *
 * This is the check that would have caught the QA pages rendering blank, and
 * it asserts on API responses because a 400 behind a page often shows only as
 * an empty list.
 */
test.describe('admin pages load', () => {
  const pages = [
    { path: '/admin/dashboard', heading: /dashboard/i },
    { path: '/admin/tasks', heading: /task/i },
    { path: '/admin/draft-tasks', heading: /draft/i },
    { path: '/admin/settings', heading: /settings/i },
    { path: '/admin/database', heading: /database/i },
    { path: '/import', heading: /import/i },
    { path: '/knowledge-base', heading: /knowledge/i }
  ];

  for (const { path, heading } of pages) {
    test(`${path} renders`, async ({ page }) => {
      const errors = failOnServerErrors(page);
      await page.goto(path);

      // A page wired to a dead shell renders an empty body; require real content.
      await expect(page.locator('main')).toContainText(/\w{4,}/, { timeout: 20_000 });
      await expect(page.getByRole('heading', { name: heading }).first()).toBeVisible({
        timeout: 20_000
      });
      expect(errors, `server errors on ${path}`).toEqual([]);
    });
  }
});

test('stakeholder can reach their dashboard', async ({ browser }) => {
  const ctx = await browser.newContext({ storageState: 'e2e/.auth/stakeholder.json' });
  const page = await ctx.newPage();
  const errors = failOnServerErrors(page);
  await page.goto('/');
  await expect(page.locator('main')).toContainText(/\w{4,}/);
  expect(errors).toEqual([]);
  await ctx.close();
});

test('admin nav exposes the grouped destinations', async ({ page }) => {
  await page.goto('/admin/dashboard');
  for (const label of [/dashboard/i, /tasks/i, /jira queue/i, /ai drafts/i, /knowledge base/i]) {
    await expect(page.getByRole('button', { name: label }).first()).toBeVisible();
  }
  // Config and Settings live behind the Admin menu.
  await page.getByRole('button', { name: /^admin$/i }).click();
  await expect(page.getByRole('menuitem', { name: /system database/i })).toBeVisible();
  await expect(page.getByRole('menuitem', { name: /settings/i })).toBeVisible();
});
