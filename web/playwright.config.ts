import { defineConfig, devices } from '@playwright/test';

// Reuses the dev server already running on :3000 (no webServer block on purpose).
export default defineConfig({
  testDir: './e2e',
  retries: 0,
  workers: 2,
  timeout: 60_000,
  expect: { timeout: 20_000 },
  reporter: [['list'], ['html', { open: 'never' }]],
  use: { baseURL: 'http://localhost:3000', trace: 'retain-on-failure', screenshot: 'only-on-failure', actionTimeout: 15_000 },
  projects: [
    { name: 'phone', use: { ...devices['Desktop Chrome'], viewport: { width: 390, height: 844 }, isMobile: true, hasTouch: true } },
    { name: 'desktop', use: { ...devices['Desktop Chrome'], viewport: { width: 1440, height: 900 } } },
  ],
});
