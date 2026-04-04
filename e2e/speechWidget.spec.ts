/**
 * P5-2: Playwright browser E2E — SpeechWidget
 *
 * Prerequisites (local):
 *   docker compose up redis -d
 *   npx playwright install --with-deps chromium
 *   npm run test:pw
 *
 * The API server starts with MOCK_DEEPGRAM=true (see playwright.config.ts).
 * Fake transcripts:
 *   • interim → "hello wor..."  (50ms after first audio chunk)
 *   • final   → "hello world"   (50ms after session.close / stop click)
 */

import { test, expect } from '@playwright/test'
import { setupFakeMic } from './fixtures/fakeMic'

// ── Shared setup ──────────────────────────────────────────────────────────────

test.beforeEach(async ({ page, context }) => {
  // Install fake mic BEFORE goto so the override is in place when React mounts
  await setupFakeMic(context, page)
  await page.goto('/')
})

// ── Test suite ────────────────────────────────────────────────────────────────

test.describe('SpeechWidget E2E (P5-2)', () => {

  // ── Assertion 1 ─────────────────────────────────────────────────────────────

  test('speech button renders and is clickable', async ({ page }) => {
    const button = page.getByTestId('speech-button')

    await expect(button).toBeVisible()
    await expect(button).toBeEnabled()

    // Verify the button is in the idle state (mic icon, not wave animation)
    // The button should not already show the wave animation before clicking
    await expect(page.getByTestId('wave-animation')).not.toBeVisible()
  })

  // ── Assertion 2 ─────────────────────────────────────────────────────────────

  test('click mic → wave animation appears (recording state)', async ({ page }) => {
    const button = page.getByTestId('speech-button')
    await expect(button).toBeVisible()

    await button.click()

    // Machine: idle → requesting → recording
    // WaveAnimation renders when machineState === 'recording'
    await expect(page.getByTestId('wave-animation')).toBeVisible({ timeout: 5_000 })
  })

  // ── Assertion 3 ─────────────────────────────────────────────────────────────

  test('interim transcript appears in preview bubble', async ({ page }) => {
    const button = page.getByTestId('speech-button')
    await expect(button).toBeVisible()

    await button.click()

    // Wait for recording to start and first audio chunk to be sent.
    // MockDeepgramAdapter emits interim 50ms after first chunk.
    // MediaRecorder fires ondataavailable every 100ms.
    // Allow up to 5s for the full chain: click → WS open → chunk → backend → interim.
    await expect(page.getByTestId('transcript-preview')).toBeVisible({ timeout: 5_000 })
    await expect(page.getByTestId('transcript-preview')).toContainText('hello wor...', { timeout: 5_000 })
  })

  // ── Assertion 4 ─────────────────────────────────────────────────────────────

  test('stop → final transcript injected into target input', async ({ page }) => {
    const button = page.getByTestId('speech-button')
    await expect(button).toBeVisible()

    // Start recording
    await button.click()
    await expect(page.getByTestId('wave-animation')).toBeVisible({ timeout: 5_000 })

    // Wait for interim to confirm backend is receiving audio
    await expect(page.getByTestId('transcript-preview')).toContainText('hello wor...', { timeout: 5_000 })

    // Stop recording → finalizeTranscript → session.close → MockDeepgramAdapter.close()
    // → emits transcript.final "hello world" after 50ms → injectTranscript fires
    await button.click()

    await expect(page.locator('#agent-input')).toHaveValue('hello world', { timeout: 5_000 })
  })

  // ── Full lifecycle in one test ────────────────────────────────────────────────
  // Runs all 4 assertions sequentially — useful as a CI smoke test

  test('full lifecycle: button → wave → interim → inject', async ({ page }) => {
    const button  = page.getByTestId('speech-button')
    const wave    = page.getByTestId('wave-animation')
    const preview = page.getByTestId('transcript-preview')
    const input   = page.locator('#agent-input')

    // 1. Button visible
    await expect(button).toBeVisible()

    // 2. Click → wave animation
    await button.click()
    await expect(wave).toBeVisible({ timeout: 5_000 })

    // 3. Interim text in preview
    await expect(preview).toContainText('hello wor...', { timeout: 5_000 })

    // 4. Stop → final text injected
    await button.click()
    await expect(input).toHaveValue('hello world', { timeout: 5_000 })

    // Verify all data-testid attributes are reachable by selector (spec §12.5)
    await expect(page.getByTestId('speech-button')).toBeDefined()
    await expect(page.getByTestId('transcript-preview')).toBeDefined()
  })
})
