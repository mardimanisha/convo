import { renderHook, act } from '@testing-library/react'
import { EventEmitter } from 'events'
import { useRecorder } from '../logic/useRecorder'
import type { ITranscriptClient } from '../data/types'

// ── Mock MediaRecorder ────────────────────────────────────────────────────────

class MockMediaRecorder {
  static instances: MockMediaRecorder[] = []
  ondataavailable: ((e: { data: Blob }) => void) | null = null
  stream: MediaStream

  constructor(stream: MediaStream, _opts?: MediaRecorderOptions) {
    this.stream = stream
    MockMediaRecorder.instances.push(this)
  }

  start = jest.fn()
  stop  = jest.fn()

  emit(blob: Blob) {
    this.ondataavailable?.({ data: blob })
  }
}

// ── Mock ITranscriptClient ────────────────────────────────────────────────────

function makeMockClient(): ITranscriptClient {
  const emitter = new EventEmitter() as unknown as ITranscriptClient
  emitter.connect    = jest.fn()
  emitter.disconnect = jest.fn()
  emitter.sendChunk  = jest.fn()
  return emitter
}

// ── Setup ─────────────────────────────────────────────────────────────────────

beforeEach(() => {
  MockMediaRecorder.instances = []
  ;(global as unknown as Record<string, unknown>)['MediaRecorder'] = MockMediaRecorder

  const mockTrack  = { stop: jest.fn() } as unknown as MediaStreamTrack
  const mockStream = {
    getTracks: () => [mockTrack],
  } as unknown as MediaStream

  Object.defineProperty(global.navigator, 'mediaDevices', {
    value:        { getUserMedia: jest.fn().mockResolvedValue(mockStream) },
    writable:     true,
    configurable: true,
  })
})

afterEach(() => {
  jest.restoreAllMocks()
})

// ── Tests ─────────────────────────────────────────────────────────────────────

describe('useRecorder', () => {
  it('start() creates a MediaRecorder and calls start(100)', async () => {
    const client = makeMockClient()
    const { result } = renderHook(() => useRecorder(client))

    await act(async () => {
      await result.current.start()
    })

    const recorder = MockMediaRecorder.instances[0]!
    expect(recorder).toBeDefined()
    expect(recorder.start).toHaveBeenCalledWith(100)
  })

  it('calls client.sendChunk for non-empty audio blobs', async () => {
    const client = makeMockClient()
    const { result } = renderHook(() => useRecorder(client))

    await act(async () => {
      await result.current.start()
    })

    const recorder = MockMediaRecorder.instances[0]!
    const blob = new Blob(['audio'], { type: 'audio/webm' })
    act(() => { recorder.emit(blob) })

    expect(client.sendChunk).toHaveBeenCalledWith(blob)
  })

  it('does not call client.sendChunk for empty blobs', async () => {
    const client = makeMockClient()
    const { result } = renderHook(() => useRecorder(client))

    await act(async () => {
      await result.current.start()
    })

    const recorder = MockMediaRecorder.instances[0]!
    act(() => { recorder.emit(new Blob([], { type: 'audio/webm' })) })

    expect(client.sendChunk).not.toHaveBeenCalled()
  })

  it('stop() stops the recorder and all tracks', async () => {
    const client = makeMockClient()
    const { result } = renderHook(() => useRecorder(client))

    await act(async () => {
      await result.current.start()
    })

    const recorder = MockMediaRecorder.instances[0]!
    const tracks   = recorder.stream.getTracks()

    act(() => { result.current.stop() })

    expect(recorder.stop).toHaveBeenCalledTimes(1)
    tracks.forEach(t => expect(t.stop).toHaveBeenCalledTimes(1))
  })
})
