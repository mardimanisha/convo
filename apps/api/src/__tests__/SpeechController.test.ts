import { EventEmitter } from 'events'
import { readFileSync } from 'fs'
import { resolve } from 'path'
import { SpeechController } from '../controllers/SpeechController'
import type { IRelayService, ISessionService, TranscriptEvent } from '../infra/types'
import type { Logger } from 'pino'

jest.mock('../infra/metrics', () => ({
  wsConnectionsActive:  { inc: jest.fn(), dec: jest.fn() },
  transcriptLatencyMs:  { observe: jest.fn() },
  audioBytesRelayed:    { inc: jest.fn() },
  sessionOpenErrors:    { inc: jest.fn() },
}))

import * as metrics from '../infra/metrics'

// ── Mocks ─────────────────────────────────────────────────────────────────────

class MockRelayService extends EventEmitter implements IRelayService {
  openSession  = jest.fn().mockResolvedValue(undefined)
  pipeChunk    = jest.fn()
  closeSession = jest.fn().mockResolvedValue(undefined)
}

const mockSession: jest.Mocked<ISessionService> = {
  create: jest.fn(),
  get:    jest.fn(),
  touch:  jest.fn(),
  delete: jest.fn().mockResolvedValue(undefined),
}

const silentLogger = {
  child: (): Logger => silentLogger as unknown as Logger,
  info:  jest.fn(),
  error: jest.fn(),
  warn:  jest.fn(),
  debug: jest.fn(),
} as unknown as Logger

function makeController(relay: MockRelayService, sendToClient = jest.fn()) {
  return {
    ctrl: new SpeechController(relay, mockSession, sendToClient, silentLogger, 'test-session'),
    sendToClient,
  }
}

// ── Tests ─────────────────────────────────────────────────────────────────────

beforeEach(() => jest.clearAllMocks())

describe('SpeechController', () => {
  describe('onControlMessage — session.open', () => {
    test('calls relay.openSession with correct sessionId and lang', async () => {
      const relay = new MockRelayService()
      const { ctrl } = makeController(relay)

      await ctrl.onControlMessage('s1', { type: 'session.open', sessionId: 's1', lang: 'en-US' })
      expect(relay.openSession).toHaveBeenCalledWith('s1', 'en-US')
    })

    test('wires relay transcript events → sendToClient for matching sessionId', async () => {
      const relay = new MockRelayService()
      const { ctrl, sendToClient } = makeController(relay)

      await ctrl.onControlMessage('s1', { type: 'session.open', sessionId: 's1', lang: 'en-US' })

      const event: TranscriptEvent = { type: 'final', text: 'hello', confidence: 0.99, sessionId: 's1' }
      relay.emit('transcript', event)

      expect(sendToClient).toHaveBeenCalledWith({
        type: 'transcript.final',
        text: 'hello',
        confidence: 0.99,
      })
    })

    test('ignores transcript events for other sessionIds', async () => {
      const relay = new MockRelayService()
      const { ctrl, sendToClient } = makeController(relay)

      await ctrl.onControlMessage('s1', { type: 'session.open', sessionId: 's1', lang: 'en-US' })

      relay.emit('transcript', { type: 'final', text: 'other', sessionId: 'other-session' })
      expect(sendToClient).not.toHaveBeenCalled()
    })

    test('sends error frame and increments metric when relay.openSession throws', async () => {
      const relay = new MockRelayService()
      relay.openSession.mockRejectedValue({ code: 'DEEPGRAM_UNAVAILABLE', message: 'no key' })
      const { ctrl, sendToClient } = makeController(relay)

      await ctrl.onControlMessage('s1', { type: 'session.open', sessionId: 's1', lang: 'en-US' })

      expect(sendToClient).toHaveBeenCalledWith(
        expect.objectContaining({ type: 'error', code: 'DEEPGRAM_UNAVAILABLE' }),
      )
      expect(metrics.sessionOpenErrors.inc).toHaveBeenCalledWith({ reason: 'DEEPGRAM_UNAVAILABLE' })
    })
  })

  describe('onControlMessage — session.close', () => {
    test('calls relay.closeSession', async () => {
      const relay = new MockRelayService()
      const { ctrl } = makeController(relay)

      await ctrl.onControlMessage('s1', { type: 'session.close', sessionId: 's1' })
      expect(relay.closeSession).toHaveBeenCalledWith('s1')
    })

    test('does not throw if relay.closeSession rejects', async () => {
      const relay = new MockRelayService()
      relay.closeSession.mockRejectedValue(new Error('already gone'))
      const { ctrl } = makeController(relay)

      await expect(
        ctrl.onControlMessage('s1', { type: 'session.close', sessionId: 's1' }),
      ).resolves.not.toThrow()
    })
  })

  describe('onAudioChunk', () => {
    test('delegates to relay.pipeChunk', () => {
      const relay = new MockRelayService()
      const { ctrl } = makeController(relay)
      const chunk = Buffer.from('audio')

      ctrl.onAudioChunk('s1', chunk)
      expect(relay.pipeChunk).toHaveBeenCalledWith('s1', chunk)
    })
  })

  describe('onClose', () => {
    test('closes relay session and deletes from SessionService', async () => {
      const relay = new MockRelayService()
      const { ctrl } = makeController(relay)

      await ctrl.onClose('s1')
      expect(relay.closeSession).toHaveBeenCalledWith('s1')
      expect(mockSession.delete).toHaveBeenCalledWith('s1')
    })

    test('still calls session.delete even if relay.closeSession throws', async () => {
      const relay = new MockRelayService()
      relay.closeSession.mockRejectedValue(new Error('gone'))
      const { ctrl } = makeController(relay)

      await ctrl.onClose('s1')
      expect(mockSession.delete).toHaveBeenCalledWith('s1')
    })

    test('does not throw if both relay and session fail', async () => {
      const relay = new MockRelayService()
      relay.closeSession.mockRejectedValue(new Error('relay gone'))
      mockSession.delete.mockRejectedValue(new Error('session gone'))
      const { ctrl } = makeController(relay)

      await expect(ctrl.onClose('s1')).resolves.not.toThrow()
    })
  })

  describe('no ws/Express imports', () => {
    test('SpeechController module does not import ws or express', () => {
      // Verify the architectural constraint: no ws or express in the controller
      const src = readFileSync(
        resolve(__dirname, '../controllers/SpeechController.ts'),
        'utf8',
      )
      expect(src).not.toMatch(/from ['"]ws['"]/)
      expect(src).not.toMatch(/from ['"]express['"]/)
    })
  })
})
