import { defineConfig, devices } from '@playwright/test'

// Runs against a live stack. The dev stack in /tmp/sb-design/dev.sh serves on port 3700.
const baseURL = process.env.PLAYWRIGHT_BASE_URL || 'http://localhost:3700'

export default defineConfig({
  testDir: './tests',
  timeout: 60_000,
  fullyParallel: false,
  workers: 1,
  retries: process.env.CI ? 2 : 0,
  reporter: process.env.CI ? [['github'], ['html', { open: 'never' }]] : 'list',
  use: {
    baseURL,
    trace: 'on-first-retry',
  },
  projects: [
    {
      name: 'chromium',
      use: { ...devices['Desktop Chrome'] },
    },
  ],
})
