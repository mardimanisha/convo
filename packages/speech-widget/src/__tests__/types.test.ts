import { SpeechError } from '../data/types'
import type { RecordingState, TranscriptEvent } from '../data/types'

describe('types smoke test', () => {
  it('SpeechError is constructable and extends Error', () => {
    const err = new SpeechError('PERMISSION_DENIED', 'mic denied')
    expect(err.code).toBe('PERMISSION_DENIED')
    expect(err.name).toBe('SpeechError')
    expect(err).toBeInstanceOf(Error)
  })

  it('RecordingState covers all five states', () => {
    const states: RecordingState[] = ['idle', 'requesting', 'recording', 'processing', 'error']
    expect(states).toHaveLength(5)
  })

  it('TranscriptEvent type is structurally correct', () => {
    const event: TranscriptEvent = { type: 'final', text: 'hello', sessionId: 'abc' }
    expect(event.type).toBe('final')
  })
})
