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

/**
 * Navigation must acknowledge a click immediately.
 *
 * These pages are server-rendered per request. Without pending UI the previous
 * page stayed on screen for the whole render — several hundred milliseconds in
 * which nothing responded to the click, which read as the app being frozen.
 */
test('nav acknowledges a click before the page arrives', async ({ page }) => {
  await page.goto('/admin/dashboard');

  // Hold the navigation so the pending state is observable. On a warm client
  // cache the route resolves in tens of milliseconds, which would make this
  // assertion a race rather than a check.
  await page.route('**/admin/tasks**', async (route) => {
    await new Promise((r) => setTimeout(r, 1_000));
    await route.continue();
  });

  await page.getByRole('button', { name: /^tasks$/i }).first().click();

  // Either the clicked item marks itself busy or the progress bar appears —
  // something must respond without waiting for the server.
  await expect(
    page.locator('[aria-busy="true"], [role="progressbar"]').first()
  ).toBeVisible({ timeout: 900 });

  await page.unroute('**/admin/tasks**');
  await expect(page.getByRole('heading', { name: /task/i }).first()).toBeVisible({
    timeout: 20_000
  });
});
