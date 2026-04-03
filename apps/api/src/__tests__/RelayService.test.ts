import { EventEmitter } from 'events'
import { RelayService } from '../services/RelayService'
import type { IDeepgramAdapter, IDeepgramSession, IRedisAdapter, TranscriptEvent } from '../infra/types'

// ── Mock metrics so tests don't share Prometheus state ───────────────────────
jest.mock('../infra/metrics', () => ({
  wsConnectionsActive:  { inc: jest.fn(), dec: jest.fn() },
  transcriptLatencyMs:  { observe: jest.fn() },
  audioBytesRelayed:    { inc: jest.fn() },
  sessionOpenErrors:    { inc: jest.fn() },
}))

import * as metrics from '../infra/metrics'

// ── Mock IDeepgramSession ─────────────────────────────────────────────────────

class MockDeepgramSession extends EventEmitter implements IDeepgramSession {
  send  = jest.fn()
  close = jest.fn()
}

// ── Mock IDeepgramAdapter ─────────────────────────────────────────────────────

function makeMockAdapter(session: MockDeepgramSession): IDeepgramAdapter {
  return { connect: jest.fn().mockResolvedValue(session) }
}

// ── Mock IRedisAdapter ────────────────────────────────────────────────────────

interface MockRedis extends jest.Mocked<IRedisAdapter> {
  _trigger(channel: string, msg: string): void
}

function makeMockRedis(): MockRedis {
  const subscribers = new Map<string, (msg: string) => void>()
  return {
    get:         jest.fn(),
    set:         jest.fn(),
    del:         jest.fn(),
    expire:      jest.fn(),
    publish:     jest.fn().mockResolvedValue(undefined),
    subscribe:   jest.fn().mockImplementation(async (channel: string, fn: (msg: string) => void) => {
      subscribers.set(channel, fn)
    }),
    unsubscribe: jest.fn().mockResolvedValue(undefined),
    _trigger:    (channel: string, msg: string) => subscribers.get(channel)?.(msg),
  } as MockRedis
}

// ── Tests ─────────────────────────────────────────────────────────────────────

beforeEach(() => jest.clearAllMocks())

describe('RelayService', () => {
  describe('openSession', () => {
    test('calls deepgram.connect with correct language', async () => {
      const session = new MockDeepgramSession()
      const adapter = makeMockAdapter(session)
      const redis   = makeMockRedis()
      const relay   = new RelayService(adapter, redis)

      await relay.openSession('s1', 'en-US')
      expect(adapter.connect).toHaveBeenCalledWith({ language: 'en-US' })
    })

    test('subscribes to Redis channel for the session', async () => {
      const session = new MockDeepgramSession()
      const redis   = makeMockRedis()
      const relay   = new RelayService(makeMockAdapter(session), redis)

      await relay.openSession('s1', 'en-US')
      expect(redis.subscribe).toHaveBeenCalledWith('transcript:s1', expect.any(Function))
    })

    test('increments wsConnectionsActive on open', async () => {
      const session = new MockDeepgramSession()
      const relay   = new RelayService(makeMockAdapter(session), makeMockRedis())

      await relay.openSession('s1', 'en-US')
      expect(metrics.wsConnectionsActive.inc).toHaveBeenCalledTimes(1)
    })

    test('stamps sessionId on emitted transcript events', async () => {
      const session = new MockDeepgramSession()
      const relay   = new RelayService(makeMockAdapter(session), makeMockRedis())
      await relay.openSession('s1', 'en-US')

      const handler = jest.fn()
      relay.on('transcript', handler)

      const raw: TranscriptEvent = { type: 'interim', text: 'hello', sessionId: '' }
      session.emit('transcript', raw)

      expect(handler).toHaveBeenCalledWith(expect.objectContaining({ sessionId: 's1' }))
    })

    test('emits transcript events received from Deepgram', async () => {
      const session = new MockDeepgramSession()
      const relay   = new RelayService(makeMockAdapter(session), makeMockRedis())
      await relay.openSession('s1', 'en-US')

      const handler = jest.fn()
      relay.on('transcript', handler)

      session.emit('transcript', { type: 'final', text: 'done', sessionId: '' })
      expect(handler).toHaveBeenCalledTimes(1)
    })

    test('publishes transcript to Redis', async () => {
      const session = new MockDeepgramSession()
      const redis   = makeMockRedis()
      const relay   = new RelayService(makeMockAdapter(session), redis)
      await relay.openSession('s1', 'en-US')

      session.emit('transcript', { type: 'final', text: 'done', sessionId: '' })
      expect(redis.publish).toHaveBeenCalledWith(
        'transcript:s1',
        expect.stringContaining('"text":"done"'),
      )
    })

    test('observes transcriptLatencyMs histogram on final transcript with text', async () => {
      const session = new MockDeepgramSession()
      const relay   = new RelayService(makeMockAdapter(session), makeMockRedis())
      await relay.openSession('s1', 'en-US')

      session.emit('transcript', { type: 'final', text: 'done', sessionId: '' })
      expect(metrics.transcriptLatencyMs.observe).toHaveBeenCalledTimes(1)
    })

    test('does NOT observe latency for empty final transcript (UtteranceEnd synthetic)', async () => {
      const session = new MockDeepgramSession()
      const relay   = new RelayService(makeMockAdapter(session), makeMockRedis())
      await relay.openSession('s1', 'en-US')

      session.emit('transcript', { type: 'final', text: '', sessionId: '' })
      expect(metrics.transcriptLatencyMs.observe).not.toHaveBeenCalled()
    })
  })

  describe('Redis Pub/Sub bridge (ADR-06 reconnect scenario)', () => {
    test('re-emits transcripts arriving via Redis channel', async () => {
      const session = new MockDeepgramSession()
      const redis   = makeMockRedis()
      const relay   = new RelayService(makeMockAdapter(session), redis)
      await relay.openSession('s1', 'en-US')

      const handler = jest.fn()
      relay.on('transcript', handler)

      const event: TranscriptEvent = { type: 'final', text: 'from other node', sessionId: 's1' }
      redis._trigger('transcript:s1', JSON.stringify(event))

      expect(handler).toHaveBeenCalledWith(expect.objectContaining({ text: 'from other node' }))
    })

    test('ignores malformed Redis messages', async () => {
      const session = new MockDeepgramSession()
      const redis   = makeMockRedis()
      const relay   = new RelayService(makeMockAdapter(session), redis)
      await relay.openSession('s1', 'en-US')

      const handler = jest.fn()
      relay.on('transcript', handler)

      expect(() => redis._trigger('transcript:s1', 'not-json')).not.toThrow()
      expect(handler).not.toHaveBeenCalled()
    })
  })

  describe('pipeChunk', () => {
    test('forwards chunk to Deepgram session', async () => {
      const session = new MockDeepgramSession()
      const relay   = new RelayService(makeMockAdapter(session), makeMockRedis())
      await relay.openSession('s1', 'en-US')

      const chunk = Buffer.from('audio')
      relay.pipeChunk('s1', chunk)
      expect(session.send).toHaveBeenCalledWith(chunk)
    })

    test('increments audioBytesRelayed', async () => {
      const session = new MockDeepgramSession()
      const relay   = new RelayService(makeMockAdapter(session), makeMockRedis())
      await relay.openSession('s1', 'en-US')

      relay.pipeChunk('s1', Buffer.alloc(512))
      expect(metrics.audioBytesRelayed.inc).toHaveBeenCalledWith(512)
    })

    test('is a no-op for unknown sessionId', () => {
      const relay = new RelayService(makeMockAdapter(new MockDeepgramSession()), makeMockRedis())
      expect(() => relay.pipeChunk('unknown', Buffer.from('x'))).not.toThrow()
    })
  })

  describe('closeSession', () => {
    test('closes the Deepgram session', async () => {
      const session = new MockDeepgramSession()
      const relay   = new RelayService(makeMockAdapter(session), makeMockRedis())
      await relay.openSession('s1', 'en-US')

      await relay.closeSession('s1')
      expect(session.close).toHaveBeenCalledTimes(1)
    })

    test('unsubscribes from Redis channel', async () => {
      const session = new MockDeepgramSession()
      const redis   = makeMockRedis()
      const relay   = new RelayService(makeMockAdapter(session), redis)
      await relay.openSession('s1', 'en-US')

      await relay.closeSession('s1')
      expect(redis.unsubscribe).toHaveBeenCalledWith('transcript:s1')
    })

    test('decrements wsConnectionsActive', async () => {
      const session = new MockDeepgramSession()
      const relay   = new RelayService(makeMockAdapter(session), makeMockRedis())
      await relay.openSession('s1', 'en-US')
      jest.clearAllMocks()

      await relay.closeSession('s1')
      expect(metrics.wsConnectionsActive.dec).toHaveBeenCalledTimes(1)
    })

    test('is a no-op for unknown sessionId', async () => {
      const relay = new RelayService(makeMockAdapter(new MockDeepgramSession()), makeMockRedis())
      await expect(relay.closeSession('ghost')).resolves.not.toThrow()
    })

    test('unexpected Deepgram close decrements metric only once', async () => {
      const session = new MockDeepgramSession()
      const relay   = new RelayService(makeMockAdapter(session), makeMockRedis())
      await relay.openSession('s1', 'en-US')
      jest.clearAllMocks()

      // Simulate unexpected server-side close
      session.emit('close')
      // Then our code also tries to close — should not double-decrement
      await relay.closeSession('s1')

      expect(metrics.wsConnectionsActive.dec).toHaveBeenCalledTimes(1)
    })
  })
})
