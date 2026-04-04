import { defineConfig, devices } from '@playwright/test'

/**
 * Playwright configuration for SpeechWidget browser E2E tests (P5-2).
 *
 * Before running locally:
 *   1. docker compose up redis -d
 *   2. npx playwright install --with-deps chromium   (one-time)
 *   3. npm run test:pw
 *
 * The API server starts with MOCK_DEEPGRAM=true so no real Deepgram key is needed.
 */
export default defineConfig({
  testDir: './e2e',

  // Fail fast: stop after first test file failure in CI
  fullyParallel: false,
  forbidOnly: !!process.env.CI,
  retries: process.env.CI ? 1 : 0,
  timeout: 30_000,

  use: {
    baseURL: 'http://localhost:5173',
    trace: 'on-first-retry',
  },

  projects: [
    {
      name: 'chromium',
      use: {
        ...devices['Desktop Chrome'],
        launchOptions: {
          args: [
            // Required for getUserMedia to work in headless Chromium on Linux CI.
            // Without these flags, getUserMedia either blocks on a permission dialog
            // or returns no devices because there's no physical audio hardware.
            '--use-fake-ui-for-media-stream',    // auto-accept permission prompts
            '--use-fake-device-for-media-stream', // provide a fake audio/video device
          ],
        },
      },
    },
  ],

  webServer: [
    {
      // API server with mock Deepgram (no real API key required)
      command: 'npm run dev --workspace=apps/api',
      url: 'http://localhost:3000/health',
      timeout: 20_000,
      reuseExistingServer: !process.env.CI,
      env: {
        PORT:          '3000',
        MOCK_DEEPGRAM: 'true',
        REDIS_URL:     process.env['REDIS_URL'] ?? 'redis://localhost:6379',
        INSTANCE_ID:   'playwright',
        LOG_LEVEL:     'warn',   // suppress pino noise during tests
      },
    },
    {
      // Demo page served by Vite (imports speech-widget source directly)
      command: 'npx vite demo --port 5173',
      url: 'http://localhost:5173',
      timeout: 15_000,
      reuseExistingServer: !process.env.CI,
    },
  ],
})
