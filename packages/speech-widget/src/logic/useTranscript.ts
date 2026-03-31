import { useState, useEffect } from 'react'
import type { ITranscriptClient, TranscriptEvent } from '../data/types'
import { injectTranscript } from './injectTranscript'

/**
 * Subscribes to transcript events from ITranscriptClient.
 * - interim events: update interimText preview only
 * - final events: inject into target field, clear interim preview
 *
 * TODO: OQ-02 — interim transcripts currently only update the preview bubble.
 * Decision pending: should interim text also update the input field directly?
 */
export function useTranscript(client: ITranscriptClient, targetSelector: string) {
  const [interimText, setInterimText] = useState('')
  const [finalText,   setFinalText]   = useState('')

  useEffect(() => {
    const handler = (event: TranscriptEvent) => {
      if (event.type === 'interim') {
        setInterimText(event.text)  // TODO: OQ-02
      } else if (event.type === 'final') {
        setFinalText(event.text)
        injectTranscript(targetSelector, event.text)
        setInterimText('')
      }
    }

    client.on('transcript', handler)
    return () => {
      client.removeAllListeners('transcript')
    }
  }, [client, targetSelector])

  return { interimText, finalText }
}
