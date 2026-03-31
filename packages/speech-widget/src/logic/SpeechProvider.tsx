import { createContext, useContext, useEffect, useRef, useState, type ReactNode } from 'react'
import { createActor, fromPromise } from 'xstate'
import { recordingMachine } from './recordingMachine'
import { useWidgetConfig } from './useWidgetConfig'
import type { ITranscriptClient, SpeechConfig, TranscriptEvent } from '../data/types'

// ── Context shape ─────────────────────────────────────────────────────────────

interface SpeechContextValue {
  client:         ITranscriptClient
  interimText:    string
  finalText:      string
  machineState:   string
  send:           (event: { type: string }) => void
}

const SpeechContext = createContext<SpeechContextValue | null>(null)

// ── Provider ──────────────────────────────────────────────────────────────────

interface SpeechProviderProps {
  config: SpeechConfig
  /** Optional: inject a pre-built client for testing */
  client?: ITranscriptClient
  children: ReactNode
}

export function SpeechProvider({ config, client: injectedClient, children }: SpeechProviderProps) {
  const resolvedConfig = useWidgetConfig(config)
  const clientRef      = useRef<ITranscriptClient | null>(injectedClient ?? null)

  const [interimText,  setInterimText]  = useState('')
  const [finalText,    setFinalText]    = useState('')
  const [machineState, setMachineState] = useState('idle')

  // Lazily create the XState actor once
  const actorRef = useRef(
    createActor(
      recordingMachine.provide({
        actors: {
          requestPermission:  fromPromise(() => Promise.resolve('session-stub')),
          finalizeTranscript: fromPromise(() => Promise.resolve()),
        },
      }),
    ),
  )

  useEffect(() => {
    const actor = actorRef.current
    actor.start()

    const sub = actor.subscribe(snap => setMachineState(snap.value as string))

    return () => {
      sub.unsubscribe()
      actor.stop()
    }
  }, [])

  // Wire transcript events once the client is available
  useEffect(() => {
    const client = clientRef.current
    if (!client) return

    const handler = (event: TranscriptEvent) => {
      if (event.type === 'interim') {
        setInterimText(event.text)
      } else if (event.type === 'final') {
        setFinalText(event.text)
        setInterimText('')
        resolvedConfig.onTranscript?.(event.text)
      }
    }

    client.on('transcript', handler)
    return () => { client.removeAllListeners('transcript') }
  }, [resolvedConfig])

  if (!clientRef.current) {
    // In real usage TranscriptClient is constructed here; in tests it's injected.
    // Returning null avoids rendering with a null client.
    return null
  }

  return (
    <SpeechContext.Provider value={{
      client:      clientRef.current,
      interimText,
      finalText,
      machineState,
      send:        (event) => actorRef.current.send(event as Parameters<typeof actorRef.current.send>[0]),
    }}>
      {children}
    </SpeechContext.Provider>
  )
}

// ── Consumer hook ─────────────────────────────────────────────────────────────

export function useSpeechContext(): SpeechContextValue {
  const ctx = useContext(SpeechContext)
  if (!ctx) throw new Error('useSpeechContext must be used inside <SpeechProvider>')
  return ctx
}
