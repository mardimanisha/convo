import type { EventEmitter } from 'events'

// ── Widget configuration ──────────────────────────────────────────────────────

export interface SpeechConfig {
  apiUrl:         string
  targetSelector: string
  lang?:          string                      // BCP-47, default 'en-US'
  theme?:         'light' | 'dark' | 'auto'  // default 'auto'
  onTranscript?:  (text: string) => void
  onError?:       (error: SpeechError) => void
}

// ── Recording state machine ───────────────────────────────────────────────────

/** Five valid states of the recording lifecycle (ADR-03 — no boolean flags). */
export type RecordingState = 'idle' | 'requesting' | 'recording' | 'processing' | 'error'

// ── Transcript ────────────────────────────────────────────────────────────────

export interface TranscriptEvent {
  type:        'interim' | 'final'
  text:        string
  confidence?: number
  sessionId:   string
}

// ── Wire protocol ─────────────────────────────────────────────────────────────

export type ClientControlMessage =
  | { type: 'session.open';  sessionId: string; lang: string }
  | { type: 'session.close'; sessionId: string }

export type ServerMessage =
  | { type: 'transcript.interim'; text: string; confidence: number }
  | { type: 'transcript.final';   text: string; confidence: number }
  | { type: 'error'; code: SpeechErrorCode; message: string }

// ── Errors ────────────────────────────────────────────────────────────────────

export type SpeechErrorCode =
  | 'PERMISSION_DENIED'
  | 'NO_SPEECH'
  | 'NETWORK_ERROR'
  | 'TARGET_NOT_FOUND'
  | 'DEEPGRAM_UNAVAILABLE'
  | 'RATE_LIMIT_EXCEEDED'
  | 'INVALID_MESSAGE'

export class SpeechError extends Error {
  constructor(public readonly code: SpeechErrorCode, message: string) {
    super(message)
    this.name = 'SpeechError'
  }
}

// ── TranscriptClient interface ────────────────────────────────────────────────

export interface ITranscriptClient extends EventEmitter {
  connect(sessionId: string, lang: string): Promise<void>
  disconnect(): void
  sendChunk(data: Blob | ArrayBuffer): void
  on(event: 'transcript', fn: (e: TranscriptEvent) => void): this
  on(event: 'error',      fn: (e: SpeechError) => void): this
}
