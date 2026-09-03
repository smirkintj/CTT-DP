import { test, expect } from '@playwright/test';
import { failOnServerErrors } from './helpers';

/**
 * Import a QA workbook and create UAT tasks from it.
 *
 * This is the flow that shipped broken: the wizard never sent productId, so
 * POST /api/tasks answered 400 and no task was ever created. The UI showed
 * only a toast, so the assertions here are on the network and on the task
 * actually existing afterwards.
 */

/** A DKSH-shaped workbook: cover sheet first, test cases second. */
async function buildWorkbook(): Promise<Buffer> {
  const XLSX = await import('xlsx');
  const wb = XLSX.utils.book_new();

  // The cover sheet is sheet 1 — reading it instead of the data was the
  // original bug, so the fixture must reproduce that shape.
  const guideline = XLSX.utils.aoa_to_sheet([
    ['Document Name', 'Group Product Engineering & QA 1.0 Suite'],
    ['Test Summary Description', 'E2E fixture'],
    ['List of User Stories', '1.EO-9001\n2.EO-9002']
  ]);
  XLSX.utils.book_append_sheet(wb, guideline, 'Guideline');

  const cases = XLSX.utils.aoa_to_sheet([
    [
      'Sprint ID', 'Priority', 'Test Case Category', 'User Story ID (Jira)', 'Module',
      'Test Case ID', 'Test Case Name', 'Description', 'Steps', 'Expected Result',
      'Environment', 'Test Data', 'Actual Result/ Comments', 'Status', 'Tester, Date'
    ],
    [
      '9', '2- High', 'Functionality', 'EO-9001', '[MY] Checkout Flow',
      '1', 'Cart totals recalculate', 'Verify totals update after quantity change',
      'Preconditions: Logged in\n\nTest Steps:\n1.Open cart.\n2.Change quantity to 3.',
      'Validate the following:\n\n-Line total updates\n-Order total updates',
      'Staging', '', 'https://jam.dev/c/should-be-stripped', 'Pass', 'QA, 1/1/2026'
    ],
    [
      '9', '3- Medium', 'Functionality', 'EO-9001', '[MY] Checkout Flow',
      '2', 'Promo code applies', 'Verify a valid promo reduces the total',
      'Test Steps:\n1.Enter promo SAVE10.\n2.Apply.',
      'Validate the following:\n\n-Discount shown\n-Total reduced by 10%',
      'Staging', '', '', 'Not Started', ''
    ],
    [
      '9', '2- High', 'Functionality', 'EO-9002', 'Order History',
      '3', 'History lists recent orders', 'Verify recent orders appear',
      'Test Steps:\n1.Open Order History.',
      'Validate the following:\n\n-Most recent order is first',
      'Staging', '', '', 'Pass', 'QA, 2/1/2026'
    ]
  ]);
  XLSX.utils.book_append_sheet(wb, cases, 'Test Cases');

  return XLSX.write(wb, { type: 'buffer', bookType: 'xlsx' }) as Buffer;
}

test('imports a workbook and creates a task per market', async ({ page, request }) => {
  const errors = failOnServerErrors(page);
  await page.goto('/import');

  await page.setInputFiles('input[type="file"]', {
    name: 'e2e-sit-cases.xlsx',
    mimeType: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
    buffer: await buildWorkbook()
  });

  // Sheet resolution: the data sheet must win over the cover sheet.
  await expect(page.getByText(/sheet\s*[“"]?Test Cases/i)).toBeVisible({ timeout: 20_000 });

  // Both stories are detected and selected by default.
  await expect(page.getByText('EO-9001')).toBeVisible();
  await expect(page.getByText('EO-9002')).toBeVisible();

  // Draft, then create. Without a provider configured this uses the structured
  // path, which is exactly what should still produce valid tasks.
  await page.getByRole('button', { name: /draft uat tasks/i }).click();
  await expect(page.getByText(/tasks? drafted/i)).toBeVisible({ timeout: 60_000 });

  // EO-9002 has no [XX] prefix, so no market is detected — creating must stay
  // blocked until one is chosen, and the button must say so rather than
  // advertising a count it will refuse to create.
  await expect(page.getByRole('button', { name: /needs? a market/i })).toBeDisabled();
  const secondCard = page.locator('input[placeholder="Task title"]').nth(1);
  await expect(secondCard).toBeVisible();
  await secondCard
    .locator('xpath=ancestor::div[contains(@class,"rounded-xl")][1]')
    .getByRole('button', { name: 'MY', exact: true })
    .click();

  const uniqueTitle = `E2E Checkout ${Date.now()}`;
  await page.locator('input[placeholder="Task title"]').first().fill(uniqueTitle);

  const createButton = page.getByRole('button', { name: /create \d+ tasks?/i });
  await expect(createButton).toBeEnabled();
  await createButton.click();

  // The toast is not proof; the task has to exist.
  await expect(page.getByText(/created \d+ tasks?/i)).toBeVisible({ timeout: 60_000 });

  const res = await request.get('/api/tasks');
  expect(res.ok()).toBeTruthy();
  const tasks = (await res.json()) as Array<{ title: string }>;
  expect(
    tasks.some((t) => t.title === uniqueTitle),
    'created task should be retrievable from the API'
  ).toBeTruthy();

  expect(errors, 'no server errors during import').toEqual([]);
});

test('rejects a file it cannot read instead of doing nothing', async ({ page }) => {
  await page.goto('/import');
  await page.setInputFiles('input[type="file"]', {
    name: 'broken.xlsx',
    mimeType: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
    buffer: Buffer.from('this is not a workbook')
  });
  await expect(page.getByText(/could not read that file|no usable rows/i)).toBeVisible({
    timeout: 20_000
  });
});
