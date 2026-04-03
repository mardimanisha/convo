import { DeepgramAdapter } from '../infra/DeepgramAdapter'
import { SpeechError } from '../infra/types'
import type { IDeepgramSession } from '../infra/types'

// ── Mock @deepgram/sdk ────────────────────────────────────────────────────────

type EventHandler = (...args: unknown[]) => void

class MockLiveConn {
  readonly listeners: Record<string, EventHandler[]> = {}
  keepAlive    = jest.fn()
  requestClose = jest.fn()
  send         = jest.fn()

  on(event: string, fn: EventHandler): this {
    ;(this.listeners[event] ??= []).push(fn)
    return this
  }
  removeListener(event: string, fn: EventHandler): this {
    this.listeners[event] = (this.listeners[event] ?? []).filter(f => f !== fn)
    return this
  }
  removeAllListeners(): this {
    Object.keys(this.listeners).forEach(k => { delete this.listeners[k] })
    return this
  }
  emit(event: string, ...args: unknown[]): void {
    for (const fn of this.listeners[event] ?? []) fn(...args)
  }
}

let mockConn: MockLiveConn

jest.mock('@deepgram/sdk', () => ({
  LiveTranscriptionEvents: {
    Open:         'open',
    Close:        'close',
    Error:        'error',
    Transcript:   'Results',
    UtteranceEnd: 'UtteranceEnd',
  },
  createClient: jest.fn(() => ({
    listen: {
      live: jest.fn(() => {
        mockConn = new MockLiveConn()
        return mockConn
      }),
    },
  })),
}))

// ── Helpers ───────────────────────────────────────────────────────────────────

async function openSession(apiKey = 'test-key'): Promise<IDeepgramSession> {
  process.env['DEEPGRAM_API_KEY'] = apiKey
  const adapter = new DeepgramAdapter()
  const promise = adapter.connect({ language: 'en-US' })
  await Promise.resolve()       // let connectWithRetry register listeners
  mockConn.emit('open')
  return promise
}

// ── Tests ─────────────────────────────────────────────────────────────────────

beforeEach(() => {
  delete process.env['DEEPGRAM_API_KEY']
  jest.clearAllMocks()
})

describe('DeepgramAdapter', () => {
  // ── Fix #7 ──────────────────────────────────────────────────────────────────
  test('throws SpeechError(DEEPGRAM_UNAVAILABLE) when API key is missing', async () => {
    const adapter = new DeepgramAdapter()
    const err = await adapter.connect({ language: 'en-US' }).catch(e => e)
    expect(err).toBeInstanceOf(SpeechError)
    expect(err.code).toBe('DEEPGRAM_UNAVAILABLE')
  })

  test('resolves with a session on successful open', async () => {
    const session = await openSession()
    expect(session).toBeDefined()
  })

  // ── Fix #1 ──────────────────────────────────────────────────────────────────
  test('send() passes a correctly sliced ArrayBuffer (not the full pool buffer)', async () => {
    const session = await openSession()
    const chunk = Buffer.from('audio')
    session.send(chunk)
    expect(mockConn.send).toHaveBeenCalledTimes(1)
    const sent = mockConn.send.mock.calls[0][0] as ArrayBuffer
    // Must be exactly the right byte length — not the full underlying pool
    expect(sent.byteLength).toBe(chunk.byteLength)
    expect(Buffer.from(sent).toString()).toBe('audio')
  })

  test('send() is a no-op after close()', async () => {
    const session = await openSession()
    session.close()
    session.send(Buffer.from('late'))
    expect(mockConn.send).not.toHaveBeenCalled()
  })

  // ── Fix #6 ──────────────────────────────────────────────────────────────────
  test('keepAlive() throws inside interval are swallowed', async () => {
    jest.useFakeTimers()
    try {
      process.env['DEEPGRAM_API_KEY'] = 'test-key'
      const adapter = new DeepgramAdapter()
      const promise = adapter.connect({ language: 'en-US' })
      await Promise.resolve()
      mockConn.emit('open')
      await promise

      mockConn.keepAlive.mockImplementation(() => { throw new Error('socket gone') })
      expect(() => jest.advanceTimersByTime(8_000)).not.toThrow()
    } finally {
      jest.useRealTimers()
    }
  })

  test('keepAlive is called on the 8s interval', async () => {
    jest.useFakeTimers()
    try {
      process.env['DEEPGRAM_API_KEY'] = 'test-key'
      const adapter = new DeepgramAdapter()
      const promise = adapter.connect({ language: 'en-US' })
      await Promise.resolve()
      mockConn.emit('open')
      await promise

      jest.advanceTimersByTime(8_000)
      expect(mockConn.keepAlive).toHaveBeenCalledTimes(1)
      jest.advanceTimersByTime(8_000)
      expect(mockConn.keepAlive).toHaveBeenCalledTimes(2)
    } finally {
      jest.useRealTimers()
    }
  })

  test('keepAlive stops after close()', async () => {
    jest.useFakeTimers()
    try {
      process.env['DEEPGRAM_API_KEY'] = 'test-key'
      const adapter = new DeepgramAdapter()
      const promise = adapter.connect({ language: 'en-US' })
      await Promise.resolve()
      mockConn.emit('open')
      const session = await promise

      session.close()
      jest.advanceTimersByTime(16_000)
      expect(mockConn.keepAlive).not.toHaveBeenCalled()
    } finally {
      jest.useRealTimers()
    }
  })

  test('close() calls requestClose and is idempotent', async () => {
    const session = await openSession()
    session.close()
    expect(mockConn.requestClose).toHaveBeenCalledTimes(1)
    session.close()
    expect(mockConn.requestClose).toHaveBeenCalledTimes(1)
  })

  // ── Transcript events ────────────────────────────────────────────────────────
  test('Results(is_final=true) emits transcript.final', async () => {
    const session = await openSession()
    const handler = jest.fn()
    session.on('transcript', handler)

    mockConn.emit('Results', {
      is_final: true,
      channel:  { alternatives: [{ transcript: 'hello world', confidence: 0.98 }] },
    })

    expect(handler).toHaveBeenCalledWith(
      expect.objectContaining({ type: 'final', text: 'hello world', confidence: 0.98 }),
    )
  })

  test('Results(is_final=false) emits transcript.interim', async () => {
    const session = await openSession()
    const handler = jest.fn()
    session.on('transcript', handler)

    mockConn.emit('Results', {
      is_final: false,
      channel:  { alternatives: [{ transcript: 'hel', confidence: 0.7 }] },
    })

    expect(handler).toHaveBeenCalledWith(
      expect.objectContaining({ type: 'interim', text: 'hel' }),
    )
  })

  test('empty transcript text is ignored', async () => {
    const session = await openSession()
    const handler = jest.fn()
    session.on('transcript', handler)

    mockConn.emit('Results', { is_final: true, channel: { alternatives: [{ transcript: '' }] } })
    expect(handler).not.toHaveBeenCalled()
  })

  // ── Fix #4 ──────────────────────────────────────────────────────────────────
  test('UtteranceEnd does NOT emit a transcript event (suppressed to avoid blank injection)', async () => {
    const session = await openSession()
    const handler = jest.fn()
    session.on('transcript', handler)

    mockConn.emit('UtteranceEnd')
    expect(handler).not.toHaveBeenCalled()
  })

  test('Deepgram close event emits close on session', async () => {
    const session = await openSession()
    const handler = jest.fn()
    session.on('close', handler)
    mockConn.emit('close')
    expect(handler).toHaveBeenCalledTimes(1)
  })

  // ── Fix #8 ──────────────────────────────────────────────────────────────────
  test('rejects with SpeechError after connection timeout', async () => {
    jest.useFakeTimers()
    try {
      process.env['DEEPGRAM_API_KEY'] = 'test-key'
      const adapter = new DeepgramAdapter()
      const promise = adapter.connect({ language: 'en-US' })
      await Promise.resolve()
      // Do NOT emit open or error — simulate a hanging connection
      jest.advanceTimersByTime(10_000)
      // Timeout triggers retry; exhaust all retries by advancing further
      for (let i = 0; i < 8; i++) {
        await Promise.resolve()
        jest.advanceTimersByTime(30_000)
      }
      const err = await promise.catch(e => e)
      expect(err).toBeInstanceOf(SpeechError)
      expect(err.code).toBe('DEEPGRAM_UNAVAILABLE')
    } finally {
      jest.useRealTimers()
    }
  })

  // ── Fix #2 ──────────────────────────────────────────────────────────────────
  test('unexpected close after open emits close (adapter does not silently reconnect)', async () => {
    const session = await openSession()
    const closeHandler = jest.fn()
    session.on('close', closeHandler)

    mockConn.emit('close')
    expect(closeHandler).toHaveBeenCalledTimes(1)
    // No new createClient calls should have happened — adapter does not self-reconnect
    const { createClient } = jest.requireMock('@deepgram/sdk') as { createClient: jest.Mock }
    expect(createClient).toHaveBeenCalledTimes(1)  // only the initial connect
  })

  // ── Fix #3 ──────────────────────────────────────────────────────────────────
  test('error before open cleans up listeners before retrying', async () => {
    jest.useFakeTimers()
    try {
      process.env['DEEPGRAM_API_KEY'] = 'test-key'
      const adapter = new DeepgramAdapter()
      const promise = adapter.connect({ language: 'en-US' })
      await Promise.resolve()

      const firstConn = mockConn
      firstConn.emit('error', new Error('refused'))
      // First conn should have no more listeners
      await Promise.resolve()
      expect(Object.values(firstConn.listeners).flat()).toHaveLength(0)

      // Advance timer to trigger retry and resolve it
      jest.advanceTimersByTime(500)
      await Promise.resolve()
      mockConn.emit('open')   // mockConn is now the second conn
      await promise
    } finally {
      jest.useRealTimers()
    }
  })

  const itIntegration = process.env['DEEPGRAM_API_KEY'] ? test : test.skip
  itIntegration('integration: dials real Deepgram API (requires DEEPGRAM_API_KEY env var)', async () => {
    delete (jest.requireMock('@deepgram/sdk') as { createClient?: unknown }).createClient
    jest.resetModules()
    const { DeepgramAdapter: RealAdapter } = await import('../infra/DeepgramAdapter')
    const adapter = new RealAdapter()
    const session = await adapter.connect({ language: 'en-US' })
    expect(session).toBeDefined()
    session.close()
  })
})
