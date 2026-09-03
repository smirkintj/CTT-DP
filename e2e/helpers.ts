import { expect, type Page } from '@playwright/test';

export const ADMIN_EMAIL = process.env.E2E_ADMIN_EMAIL || 'admin@dksh.com';
export const ADMIN_PASSWORD = process.env.E2E_ADMIN_PASSWORD || process.env.SEED_ADMIN_PASSWORD || '';
export const STAKEHOLDER_EMAIL = process.env.E2E_STAKEHOLDER_EMAIL || 'uat-my@dksh.com';
export const STAKEHOLDER_PASSWORD =
  process.env.E2E_STAKEHOLDER_PASSWORD || process.env.SEED_USER_PASSWORD || '';

/** Sign in through the real login form and wait for the app shell. */
export async function login(page: Page, email: string, password: string) {
  if (!password) {
    throw new Error(
      `No password for ${email}. Set SEED_ADMIN_PASSWORD / SEED_USER_PASSWORD (or the E2E_* overrides).`
    );
  }

  await page.goto('/');
  const submit = page.getByRole('button', { name: /sign in|log ?in/i });

  // The submit button is disabled until React state holds both fields. Filling
  // before hydration sets the DOM value only, and the controlled inputs are
  // reset when React attaches — so fill, then confirm the button actually
  // enabled, and re-fill if hydration landed in between.
  await expect(submit).toBeVisible();
  await expect(async () => {
    await page.locator('#login-email').fill(email);
    await page.locator('#login-password').fill(password);
    await expect(submit).toBeEnabled({ timeout: 1_000 });
  }).toPass({ timeout: 30_000 });

  await submit.click();

  // The nav only renders once a session exists, so it is the honest signal.
  await expect(page.getByRole('button', { name: /dashboard/i }).first()).toBeVisible({
    timeout: 30_000
  });
}

export const loginAsAdmin = (page: Page) => login(page, ADMIN_EMAIL, ADMIN_PASSWORD);
export const loginAsStakeholder = (page: Page) =>
  login(page, STAKEHOLDER_EMAIL, STAKEHOLDER_PASSWORD);

/**
 * Fail the test on any server error response.
 *
 * The bug that shipped — every task create returning 400 — was invisible in the
 * UI beyond a toast, so asserting on network status is the point of this suite.
 */
export function failOnServerErrors(page: Page, ignore: RegExp[] = []) {
  const errors: string[] = [];
  page.on('response', (res) => {
    const url = res.url();
    if (!url.includes('/api/')) return;
    if (ignore.some((re) => re.test(url))) return;
    if (res.status() >= 400) errors.push(`${res.status()} ${res.request().method()} ${url}`);
  });
  return errors;
}
