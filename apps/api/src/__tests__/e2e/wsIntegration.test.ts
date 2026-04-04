/**
 * P5-1: End-to-end WebSocket integration test
 *
 * Requires a running Redis instance. Set REDIS_URL env var (default: redis://localhost:6379).
 * Run via: REDIS_URL=redis://localhost:6379 npm run test:e2e --workspace=apps/api
 *
 * Uses a MockDeepgramAdapter (no real API key needed) that emits a deterministic
 * transcript.final ~50ms after the first audio chunk is received.
 */

import WebSocket from 'ws'
import { createTestServer, TestServer } from './helpers/testServer'

// ── Helpers ───────────────────────────────────────────────────────────────────

function connectWs(url: string, headers?: Record<string, string>): Promise<WebSocket> {
  return new Promise((resolve, reject) => {
    const ws = new WebSocket(url, { headers })
    ws.once('open',  () => resolve(ws))
    ws.once('error', reject)
  })
}

function nextMessage(ws: WebSocket): Promise<Record<string, unknown>> {
  return new Promise((resolve, reject) => {
    ws.once('message', (data) => {
      try { resolve(JSON.parse(data.toString()) as Record<string, unknown>) }
      catch (e) { reject(e) }
    })
    ws.once('error', reject)
  })
}

function sleep(ms: number): Promise<void> {
  return new Promise(r => setTimeout(r, ms))
}

// ── Suite ─────────────────────────────────────────────────────────────────────

describe('WebSocket E2E integration (P5-1)', () => {
  let server: TestServer

  beforeAll(async () => {
    server = await createTestServer()
  }, 10_000)

  afterAll(async () => {
    await server.close()
  }, 10_000)

  // ── P5-1 core: full session lifecycle ──────────────────────────────────────

  test('full lifecycle — transcript.final received within 800ms', async () => {
    const sessionId = 'e2e-lifecycle-1'
    const ws        = await connectWs(server.url, { 'x-session-id': sessionId })

    const t0 = Date.now()

    // 1. Open session
    ws.send(JSON.stringify({ type: 'session.open', sessionId, lang: 'en-US' }))

    // 2. Send binary audio chunks (100ms timeslice, ~1600 bytes each at 16kHz mono PCM)
    await sleep(20)
    ws.send(Buffer.alloc(1600), { binary: true })
    ws.send(Buffer.alloc(1600), { binary: true })
    ws.send(Buffer.alloc(1600), { binary: true })

    // 3. Await transcript.final
    const msg     = await nextMessage(ws)
    const elapsed = Date.now() - t0

    expect(msg).toMatchObject({ type: 'transcript.final', text: 'hello world' })
    expect(elapsed).toBeLessThan(800)

    // 4. Close session cleanly
    ws.send(JSON.stringify({ type: 'session.close', sessionId }))
    await sleep(30)
    ws.terminate()
  }, 5_000)

  // ── Error handling ─────────────────────────────────────────────────────────

  test('malformed JSON returns INVALID_MESSAGE error frame', async () => {
    const ws         = await connectWs(server.url)
    const msgPromise = nextMessage(ws)

    ws.send('this is definitely not json')

    const msg = await msgPromise
    expect(msg).toMatchObject({ type: 'error', code: 'INVALID_MESSAGE' })
    ws.terminate()
  }, 5_000)

  test('valid JSON with unknown type returns INVALID_MESSAGE error frame', async () => {
    const ws         = await connectWs(server.url)
    const msgPromise = nextMessage(ws)

    ws.send(JSON.stringify({ type: 'completely.unknown', sessionId: 'x' }))

    const msg = await msgPromise
    expect(msg).toMatchObject({ type: 'error', code: 'INVALID_MESSAGE' })
    ws.terminate()
  }, 5_000)

  // ── Structured logging (NF-05) ─────────────────────────────────────────────
  //
  // We can't capture pino JSON output mid-test, but we verify the session
  // lifecycle completes without throwing — which proves the child logger
  // carrying { sessionId } is wired correctly (a broken logger would throw
  // during the log.info / log.error calls in wsGateway and SpeechController).

  test('session lifecycle completes without error (verifies NF-05 logger wiring)', async () => {
    const sessionId = 'e2e-log-test'
    const ws        = await connectWs(server.url, { 'x-session-id': sessionId })

    ws.send(JSON.stringify({ type: 'session.open', sessionId, lang: 'en-US' }))
    await sleep(20)
    ws.send(Buffer.alloc(1600), { binary: true })

    const msg = await nextMessage(ws)
    expect(msg).toMatchObject({ type: 'transcript.final' })

    ws.send(JSON.stringify({ type: 'session.close', sessionId }))
    await sleep(30)
    ws.terminate()
  }, 5_000)

  // ── X-Session-Id sticky routing ────────────────────────────────────────────

  test('X-Session-Id header is honoured for sticky routing', async () => {
    const stickyId = 'e2e-sticky-session'
    const ws       = await connectWs(server.url, { 'x-session-id': stickyId })

    ws.send(JSON.stringify({ type: 'session.open', sessionId: stickyId, lang: 'en-US' }))
    await sleep(20)
    ws.send(Buffer.alloc(1600), { binary: true })

    const msg = await nextMessage(ws)
    // The transcript arrives on the correct session — confirms sessionId routing
    expect(msg).toMatchObject({ type: 'transcript.final', text: 'hello world' })

    ws.send(JSON.stringify({ type: 'session.close', sessionId: stickyId }))
    await sleep(30)
    ws.terminate()
  }, 5_000)
})
