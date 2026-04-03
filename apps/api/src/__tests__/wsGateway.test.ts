import { createServer } from 'http'
import { EventEmitter } from 'events'
import { AddressInfo } from 'net'
import WebSocket from 'ws'
import { app } from '../index'
import { attachWsGateway } from '../routes/wsGateway'
import type { IRelayService, ISessionService, TranscriptEvent } from '../infra/types'

// Do NOT mock ../infra/metrics here — metricsRoute uses registry.metrics() from
// the real prom-client Registry. Mocking metrics would replace registry with
// undefined and cause /metrics to return 500.

// ── Mocks ─────────────────────────────────────────────────────────────────────

class MockRelayService extends EventEmitter implements IRelayService {
  openSession  = jest.fn().mockResolvedValue(undefined)
  pipeChunk    = jest.fn()
  closeSession = jest.fn().mockResolvedValue(undefined)
}

const mockSessionService: jest.Mocked<ISessionService> = {
  create: jest.fn(),
  get:    jest.fn(),
  touch:  jest.fn(),
  delete: jest.fn().mockResolvedValue(undefined),
}

// ── Server helpers ────────────────────────────────────────────────────────────

interface TestServer {
  url:   string
  close: () => Promise<void>
}

function startServer(relay: MockRelayService): Promise<TestServer> {
  const server = createServer(app)
  const wss    = attachWsGateway(server, relay, mockSessionService)

  return new Promise((resolve) => {
    server.listen(0, '127.0.0.1', () => {
      const { port } = server.address() as AddressInfo
      resolve({
        url: `ws://127.0.0.1:${port}`,
        close: () =>
          new Promise((res) => {
            // Terminate all open WS connections so server.close() does not hang
            wss.clients.forEach((c) => c.terminate())
            server.close(() => res())
          }),
      })
    })
  })
}

function connect(url: string, headers?: Record<string, string>): Promise<WebSocket> {
  return new Promise((resolve, reject) => {
    const ws = new WebSocket(url, { headers })
    ws.once('open',  () => resolve(ws))
    ws.once('error', reject)
  })
}

function nextMessage(ws: WebSocket): Promise<object> {
  return new Promise((resolve, reject) => {
    ws.once('message', (data) => {
      try { resolve(JSON.parse(data.toString())) }
      catch (e) { reject(e) }
    })
    ws.once('error', reject)
  })
}

// ── Tests ─────────────────────────────────────────────────────────────────────

beforeEach(() => jest.clearAllMocks())

describe('wsGateway', () => {
  describe('control messages', () => {
    test('session.open triggers relay.openSession', async () => {
      const relay = new MockRelayService()
      const { url, close } = await startServer(relay)
      const ws = await connect(url)

      ws.send(JSON.stringify({ type: 'session.open', sessionId: 'c1', lang: 'en-US' }))
      await new Promise(r => setTimeout(r, 50))

      expect(relay.openSession).toHaveBeenCalledWith(expect.any(String), 'en-US')
      await close()
    })

    test('session.close triggers relay.closeSession', async () => {
      const relay = new MockRelayService()
      const { url, close } = await startServer(relay)
      const ws = await connect(url)

      ws.send(JSON.stringify({ type: 'session.open',  sessionId: 'c1', lang: 'en-US' }))
      await new Promise(r => setTimeout(r, 30))
      ws.send(JSON.stringify({ type: 'session.close', sessionId: 'c1' }))
      await new Promise(r => setTimeout(r, 30))

      expect(relay.closeSession).toHaveBeenCalled()
      await close()
    })

    test('malformed JSON returns INVALID_MESSAGE error frame', async () => {
      const relay = new MockRelayService()
      const { url, close } = await startServer(relay)
      const ws = await connect(url)

      const msgPromise = nextMessage(ws)
      ws.send('this is not json')
      const msg = await msgPromise

      expect(msg).toMatchObject({ type: 'error', code: 'INVALID_MESSAGE' })
      await close()
    })

    test('valid JSON with unknown type returns INVALID_MESSAGE error frame', async () => {
      const relay = new MockRelayService()
      const { url, close } = await startServer(relay)
      const ws = await connect(url)

      const msgPromise = nextMessage(ws)
      ws.send(JSON.stringify({ type: 'unknown.event', sessionId: 'x' }))
      const msg = await msgPromise

      expect(msg).toMatchObject({ type: 'error', code: 'INVALID_MESSAGE' })
      await close()
    })
  })

  describe('binary frames', () => {
    test('binary frame is forwarded to relay.pipeChunk', async () => {
      const relay = new MockRelayService()
      const { url, close } = await startServer(relay)
      const ws = await connect(url)

      ws.send(Buffer.from('audio-data'), { binary: true })
      await new Promise(r => setTimeout(r, 30))

      expect(relay.pipeChunk).toHaveBeenCalledWith(
        expect.any(String),
        expect.any(Buffer),
      )
      await close()
    })
  })

  describe('transcript relay', () => {
    test('transcript.final emitted by relay is forwarded to client', async () => {
      const relay = new MockRelayService()
      relay.openSession.mockImplementation(async (sessionId: string) => {
        setImmediate(() => {
          relay.emit('transcript', {
            type: 'final', text: 'hello world', confidence: 0.98, sessionId,
          } satisfies TranscriptEvent)
        })
      })

      const { url, close } = await startServer(relay)
      const ws = await connect(url)

      const transcriptPromise = nextMessage(ws)
      ws.send(JSON.stringify({ type: 'session.open', sessionId: 'c1', lang: 'en-US' }))
      const msg = await transcriptPromise

      expect(msg).toMatchObject({ type: 'transcript.final', text: 'hello world' })
      await close()
    })

    test('transcript.interim is forwarded to client', async () => {
      const relay = new MockRelayService()
      relay.openSession.mockImplementation(async (sessionId: string) => {
        setImmediate(() => {
          relay.emit('transcript', {
            type: 'interim', text: 'hel', confidence: 0.7, sessionId,
          } satisfies TranscriptEvent)
        })
      })

      const { url, close } = await startServer(relay)
      const ws = await connect(url)

      const msgPromise = nextMessage(ws)
      ws.send(JSON.stringify({ type: 'session.open', sessionId: 'c1', lang: 'en-US' }))
      const msg = await msgPromise

      expect(msg).toMatchObject({ type: 'transcript.interim', text: 'hel' })
      await close()
    })
  })

  describe('X-Session-Id sticky routing', () => {
    test('honours client-provided X-Session-Id from upgrade request', async () => {
      const relay = new MockRelayService()
      relay.openSession.mockImplementation(async (sessionId: string) => {
        setImmediate(() => {
          relay.emit('transcript', { type: 'final', text: 'ok', confidence: 1, sessionId })
        })
      })

      const { url, close } = await startServer(relay)
      const clientSessionId = 'client-sticky-id-123'
      const ws = await connect(url, { 'x-session-id': clientSessionId })

      const msgPromise = nextMessage(ws)
      ws.send(JSON.stringify({ type: 'session.open', sessionId: clientSessionId, lang: 'en-US' }))
      const msg = await msgPromise

      // Relay was called with the client-provided session ID, not a server-generated UUID
      expect(relay.openSession).toHaveBeenCalledWith(clientSessionId, 'en-US')
      expect(msg).toMatchObject({ type: 'transcript.final' })
      await close()
    })

    test('generates a UUID when X-Session-Id header is absent', async () => {
      const relay = new MockRelayService()
      const { url, close } = await startServer(relay)
      const ws = await connect(url)  // no x-session-id header

      ws.send(JSON.stringify({ type: 'session.open', sessionId: 'c1', lang: 'en-US' }))
      await new Promise(r => setTimeout(r, 50))

      // openSession was called with a UUID (not 'c1', which is the message's sessionId field —
      // the gateway uses the connection-level sessionId derived from the header or UUID)
      const calledWith = (relay.openSession.mock.calls[0] as [string, string])[0]
      expect(calledWith).toMatch(
        /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/,
      )
      await close()
    })
  })

  describe('cleanup on disconnect', () => {
    test('relay.closeSession and session.delete called on ws close', async () => {
      const relay = new MockRelayService()
      const { url, close } = await startServer(relay)
      const ws = await connect(url)

      // Terminate from client side and give server time to process the close event
      ws.terminate()
      await new Promise(r => setTimeout(r, 50))

      expect(relay.closeSession).toHaveBeenCalled()
      expect(mockSessionService.delete).toHaveBeenCalled()
      await close()
    })
  })

  describe('metrics (P2-5)', () => {
    test('GET /metrics contains all four metric names', async () => {
      const relay = new MockRelayService()
      const { url, close } = await startServer(relay)

      const httpUrl = url.replace('ws://', 'http://')
      const response = await fetch(`${httpUrl}/metrics`)
      const text = await response.text()

      expect(response.status).toBe(200)
      expect(text).toMatch(/ws_connections_active/)
      expect(text).toMatch(/audio_bytes_relayed_total/)
      expect(text).toMatch(/transcript_latency_ms/)
      expect(text).toMatch(/session_open_errors_total/)

      await close()
    })
  })
})
