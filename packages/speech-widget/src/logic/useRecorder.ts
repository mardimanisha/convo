import { useRef, useCallback } from 'react'
import type { ITranscriptClient } from '../data/types'

/**
 * Manages MediaRecorder lifecycle and streams audio chunks to the client.
 * Does not call getUserMedia directly — that responsibility belongs to AudioCapture (data layer).
 * Here we use the browser's MediaRecorder API directly inside the hook.
 */
export function useRecorder(client: ITranscriptClient) {
  const recorderRef = useRef<MediaRecorder | null>(null)

  const start = useCallback(async () => {
    const stream   = await navigator.mediaDevices.getUserMedia({ audio: true })
    const recorder = new MediaRecorder(stream, { mimeType: 'audio/webm;codecs=opus' })

    recorder.ondataavailable = (e: BlobEvent) => {
      if (e.data.size > 0) {
        client.sendChunk(e.data)
      }
    }

    recorder.start(100)
    recorderRef.current = recorder
  }, [client])

  const stop = useCallback(() => {
    recorderRef.current?.stop()
    recorderRef.current?.stream.getTracks().forEach(t => t.stop())
    recorderRef.current = null
  }, [])

  return { start, stop }
}
