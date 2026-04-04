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
    Object.defineProperty(navigator.mediaDevices, 'getUserMedia', {
      writable: true,
      configurable: true,
      value: async (_constraints: MediaStreamConstraints): Promise<MediaStream> => {
        const ctx = new AudioContext({ sampleRate: 16_000 })
        const osc = ctx.createOscillator()
        const dst = ctx.createMediaStreamDestination()

        // 440 Hz tone — inaudible to the test runner, valid to MediaRecorder
        osc.type = 'sine'
        osc.frequency.value = 440
        osc.connect(dst)
        osc.start()

        // Resume context in case Chrome's autoplay policy suspended it
        if (ctx.state === 'suspended') {
          await ctx.resume()
        }

        return dst.stream
      },
    })
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
