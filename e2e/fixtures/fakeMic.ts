import type { Page, BrowserContext } from '@playwright/test'

/**
 * Injects a fake getUserMedia implementation into the page.
 *
 * Returns a MediaStream backed by a silent AudioContext oscillator.
 * This gives MediaRecorder a valid, recordable audio track without
 * requiring real microphone hardware.
 *
 * Why oscillator instead of a plain stub:
 *   MediaRecorder throws if the stream has no active audio track.
 *   An AudioContext → MediaStreamDestination provides a real track
 *   that MediaRecorder can encode into audio/webm blobs.
 *
 * Must be called before page.goto() so the override is in place
 * before React mounts and AudioCapture registers its event handlers.
 */
export async function installFakeMic(page: Page): Promise<void> {
  await page.addInitScript(() => {
    // Bail out if mediaDevices isn't exposed (older browsers, non-secure contexts).
    // The --use-fake-device-for-media-stream Chrome flag provides a real fake device
    // anyway, so this override is a belt-and-suspenders extra for local dev.
    if (!navigator.mediaDevices) return

    const fakeFn = async (_constraints: MediaStreamConstraints): Promise<MediaStream> => {
      const ctx = new AudioContext()
      const osc = ctx.createOscillator()
      const dst = ctx.createMediaStreamDestination()

      osc.type = 'sine'
      osc.frequency.value = 440
      osc.connect(dst)
      osc.start()

      // Resume context — required when Chrome's autoplay policy suspends it.
      // In headless mode with --use-fake-ui-for-media-stream this is a no-op.
      if (ctx.state === 'suspended') {
        await ctx.resume()
      }

      return dst.stream
    }

    // Prefer direct assignment over Object.defineProperty — more reliable across
    // Chromium versions and headless security contexts.
    try {
      navigator.mediaDevices.getUserMedia = fakeFn
    } catch {
      // Fallback: some strict contexts disallow direct assignment on the prototype chain
      Object.defineProperty(navigator.mediaDevices, 'getUserMedia', {
        writable: true, configurable: true, value: fakeFn,
      })
    }
  })
}

/**
 * Grants microphone permission for the browser context and installs
 * the fake getUserMedia override in the page.
 *
 * Call once before page.goto() in your test setup.
 */
export async function setupFakeMic(context: BrowserContext, page: Page): Promise<void> {
  await context.grantPermissions(['microphone'])
  await installFakeMic(page)
}
