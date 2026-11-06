import { defineConfig, devices } from '@playwright/test';

// E2E runs against the REAL docker-compose stack (nginx -> Express -> Postgres).
// Default: the local stack. Override with BASE_URL=https://amoba.devops-ora.tech to test production.
export default defineConfig({
  testDir: './tests',
  timeout: 30_000,
  retries: process.env.CI ? 1 : 0,
  // One worker: online tests share a single matchmaking queue, so parallel
  // tests could be paired with each other.
  workers: 1,
  reporter: process.env.CI ? [['list'], ['html', { open: 'never' }]] : 'list',
  use: {
    baseURL: process.env.BASE_URL || 'http://localhost:8090',
    trace: 'on-first-retry',
    screenshot: 'only-on-failure',
  },
  projects: [{ name: 'chromium', use: { ...devices['Desktop Chrome'] } }],
});
