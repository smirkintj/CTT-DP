import { test as setup } from '@playwright/test';
import fs from 'node:fs';
import path from 'node:path';
import { login, ADMIN_EMAIL, ADMIN_PASSWORD, STAKEHOLDER_EMAIL, STAKEHOLDER_PASSWORD } from './helpers';

/**
 * Sign in once per role and save the session.
 *
 * Logging in inside every spec trips the server-side login rate limiter, which
 * fails later tests for a reason that has nothing to do with what they check.
 */
const dir = path.join(process.cwd(), 'e2e/.auth');
fs.mkdirSync(dir, { recursive: true });

export const ADMIN_STATE = path.join(dir, 'admin.json');
export const STAKEHOLDER_STATE = path.join(dir, 'stakeholder.json');

setup('authenticate as admin', async ({ page }) => {
  await login(page, ADMIN_EMAIL, ADMIN_PASSWORD);
  await page.context().storageState({ path: ADMIN_STATE });
});

setup('authenticate as stakeholder', async ({ page }) => {
  await login(page, STAKEHOLDER_EMAIL, STAKEHOLDER_PASSWORD);
  await page.context().storageState({ path: STAKEHOLDER_STATE });
});
