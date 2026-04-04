import type { BrowserContext } from '@playwright/test'

/**
 * Grants microphone permission for the browser context.
 *
 * The Chrome launch flags in playwright.config.ts are sufficient for headless CI:
 *   --use-fake-ui-for-media-stream:    auto-accepts the browser permission prompt
 *   --use-fake-device-for-media-stream: exposes a real, recordable fake audio track
 *
 * No getUserMedia JS override is needed. The previous AudioContext oscillator
 * approach caused AudioContext.resume() to hang in headless Linux CI: the
 * autoplay policy suspends new AudioContext instances, and without audio
 * hardware the context cannot resume, so getUserMedia never resolved and the
 * XState machine stayed stuck in 'requesting' instead of advancing to 'recording'.
 *
 * Call once before page.goto() in your test setup.
 */
export async function setupFakeMic(context: BrowserContext): Promise<void> {
  await context.grantPermissions(['microphone'])
}
