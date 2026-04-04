import { createContext, useContext, useEffect, useRef, useState, type ReactNode } from 'react'
import { createActor, fromPromise } from 'xstate'
import { recordingMachine } from './recordingMachine'
import { useWidgetConfig } from './useWidgetConfig'
import { useRecorder } from './useRecorder'
import { WsTransport } from '../data/WsTransport'
import { TranscriptClient } from '../data/TranscriptClient'
import type { ITranscriptClient, SpeechConfig, TranscriptEvent } from '../data/types'

// ── Context shape ─────────────────────────────────────────────────────────────

interface SpeechContextValue {
  client:         ITranscriptClient
  interimText:    string
  finalText:      string
  machineState:   string
  machineError:   string | null
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

  // When no client is injected (real usage), construct one from config.apiUrl.
  // useRef initializer runs once on mount; short-circuit evaluation ensures
  // TranscriptClient is never constructed when a test client is injected.
  const clientRef = useRef<ITranscriptClient>(
    injectedClient ?? (new TranscriptClient(new WsTransport(resolvedConfig.apiUrl)) as unknown as ITranscriptClient),
  )

  // Recorder: getUserMedia + MediaRecorder lifecycle, chunks forwarded to client
  const { start: startRecording, stop: stopRecording } = useRecorder(clientRef.current)

  // Keep config and recorder actions in refs so the XState actor (created once)
  // always calls the latest versions without stale closure captures.
  const configRef  = useRef(resolvedConfig)
  const actionsRef = useRef({ start: startRecording, stop: stopRecording })
  configRef.current  = resolvedConfig
  actionsRef.current = { start: startRecording, stop: stopRecording }

  const [interimText,  setInterimText]  = useState('')
  const [finalText,    setFinalText]    = useState('')
  const [machineState, setMachineState] = useState('idle')
  const [machineError, setMachineError] = useState<string | null>(null)

  // XState actor wired to real services.
  // Created once; refs above keep closures fresh without recreating the actor.
  const actorRef = useRef(
    createActor(
      recordingMachine.provide({
        actors: {
          // requestPermission: opens WebSocket session then starts MediaRecorder.
          // Resolves with sessionId → machine assigns it to context.
          requestPermission: fromPromise(async () => {
            const sessionId = crypto.randomUUID()
            await clientRef.current.connect(sessionId, configRef.current.lang ?? 'en-US')
            await actionsRef.current.start()
            return sessionId
          }),

          // finalizeTranscript: stops MediaRecorder and closes WebSocket session.
          // Resolves → machine transitions to idle.
          finalizeTranscript: fromPromise(async () => {
            actionsRef.current.stop()
            clientRef.current.disconnect()
          }),
        },
      }),
    ),
  )

  useEffect(() => {
    const actor = actorRef.current
    actor.start()

    const sub = actor.subscribe(snap => {
      setMachineState(snap.value as string)
      setMachineError((snap.context as { error: string | null }).error ?? null)
    })

    return () => {
      sub.unsubscribe()
      actor.stop()
    }
  }, [])

  // Wire transcript events from client to component state
  useEffect(() => {
    const client = clientRef.current
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

  return (
    <SpeechContext.Provider value={{
      client:       clientRef.current,
      interimText,
      finalText,
      machineState,
      machineError,
      send: (event) => actorRef.current.send(event as Parameters<typeof actorRef.current.send>[0]),
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
