import { defineConfig, devices } from '@playwright/test';

/**
 * End-to-end tests against a real app and a real database.
 *
 * Local run:
 *   bash scripts/e2e-setup.sh     # starts postgres, migrates, seeds
 *   npm run test:e2e
 *
 * Set E2E_BASE_URL to test an already-running server (a Vercel preview, say);
 * otherwise the config starts `next dev` itself.
 */
const baseURL = process.env.E2E_BASE_URL || 'http://localhost:3000';

export default defineConfig({
  testDir: './e2e',
  fullyParallel: false, // shared database; parallel specs would fight over data
  forbidOnly: !!process.env.CI,
  retries: process.env.CI ? 1 : 0,
  workers: 1,
  reporter: process.env.CI ? [['list'], ['html', { open: 'never' }]] : [['list']],
  timeout: 60_000,
  expect: { timeout: 10_000 },
  use: {
    baseURL,
    trace: 'retain-on-failure',
    screenshot: 'only-on-failure',
    actionTimeout: 15_000
  },
  projects: [
    {
      name: 'setup',
      testMatch: /auth\.setup\.ts/,
      use: {
        ...devices['Desktop Chrome'],
        launchOptions: process.env.PLAYWRIGHT_CHROMIUM_PATH
          ? { executablePath: process.env.PLAYWRIGHT_CHROMIUM_PATH }
          : undefined
      }
    },
    {
      name: 'chromium',
      dependencies: ['setup'],
      use: {
        ...devices['Desktop Chrome'],
        // Use the Chromium already present in the image rather than pulling a
        // build that matches this @playwright/test version.
        storageState: 'e2e/.auth/admin.json',
        launchOptions: process.env.PLAYWRIGHT_CHROMIUM_PATH
          ? { executablePath: process.env.PLAYWRIGHT_CHROMIUM_PATH }
          : undefined
      }
    }
  ],
  webServer: process.env.E2E_BASE_URL
    ? undefined
    : {
        command: 'npx next start -p 3000',
        url: 'http://localhost:3000',
        reuseExistingServer: true,
        timeout: 180_000
      }
});
