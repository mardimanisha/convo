import type { EventEmitter } from 'events'

// ── Shared wire-protocol types (kept in sync with packages/speech-widget/src/data/types.ts) ──

export interface TranscriptEvent {
  type:        'interim' | 'final'
  text:        string
  confidence?: number
  sessionId:   string
}

export type SpeechErrorCode =
  | 'PERMISSION_DENIED'
  | 'NO_SPEECH'
  | 'NETWORK_ERROR'
  | 'TARGET_NOT_FOUND'
  | 'DEEPGRAM_UNAVAILABLE'
  | 'RATE_LIMIT_EXCEEDED'
  | 'INVALID_MESSAGE'

// ── Session ───────────────────────────────────────────────────────────────────

export interface SessionRecord {
  sessionId:    string
  clientId:     string
  lang:         string
  createdAt:    string   // ISO 8601
  lastActiveAt: string   // ISO 8601
  instanceId:   string
}

// ── Deepgram ──────────────────────────────────────────────────────────────────

export interface DeepgramOptions { language: string }

export interface IDeepgramSession {
  send(chunk: Buffer): void
  close(): void
  on(event: 'transcript', fn: (e: TranscriptEvent) => void): this
  on(event: 'close',      fn: () => void): this
}

export interface IDeepgramAdapter {
  connect(opts: DeepgramOptions): Promise<IDeepgramSession>
}

// ── Redis ─────────────────────────────────────────────────────────────────────
// Note: IRedisAdapter does NOT expose incr/decr — use publish/subscribe/get/set/del/expire only.

export interface IRedisAdapter {
  get(key: string): Promise<string | null>
  set(key: string, value: string, ttlSeconds?: number): Promise<void>
  del(key: string): Promise<void>
  expire(key: string, seconds: number): Promise<void>
  publish(channel: string, message: string): Promise<void>
  subscribe(channel: string, fn: (msg: string) => void): Promise<void>
  unsubscribe(channel: string): Promise<void>
}

// ── Services ──────────────────────────────────────────────────────────────────

export interface ISessionService {
  create(clientId: string, lang: string): Promise<string>
  get(sessionId: string): Promise<SessionRecord | null>
  touch(sessionId: string): Promise<void>
  delete(sessionId: string): Promise<void>
}

export interface IRateLimitService {
  checkAndIncrement(clientId: string): Promise<void>
  decrement(clientId: string): Promise<void>
}

export interface IRelayService extends EventEmitter {
  openSession(sessionId: string, lang: string): Promise<void>
  pipeChunk(sessionId: string, chunk: Buffer): void
  closeSession(sessionId: string): Promise<void>
}
