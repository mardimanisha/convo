import { AudioCapture } from '../data/AudioCapture'

// ── Mock MediaRecorder ────────────────────────────────────────────────────────

type DataAvailableHandler = (e: { data: Blob }) => void

class MockMediaRecorder {
  static instances: MockMediaRecorder[] = []

  ondataavailable: DataAvailableHandler | null = null
  private _stream: MediaStream

  constructor(stream: MediaStream, _options?: MediaRecorderOptions) {
    this._stream = stream
    MockMediaRecorder.instances.push(this)
  }

  start(_timeslice?: number) {}

  stop() {}

  /** Test helper: fire a simulated dataavailable event */
  simulateData(blob: Blob) {
    this.ondataavailable?.({ data: blob })
  }
}

// ── Mock getUserMedia ─────────────────────────────────────────────────────────

function makeMockTrack(): MediaStreamTrack {
  return { stop: jest.fn() } as unknown as MediaStreamTrack
}

function makeMockStream(tracks: MediaStreamTrack[] = []): MediaStream {
  return {
    getTracks: () => tracks,
  } as unknown as MediaStream
}

beforeEach(() => {
  MockMediaRecorder.instances = []
  ;(global as unknown as { MediaRecorder: unknown }).MediaRecorder = MockMediaRecorder
})

afterEach(() => {
  jest.restoreAllMocks()
})

// ── Tests ─────────────────────────────────────────────────────────────────────

describe('AudioCapture', () => {
  it('calls getUserMedia with audio:true and emits chunk events for non-empty blobs', async () => {
    const track  = makeMockTrack()
    const stream = makeMockStream([track])

    Object.defineProperty(global.navigator, 'mediaDevices', {
      value:       { getUserMedia: jest.fn().mockResolvedValue(stream) },
      writable:    true,
      configurable: true,
    })

    const capture = new AudioCapture()
    const chunks: Blob[] = []
    capture.on('chunk', (b: Blob) => chunks.push(b))

    await capture.start()

    const recorder = MockMediaRecorder.instances[0]!
    expect(recorder).toBeDefined()

    // Non-empty blob → emitted
    const nonEmpty = new Blob(['audio'], { type: 'audio/webm' })
    recorder.simulateData(nonEmpty)
    expect(chunks).toHaveLength(1)
    expect(chunks[0]).toBe(nonEmpty)

    // Empty blob → NOT emitted
    const empty = new Blob([], { type: 'audio/webm' })
    recorder.simulateData(empty)
    expect(chunks).toHaveLength(1)
  })

  it('stop() calls stop on recorder and all tracks', async () => {
    const track  = makeMockTrack()
    const stream = makeMockStream([track])

    Object.defineProperty(global.navigator, 'mediaDevices', {
      value:       { getUserMedia: jest.fn().mockResolvedValue(stream) },
      writable:    true,
      configurable: true,
    })

    const capture = new AudioCapture()
    await capture.start()

    const recorder = MockMediaRecorder.instances[0]!
    const stopSpy  = jest.spyOn(recorder, 'stop')

    capture.stop()

    expect(stopSpy).toHaveBeenCalledTimes(1)
    expect(track.stop).toHaveBeenCalledTimes(1)
  })

  it('does not emit chunks after stop()', async () => {
    const stream = makeMockStream([makeMockTrack()])

    Object.defineProperty(global.navigator, 'mediaDevices', {
      value:       { getUserMedia: jest.fn().mockResolvedValue(stream) },
      writable:    true,
      configurable: true,
    })

    const capture = new AudioCapture()
    const chunks: Blob[] = []
    capture.on('chunk', (b: Blob) => chunks.push(b))

    await capture.start()
    const recorder = MockMediaRecorder.instances[0]!

    capture.stop()

    // Simulate late data after stop
    recorder.simulateData(new Blob(['data'], { type: 'audio/webm' }))
    expect(chunks).toHaveLength(0)
  })
})
