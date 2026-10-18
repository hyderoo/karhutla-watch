import { defineConfig } from '@playwright/test';

// E2E runs against the deployed app by default; set E2E_BASE_URL to test a local build.
export default defineConfig({
  testDir: './tests',
  timeout: 60_000,
  expect: { timeout: 15_000 },
  retries: process.env.CI ? 1 : 0,
  workers: 1,
  reporter: process.env.CI ? [['html', { open: 'never' }], ['list']] : [['list']],
  use: {
    baseURL: process.env.E2E_BASE_URL ?? 'https://karhutla-watch.vercel.app',
    viewport: { width: 1280, height: 800 },
    actionTimeout: 15_000,
  },
});
