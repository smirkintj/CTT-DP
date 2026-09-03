import { test, expect } from '@playwright/test';
import { failOnServerErrors } from './helpers';

/**
 * Marking steps pass in quick succession must stick.
 *
 * The reported bug: every step save sent the task version the page loaded with,
 * so the second click onward was rejected as stale, refetched and re-applied —
 * on screen the tick reverted. Clicking slowly hid it because the refetch had
 * landed in between, so this test deliberately clicks with no pause.
 */

// Marking steps is the stakeholder's job, so run as one.
test.use({ storageState: 'e2e/.auth/stakeholder.json' });

/** The first-run tour overlays the page and swallows clicks. */
async function dismissOnboarding(page: import('@playwright/test').Page) {
  const dismiss = page.getByRole('button', { name: /don't show again|skip|close/i }).first();
  if (await dismiss.isVisible().catch(() => false)) {
    await dismiss.click().catch(() => {});
  }
}

test('rapid pass clicks all persist', async ({ page }) => {
  const errors = failOnServerErrors(page);
  const request = page.request;

  const listed = await request.get('/api/tasks');
  expect(listed.ok()).toBeTruthy();
  const tasks = (await listed.json()) as Array<{ id: string }>;

  let targetId: string | null = null;
  let stepCount = 0;
  for (const t of tasks.slice(0, 25)) {
    const res = await request.get(`/api/tasks/${t.id}`);
    if (!res.ok()) continue;
    const full = (await res.json()) as {
      id: string;
      signedOffAt?: string | null;
      steps?: Array<{ id: string }>;
    };
    if (!full.signedOffAt && (full.steps?.length ?? 0) >= 3) {
      targetId = full.id;
      stepCount = full.steps!.length;
      break;
    }
  }
  test.skip(!targetId, 'no unsigned task with 3+ steps available to this stakeholder');

  await page.goto(`/tasks/${targetId}`);
  await dismissOnboarding(page);
  await expect(page.getByRole('button', { name: /^pass$/i }).first()).toBeVisible({
    timeout: 20_000
  });

  // Only the open step exposes its verdict buttons, so open each in turn and
  // hit PASS without waiting — that is the sequence that used to revert.
  const toClick = Math.min(stepCount, 3);
  for (let i = 0; i < toClick; i += 1) {
    const header = page.getByRole('button', { name: new RegExp(`^${i + 1}\\D`) }).first();
    if (await header.isVisible().catch(() => false)) {
      await header.click({ noWaitAfter: true }).catch(() => {});
    }
    const pass = page.getByRole('button', { name: /^pass$/i }).first();
    await expect(pass).toBeVisible({ timeout: 10_000 });
    await pass.click({ noWaitAfter: true });
  }

  // The server's own view is the only proof the clicks stuck.
  await expect
    .poll(
      async () => {
        const res = await request.get(`/api/tasks/${targetId}`);
        if (!res.ok()) return -1;
        const full = (await res.json()) as { steps?: Array<{ stepResult?: string | null }> };
        return (full.steps ?? []).filter((s) => s.stepResult === 'PASSED').length;
      },
      { timeout: 30_000, message: 'each clicked step should be PASSED on the server' }
    )
    .toBeGreaterThanOrEqual(toClick);

  // A 409 is the stale-version bug resurfacing.
  expect(
    errors.filter((e) => e.includes('409')),
    'no stale-version conflicts during rapid marking'
  ).toEqual([]);
});
