import { EventEmitter } from 'events'
import { TranscriptClient } from '../data/TranscriptClient'
import { SpeechError, TranscriptEvent } from '../data/types'
import { WsTransport } from '../data/WsTransport'

// ── Mock WsTransport ──────────────────────────────────────────────────────────

function makeMockTransport(): jest.Mocked<WsTransport> {
  const mock = new EventEmitter() as unknown as jest.Mocked<WsTransport>
  mock.connect     = jest.fn().mockResolvedValue(undefined)
  mock.sendJSON    = jest.fn()
  mock.sendBinary  = jest.fn()
  mock.disconnect  = jest.fn()
  return mock
}

// ── Tests ─────────────────────────────────────────────────────────────────────

describe('TranscriptClient', () => {
  it('sends session.open after transport connects', async () => {
    const transport = makeMockTransport()
    const client    = new TranscriptClient(transport)

    await client.connect('sess-1', 'en-US')

    expect(transport.connect).toHaveBeenCalledWith('sess-1')
    expect(transport.sendJSON).toHaveBeenCalledWith({
      type: 'session.open', sessionId: 'sess-1', lang: 'en-US',
    })
  })

  it('emits TranscriptEvent for transcript.interim messages', async () => {
    const transport = makeMockTransport()
    const client    = new TranscriptClient(transport)
    await client.connect('sess-2', 'en-US')

    const events: TranscriptEvent[] = []
    client.on('transcript', e => events.push(e))

    transport.emit('message', { type: 'transcript.interim', text: 'hell', confidence: 0.7 })

    expect(events).toHaveLength(1)
    expect(events[0]).toMatchObject({ type: 'interim', text: 'hell', confidence: 0.7, sessionId: 'sess-2' })
  })

  it('emits TranscriptEvent for transcript.final messages', async () => {
    const transport = makeMockTransport()
    const client    = new TranscriptClient(transport)
    await client.connect('sess-3', 'en-US')

    const events: TranscriptEvent[] = []
    client.on('transcript', e => events.push(e))

    transport.emit('message', { type: 'transcript.final', text: 'hello world', confidence: 0.98 })

    expect(events).toHaveLength(1)
    expect(events[0]).toMatchObject({ type: 'final', text: 'hello world', confidence: 0.98 })
  })

  it('emits SpeechError for error message frames', async () => {
    const transport = makeMockTransport()
    const client    = new TranscriptClient(transport)
    await client.connect('sess-4', 'en-US')

    const errors: SpeechError[] = []
    client.on('error', e => errors.push(e))

    transport.emit('message', {
      type: 'error', code: 'DEEPGRAM_UNAVAILABLE', message: 'service down',
    })

    expect(errors).toHaveLength(1)
    expect(errors[0]).toBeInstanceOf(SpeechError)
    expect(errors[0]!.code).toBe('DEEPGRAM_UNAVAILABLE')
  })

  it('forwards SpeechError from transport error event', async () => {
    const transport = makeMockTransport()
    const client    = new TranscriptClient(transport)
    await client.connect('sess-5', 'en-US')

    const errors: SpeechError[] = []
    client.on('error', e => errors.push(e))

    const err = new SpeechError('NETWORK_ERROR', 'connection lost')
    transport.emit('error', err)

    expect(errors).toHaveLength(1)
    expect(errors[0]).toBe(err)
  })

  it('sendChunk forwards an ArrayBuffer via sendBinary', async () => {
    const transport = makeMockTransport()
    const client    = new TranscriptClient(transport)
    await client.connect('sess-6', 'en-US')

    const buf = new ArrayBuffer(16)
    client.sendChunk(buf)

    expect(transport.sendBinary).toHaveBeenCalledWith(buf)
  })

  it('disconnect sends session.close and disconnects transport', async () => {
    const transport = makeMockTransport()
    const client    = new TranscriptClient(transport)
    await client.connect('sess-7', 'en-US')

    client.disconnect()

    expect(transport.sendJSON).toHaveBeenCalledWith(
      expect.objectContaining({ type: 'session.close' }),
    )
    expect(transport.disconnect).toHaveBeenCalledTimes(1)
  })
})
