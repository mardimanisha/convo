import { WsTransport } from '../data/WsTransport'
import { SpeechError } from '../data/types'

// ── Mock WebSocket ────────────────────────────────────────────────────────────

type WsEventHandler = (e?: unknown) => void

class MockWebSocket {
  static instances: MockWebSocket[] = []
  static OPEN = 1
  static CLOSED = 3

  readonly url: string
  readonly _headers: Record<string, string> = {}
  binaryType: string = 'blob'
  readyState: number = MockWebSocket.OPEN

  onopen:    WsEventHandler | null = null
  onerror:   WsEventHandler | null = null
  onmessage: WsEventHandler | null = null
  onclose:   WsEventHandler | null = null

  send = jest.fn()

  constructor(url: string) {
    this.url = url
    MockWebSocket.instances.push(this)
    // Fire onopen asynchronously so the Promise resolves
    Promise.resolve().then(() => this.onopen?.())
  }

  close() {
    this.readyState = MockWebSocket.CLOSED
    this.onclose?.()
  }

  /** Test helper: simulate incoming message */
  simulateMessage(data: unknown) {
    this.onmessage?.({ data: JSON.stringify(data) })
  }

  /** Test helper: simulate server-side close without client calling disconnect() */
  simulateClose() {
    this.readyState = MockWebSocket.CLOSED
    this.onclose?.()
  }

  /** Test helper: simulate error after open */
  simulateError() {
    this.onerror?.({})
  }
}

beforeEach(() => {
  MockWebSocket.instances = []
  ;(global as unknown as Record<string, unknown>)['WebSocket'] = MockWebSocket
  jest.useFakeTimers()
})

afterEach(() => {
  jest.useRealTimers()
  jest.restoreAllMocks()
})

// ── Tests ─────────────────────────────────────────────────────────────────────

describe('WsTransport', () => {
  it('connect() opens a WebSocket with sessionId in URL', async () => {
    const transport = new WsTransport('wss://api.test/ws')
    await transport.connect('sess-1')

    const ws = MockWebSocket.instances[0]!
    expect(ws).toBeDefined()
    expect(ws.url).toContain('sessionId=sess-1')
  })

  it('attaches X-Session-Id and Authorization headers', async () => {
    const transport = new WsTransport('wss://api.test/ws', { token: 'tok-abc' })
    await transport.connect('sess-2')

    const ws = MockWebSocket.instances[0]!
    const headers = (ws as unknown as Record<string, Record<string, string>>)['_headers']
    expect(headers?.['X-Session-Id']).toBe('sess-2')
    expect(headers?.['Authorization']).toBe('Bearer tok-abc')
  })

  it('sendBinary() sends an ArrayBuffer when OPEN', async () => {
    const transport = new WsTransport('wss://api.test/ws')
    await transport.connect('sess-3')

    const buf = new ArrayBuffer(8)
    transport.sendBinary(buf)

    const ws = MockWebSocket.instances[0]!
    expect(ws.send).toHaveBeenCalledWith(buf)
  })

  it('sendJSON() serialises and sends an object when OPEN', async () => {
    const transport = new WsTransport('wss://api.test/ws')
    await transport.connect('sess-4')

    transport.sendJSON({ type: 'session.open', sessionId: 'sess-4', lang: 'en-US' })

    const ws = MockWebSocket.instances[0]!
    expect(ws.send).toHaveBeenCalledWith(
      JSON.stringify({ type: 'session.open', sessionId: 'sess-4', lang: 'en-US' }),
    )
  })

  it('emits parsed "message" events on incoming JSON frames', async () => {
    const transport = new WsTransport('wss://api.test/ws')
    await transport.connect('sess-5')

    const messages: unknown[] = []
    transport.on('message', m => messages.push(m))

    MockWebSocket.instances[0]!.simulateMessage({ type: 'transcript.final', text: 'hello' })

    expect(messages).toHaveLength(1)
    expect(messages[0]).toEqual({ type: 'transcript.final', text: 'hello' })
  })

  it('emits "close" when the socket closes cleanly', async () => {
    const transport = new WsTransport('wss://api.test/ws')
    await transport.connect('sess-6')

    const closeFired = jest.fn()
    transport.on('close', closeFired)

    transport.disconnect()
    expect(closeFired).toHaveBeenCalledTimes(1)
  })

  it('schedules reconnect with backoff when server closes unexpectedly', async () => {
    const transport = new WsTransport('wss://api.test/ws', { baseDelay: 500, maxDelay: 30_000 })
    await transport.connect('sess-7')

    const connectSpy = jest.spyOn(transport as unknown as { connect: (id: string) => Promise<void> }, 'connect')

    // Simulate unexpected server close (not from disconnect())
    MockWebSocket.instances[0]!.simulateClose()

    // Advance timer past max first-attempt window (500 * 2^1 * 1.2 = 1200ms)
    jest.advanceTimersByTime(1500)

    expect(connectSpy).toHaveBeenCalledWith('sess-7')
  })

  it('respects the 30s maximum reconnect delay cap', () => {
    const baseDelay = 500
    const maxDelay  = 30_000
    const transport = new WsTransport('wss://api.test/ws', { baseDelay, maxDelay })

    // Access private scheduleReconnect by casting
    const priv = transport as unknown as {
      baseDelay: number; maxDelay: number; attempts: number;
      scheduleReconnect(): void
    }

    // Simulate many failed attempts
    priv.attempts = 20

    // Spy on setTimeout to capture delay
    const delays: number[] = []
    jest.spyOn(global, 'setTimeout').mockImplementation((fn, delay) => {
      delays.push(delay as number)
      return 0 as unknown as ReturnType<typeof setTimeout>
    })

    priv.scheduleReconnect()

    // Delay (before jitter) = min(500 * 2^20, 30000) = 30000
    // With ±20% jitter the delay is between 24000 and 36000
    expect(delays[0]).toBeGreaterThanOrEqual(24_000)
    expect(delays[0]).toBeLessThanOrEqual(36_000)
  })

  it('disconnect() prevents reconnect loop', async () => {
    const transport = new WsTransport('wss://api.test/ws')
    await transport.connect('sess-8')

    const connectSpy = jest.spyOn(
      transport as unknown as { connect: (id: string) => Promise<void> }, 'connect',
    )

    transport.disconnect()
    jest.advanceTimersByTime(10_000)

    expect(connectSpy).not.toHaveBeenCalled()
  })
})
