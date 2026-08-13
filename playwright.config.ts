import { defineConfig } from '@playwright/test';

// Acceptance tests drive the real app: Vite dev server, real Phaser physics,
// real bridge middleware writing real files. Tests share bridge/ and
// game/environment/ on disk, so they run serially.

export default defineConfig({
  testDir: 'e2e',
  workers: 1,
  fullyParallel: false,
  timeout: 60_000,
  expect: { timeout: 15_000 },
  use: {
    baseURL: 'http://localhost:5173',
    trace: 'retain-on-failure',
  },
  webServer: {
    command: 'npm run dev',
    url: 'http://localhost:5173',
    reuseExistingServer: true,
    timeout: 30_000,
  },
});
