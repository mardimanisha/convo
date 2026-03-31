import { EventEmitter } from 'events'

/**
 * Wraps getUserMedia + MediaRecorder.
 * This is the ONLY class that calls getUserMedia directly.
 * Emits 'chunk' (Blob) for non-empty data events only.
 */
export class AudioCapture extends EventEmitter {
  private recorder: MediaRecorder | null = null
  private stream:   MediaStream  | null = null

  async start(): Promise<void> {
    this.stream   = await navigator.mediaDevices.getUserMedia({ audio: true })
    this.recorder = new MediaRecorder(this.stream, { mimeType: 'audio/webm;codecs=opus' })

    this.recorder.ondataavailable = (e: BlobEvent) => {
      if (e.data.size > 0) {
        this.emit('chunk', e.data)
      }
    }

    this.recorder.start(100)
  }

  stop(): void {
    if (this.recorder) {
      this.recorder.ondataavailable = null
      this.recorder.stop()
    }
    this.stream?.getTracks().forEach(t => t.stop())
    this.recorder = null
    this.stream   = null
  }
}
