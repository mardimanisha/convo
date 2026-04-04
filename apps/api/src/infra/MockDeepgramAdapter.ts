import { EventEmitter } from 'events'
import type { IDeepgramAdapter, IDeepgramSession, DeepgramOptions, TranscriptEvent } from './types'

// ── MockDeepgramSession ───────────────────────────────────────────────────────
//
// Used when MOCK_DEEPGRAM=true (Playwright E2E / local dev without a real API key).
//
// Emission sequence:
//   • First call to send() → emits transcript.interim after 50ms
//   • close()              → emits transcript.final after 50ms, then 'close'
//
// This ties fake transcripts to real user actions (start/stop mic) rather than
// arbitrary wall-clock delays, making Playwright assertions deterministic.

class MockDeepgramSession extends EventEmitter implements IDeepgramSession {
  private interimEmitted = false

  send(_chunk: Buffer): void {
    if (!this.interimEmitted) {
      this.interimEmitted = true
      setTimeout(() => {
        this.emit('transcript', {
          type:       'interim',
          text:       'hello wor...',
          confidence: 0.7,
          sessionId:  '',
        } satisfies TranscriptEvent)
      }, 50)
    }
  }

  close(): void {
    setTimeout(() => {
      this.emit('transcript', {
        type:       'final',
        text:       'hello world',
        confidence: 0.99,
        sessionId:  '',
      } satisfies TranscriptEvent)
      // Emit 'close' after the transcript so RelayService processes it cleanly
      setTimeout(() => this.emit('close'), 10)
    }, 50)
  }
}

// ── MockDeepgramAdapter ───────────────────────────────────────────────────────

export class MockDeepgramAdapter implements IDeepgramAdapter {
  async connect(_opts: DeepgramOptions): Promise<IDeepgramSession> {
    return new MockDeepgramSession()
  }
}
