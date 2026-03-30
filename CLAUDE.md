# CLAUDE.md — Speech-to-Text Widget

> **This file is the authoritative build guide for Claude Code.**
> Read it completely before writing any code. Every section contains decisions
> that affect architecture, testing, and correctness. Do not skip ahead.

---

## 0. Before You Write a Single Line of Code

### 0.1 Replace the `@acme` placeholder

Every occurrence of `@acme` in this codebase is a placeholder. You **must** ask
the user for their npm org scope and replace all occurrences before scaffolding
anything.

| Placeholder | Replace with |
|---|---|
| `@acme/speech-widget` | `@{orgname}/speech-widget` |
| `@acme/api` | `@{orgname}/api` |

This applies to: `package.json` name fields, import statements, Docker image
tags, and all npm publish commands. There is no `@acme` package on npm — leaving
it unchanged will cause publish to fail.

### 0.2 Resolve open questions before Phase 2+

| ID | Question | Blocks |
|----|----------|--------|
| OQ-01 | What auth token mechanism does the host agent use? Widget must forward it in WS upgrade headers. | P1-4, P2-4, P5-5 |
| OQ-02 | Should interim transcripts update the input field directly, or only the preview bubble? | P3-4 |
| OQ-03 | What is the Deepgram plan's concurrent stream limit? | P5-3 |
| OQ-04 | Push-to-talk in v1 or defer to v1.1? | P4 UI |

Stub auth (OQ-01) with a middleware that always passes in development. Mark the stub with `// TODO: OQ-01` so it is findable. Do not block Phase 1 waiting for answers.

---

## 1. Project Overview

A drop-in npm package (`SpeechWidget`) that adds voice-to-text to any agent UI.
The widget floats over the host page, records audio, streams it through a
Node.js relay to Deepgram, and injects the final transcript into any CSS-selected
input field.

**Core user flow:**
```
User clicks mic → recording starts, waveform animates
                → interim transcripts appear in preview bubble
User clicks again → stream closes → Deepgram returns final transcript
                  → text injected into agent input field
```

**The widget is agent-agnostic.** It communicates via native DOM `input`/`change`
events — compatible with React, Vue, Angular, and vanilla JS.

---

## 2. Monorepo Structure

```
/
├── apps/
│   └── api/                          # Node.js relay backend
│       ├── src/
│       │   ├── routes/               # wsGateway.ts, speechRoutes.ts, healthRoute.ts, metricsRoute.ts
│       │   ├── controllers/          # SpeechController.ts, SessionController.ts
│       │   ├── services/             # RelayService.ts, SessionService.ts, RateLimitService.ts
│       │   └── infra/                # DeepgramAdapter.ts, RedisAdapter.ts, logger.ts, metrics.ts, container.ts, types.ts
│       ├── package.json
│       ├── tsconfig.json
│       └── Dockerfile
├── packages/
│   └── speech-widget/                # Frontend npm package
│       ├── src/
│       │   ├── ui/                   # React components (presentational only)
│       │   │   ├── SpeechWidget.tsx
│       │   │   ├── SpeechButton.tsx
│       │   │   ├── WaveAnimation.tsx
│       │   │   ├── TranscriptPreview.tsx
│       │   │   └── StatusBadge.tsx
│       │   ├── logic/                # Hooks and XState machine (no DOM/network)
│       │   │   ├── recordingMachine.ts
│       │   │   ├── useRecorder.ts
│       │   │   ├── useTranscript.ts
│       │   │   ├── SpeechProvider.tsx
│       │   │   ├── useWidgetConfig.ts
│       │   │   └── injectTranscript.ts
│       │   └── data/                 # Pure TS, no React, no XState
│       │       ├── types.ts
│       │       ├── WsTransport.ts
│       │       ├── AudioCapture.ts
│       │       └── TranscriptClient.ts
│       ├── package.json
│       ├── tsconfig.json
│       └── vite.config.ts
├── docker-compose.yml
├── .env.example
└── package.json                      # Root workspace
```

---

## 3. Architecture Rules (Enforced — Never Violate)

### 3.1 Frontend layer dependency rule (ADR-04)

```
ui/  →  logic/  →  data/
```

- Files in `ui/` may import from `logic/` only.
- Files in `logic/` may import from `data/` only.
- Files in `data/` import nothing internal.
- `data/` is pure TypeScript with **no** React or DOM dependencies (except browser APIs like `WebSocket` and `MediaRecorder` — those are injected or abstracted, not imported).
- Enforced by ESLint `no-restricted-imports` in `eslint.config.ts`. CI fails on violations.
- **Set up the ESLint rule (P0-2) before writing any `ui/` or `logic/` code.** Violations accumulate silently if added retrospectively.

### 3.2 Backend layer dependency rule

```
routes/  →  controllers/  →  services/  →  infra/
```

- Services depend on **interfaces** (`IRedisAdapter`, `IDeepgramAdapter`), never on concrete classes.
- Controllers have no Express or `ws` imports — those live in routes only.
- `container.ts` is the single place that wires concrete classes to interfaces.

### 3.3 API key rule (ADR-01, NF-07)

The Deepgram API key **must never appear in client-side code or bundle.**
It is read from `process.env.DEEPGRAM_API_KEY` in `DeepgramAdapter.ts` on the server only.
CI should verify the widget bundle does not contain the string `DEEPGRAM_API_KEY`.

### 3.4 XState over boolean flags (ADR-03)

The recording lifecycle is an XState v5 finite state machine. Do not introduce
`isRecording`, `isProcessing`, or similar boolean flags. Every state is one of:
`idle | requesting | recording | processing | error`.

---

## 4. Build Order — Follow This Sequence

Build phases in order. Do not start Phase N+1 until Phase N tests pass.

```
Phase 0 → Repo & Monorepo Setup
Phase 1 → Backend: Infra & Session Management
Phase 2 → Backend: Relay Service & WebSocket Gateway
Phase 3 → Frontend: Data & Logic Layers
Phase 4 → Frontend: UI Layer
Phase 5 → Integration, Load Test & Observability
```

---

## 5. Phase 0 — Repo & Monorepo Setup

### P0-1: Initialise npm workspaces monorepo

**What to build:**
- Scaffold `apps/api` and `packages/speech-widget` directories.
- Create root `package.json` with workspaces and scripts. Do **not** create a `turbo.json` — Turborepo is not used:

```json
{
  "private": true,
  "workspaces": ["apps/*", "packages/*"],
  "scripts": {
    "build":  "npm run build --workspaces --if-present",
    "test":   "npm run test  --workspaces --if-present",
    "lint":   "npm run lint  --workspaces --if-present",
    "dev:api": "npm run dev  --workspace=apps/api"
  }
}
```

- Replace all `@acme` with the real org scope (ask the user first).
- Create `docker-compose.yml` for Redis:

```yaml
version: '3.9'
services:
  redis:
    image: redis:7-alpine
    ports: ["6379:6379"]
    command: redis-server --save "" --appendonly no

  api:
    build: { context: ./apps/api }
    ports: ["3000:3000"]
    environment:
      - DEEPGRAM_API_KEY=${DEEPGRAM_API_KEY}
      - REDIS_URL=redis://redis:6379
      - LOG_LEVEL=debug
      - PORT=3000
      - INSTANCE_ID=dev-1
    depends_on: [redis]
    volumes: ["./apps/api/src:/app/src"]
```

- Create `.env.example`:

```bash
DEEPGRAM_API_KEY=your_deepgram_key
REDIS_URL=redis://localhost:6379
PORT=3000
LOG_LEVEL=info
INSTANCE_ID=node-1
MAX_CONCURRENT_SESSIONS_PER_CLIENT=10
MAX_SESSION_OPENS_PER_MINUTE=50
SESSION_TTL_SECONDS=1800
VITE_API_URL=wss://api.yourdomain.com/ws
```

**Done when:** `tsc --noEmit` passes across the workspace with zero errors.

---

### P0-2: Toolchain & CI skeleton

**What to build:**
- TypeScript 5.4 `tsconfig.json` for both `apps/api` and `packages/speech-widget`.
- ESLint config with `no-restricted-imports` enforcing the layer rule:

```typescript
// eslint.config.ts (in packages/speech-widget)
// Files matching src/ui/** cannot import from src/data/**
// Files matching src/logic/** cannot import from src/ui/**
```

- Prettier config at root.
- Jest config for each package (jsdom for widget, node for api).
- GitHub Actions workflow: lint → build → test on every PR.

**Done when:** CI pipeline runs lint, build, and test successfully on a clean branch. Redis starts via `docker-compose up redis`.

---

### P0-3: Shared types (lock before any implementation)

**What to build — `packages/speech-widget/src/data/types.ts`:**

```typescript
export interface SpeechConfig {
  apiUrl:         string
  targetSelector: string
  lang?:          string          // BCP-47, default 'en-US'
  theme?:         'light' | 'dark' | 'auto'
  onTranscript?:  (text: string) => void
  onError?:       (error: SpeechError) => void
}

export type RecordingState = 'idle' | 'requesting' | 'recording' | 'processing' | 'error'

export interface TranscriptEvent {
  type:        'interim' | 'final'
  text:        string
  confidence?: number
  sessionId:   string
}

export type SpeechErrorCode =
  | 'PERMISSION_DENIED' | 'NO_SPEECH'    | 'NETWORK_ERROR'
  | 'TARGET_NOT_FOUND'  | 'DEEPGRAM_UNAVAILABLE' | 'RATE_LIMIT_EXCEEDED'

export class SpeechError extends Error {
  constructor(public code: SpeechErrorCode, message: string) {
    super(message)
    this.name = 'SpeechError'
  }
}

export interface ITranscriptClient extends EventEmitter {
  connect(sessionId: string, lang: string): Promise<void>
  disconnect(): void
  sendChunk(data: Blob | ArrayBuffer): void
  on(event: 'transcript', fn: (e: TranscriptEvent) => void): this
  on(event: 'error',      fn: (e: SpeechError) => void): this
}
```

**What to build — `apps/api/src/infra/types.ts`:**

```typescript
export interface SessionRecord {
  sessionId:    string
  clientId:     string
  lang:         string
  createdAt:    string
  lastActiveAt: string
  instanceId:   string
}

export interface IRelayService extends EventEmitter {
  openSession(sessionId: string, lang: string): Promise<void>
  pipeChunk(sessionId: string, chunk: Buffer): void
  closeSession(sessionId: string): Promise<void>
}

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

export interface IDeepgramAdapter {
  connect(opts: DeepgramOptions): Promise<IDeepgramSession>
}

export interface IDeepgramSession {
  send(chunk: Buffer): void
  close(): void
  on(event: 'transcript', fn: (e: TranscriptEvent) => void): this
  on(event: 'close',      fn: () => void): this
}

export interface IRedisAdapter {
  get(key: string): Promise<string | null>
  set(key: string, value: string, ttlSeconds?: number): Promise<void>
  del(key: string): Promise<void>
  expire(key: string, seconds: number): Promise<void>
  publish(channel: string, message: string): Promise<void>
  subscribe(channel: string, fn: (msg: string) => void): Promise<void>
  unsubscribe(channel: string): Promise<void>
}
```

**Wire protocol types (shared between frontend and backend):**

```typescript
type ClientControlMessage =
  | { type: 'session.open';  sessionId: string; lang: string }
  | { type: 'session.close'; sessionId: string }

type ServerMessage =
  | { type: 'transcript.interim'; text: string; confidence: number }
  | { type: 'transcript.final';   text: string; confidence: number }
  | { type: 'error'; code: SpeechErrorCode; message: string }
```

**Done when:** TypeScript compilation succeeds; no runtime errors.

---

## 6. Phase 1 — Backend: Infra & Session Management

### P1-1: Express app + Pino + prom-client

**What to build:**

`apps/api/src/infra/logger.ts`:
```typescript
import pino from 'pino'
export const baseLogger = pino({
  level: process.env.LOG_LEVEL ?? 'info',
  formatters: { level: (label) => ({ level: label }) },
  timestamp: pino.stdTimeFunctions.isoTime,
})
// Usage: const log = baseLogger.child({ sessionId, requestId, instanceId: process.env.INSTANCE_ID })
```

Every log line must contain: `level`, `time`, `sessionId`, `requestId`, `instanceId`, `msg`. Add `durationMs` and `err` where applicable.

`apps/api/src/infra/metrics.ts`:
```typescript
import { Registry, Gauge, Histogram, Counter } from 'prom-client'
export const registry              = new Registry()
export const wsConnectionsActive   = new Gauge({ name: 'ws_connections_active', help: '...', registers: [registry] })
export const transcriptLatencyMs   = new Histogram({ name: 'transcript_latency_ms', help: '...', buckets: [50,100,200,500,800,1000,2000], registers: [registry] })
export const audioBytesRelayed     = new Counter({ name: 'audio_bytes_relayed_total', help: '...', registers: [registry] })
export const sessionOpenErrors     = new Counter({ name: 'session_open_errors_total', help: '...', labelNames: ['reason'], registers: [registry] })
```

Routes:
- `GET /health` → `{ status: 'ok', uptime: number, version: string }`
- `GET /metrics` → Prometheus text format via `registry.metrics()`

Wire `pino-http` as middleware with a `requestId` (UUID) on every request.

**Tests:**
- `GET /health` returns 200 with correct shape.
- `GET /metrics` returns content-type `text/plain` with metric names present.
- Pino output is valid JSON; each line has a `requestId` field.

---

### P1-2: RedisAdapter + SessionService

`apps/api/src/infra/RedisAdapter.ts` — typed wrapper over `ioredis` implementing `IRedisAdapter`. Services depend only on the interface.

`apps/api/src/services/SessionService.ts`:
- `create(clientId, lang)`: generate UUID v4, store `SessionRecord` as JSON at key `session:{sessionId}` with 30-min TTL, return `sessionId`.
- `get(sessionId)`: fetch and parse from Redis.
- `touch(sessionId)`: reset TTL to 1800s (called on every `pipeChunk`).
- `delete(sessionId)`: `DEL session:{sessionId}`.

Use `ioredis-mock` in all tests — no real Redis required in unit tests.

**Tests:**
- `create` returns a UUID; `get` returns it; `delete` removes it; `get` on expired key returns `null`.

---

### P1-3: RateLimitService

Token bucket per `clientId`. Two limits enforced atomically via Redis `INCR`:

```
ratelimit:{clientId}:session_count   — no TTL; decremented on session close
ratelimit:{clientId}:opens_per_min  — TTL 60s fixed window
```

- Limit 1: 10 concurrent sessions per client (configurable via `MAX_CONCURRENT_SESSIONS_PER_CLIENT`).
- Limit 2: 50 `session.open` calls per minute per client (configurable via `MAX_SESSION_OPENS_PER_MINUTE`).
- On violation: throw a typed `RateLimitError` (extends `SpeechError` with code `RATE_LIMIT_EXCEEDED`). The controller maps this to HTTP 429.

**Tests (use `ioredis-mock`):**
- 10 concurrent sessions succeed; 11th throws.
- 50 opens per minute succeed; 51st throws.
- After a session is closed and `decrement` called, a new session succeeds.

---

### P1-4: REST session routes + SessionController

Routes:
```
POST   /api/session       Body: { lang?: string }  → { sessionId, wsUrl }
DELETE /api/session/:id                             → 204
```

`SessionController` orchestrates `SessionService` and `RateLimitService`. Validate request body with Zod. Wire an auth middleware stub:

```typescript
// middleware/auth.ts — TODO: OQ-01 — replace with real auth before launch
export const authMiddleware = (req, res, next) => {
  req.clientId = req.headers['x-client-id'] ?? 'anonymous'
  next()
}
```

**Tests (Supertest):**
- `POST /api/session` creates and returns `sessionId`.
- `DELETE /api/session/:id` removes it; double-delete returns 404.
- `POST` with invalid body returns 422.
- 11th concurrent `POST` from same `clientId` returns 429.

---

## 7. Phase 2 — Backend: Relay Service & WebSocket Gateway

### P2-1: DeepgramAdapter

`apps/api/src/infra/DeepgramAdapter.ts` — wraps `@deepgram/sdk` live streaming.

Implements `IDeepgramAdapter`. Reads `DEEPGRAM_API_KEY` from env — **never from a parameter passed by the client.** Handles:
- Keepalive pings (Deepgram drops idle sessions after 10s).
- `UtteranceEnd` events from Deepgram (maps to `transcript.final`).
- Reconnect with exponential backoff on Deepgram-side disconnects.

**Tests:**
- Unit tests with a mock `IDeepgramSession`: verify `connect` is called with correct `language`, `send` forwards binary chunks, `close` tears down.
- Integration test (skip in CI unless `DEEPGRAM_API_KEY` is set): dial the real Deepgram API.

---

### P2-2: RelayService with Redis Pub/Sub

`apps/api/src/services/RelayService.ts`:

```typescript
class RelayService extends EventEmitter implements IRelayService {
  private sessions = new Map<string, { dg: IDeepgramSession; lang: string }>()

  async openSession(sessionId: string, lang: string): Promise<void> {
    const dg = await this.deepgram.connect({ language: lang })
    this.sessions.set(sessionId, { dg, lang })

    dg.on('transcript', (event) => {
      this.redis.publish(`transcript:${sessionId}`, JSON.stringify(event))
      this.emit('transcript', event)
    })

    // Reconnect scenario: receive transcripts published by other instances
    await this.redis.subscribe(`transcript:${sessionId}`, (msg) => {
      this.emit('transcript', JSON.parse(msg))
    })

    metrics.wsConnectionsActive.inc()
  }

  pipeChunk(sessionId: string, chunk: Buffer): void {
    const session = this.sessions.get(sessionId)
    if (!session) return
    session.dg.send(chunk)
    metrics.audioBytesRelayed.inc(chunk.byteLength)
  }

  async closeSession(sessionId: string): Promise<void> {
    const session = this.sessions.get(sessionId)
    if (!session) return
    session.dg.close()
    await this.redis.unsubscribe(`transcript:${sessionId}`)
    this.sessions.delete(sessionId)
    metrics.wsConnectionsActive.dec()
  }
}
```

**Tests (mock `DeepgramAdapter` + `ioredis-mock`):**
- `openSession` emits transcript events.
- `pipeChunk` forwards chunks to Deepgram; increments `audioBytesRelayed`.
- `closeSession` cleans up the Map and unsubscribes.
- **Redis Pub/Sub bridge test:** simulate a `transcript:{sessionId}` message arriving on Redis and verify it is re-emitted by the service (this is the reconnect scenario).

---

### P2-3: SpeechController

`apps/api/src/controllers/SpeechController.ts`:

```typescript
class SpeechController {
  constructor(private relay: IRelayService, private session: ISessionService, private logger: Logger) {}

  async onControlMessage(sessionId: string, msg: ClientControlMessage): Promise<void> {
    if (msg.type === 'session.open') {
      await this.relay.openSession(sessionId, msg.lang)
      this.relay.on('transcript', (event) => this.sendToClient(sessionId, event))
    }
    if (msg.type === 'session.close') {
      await this.relay.closeSession(sessionId)
    }
  }

  onAudioChunk(sessionId: string, chunk: Buffer): void {
    this.relay.pipeChunk(sessionId, chunk)
    // Record timestamp for latency histogram — started at session.open
  }

  async onClose(sessionId: string): Promise<void> {
    await this.relay.closeSession(sessionId)
    await this.session.delete(sessionId)
  }
}
```

Child logger carries `{ sessionId }` on every line.

**Tests:** Mock `IRelayService` and `ISessionService`. Verify each method delegates correctly. Verify error paths are caught, logged, and surfaced to client as `{ type: 'error', code, message }`.

---

### P2-4: WebSocket gateway

`apps/api/src/routes/wsGateway.ts`:

```typescript
wss.on('connection', async (ws, req) => {
  const sessionId = await sessionController.create(req.headers.authorization)
  const log       = baseLogger.child({ sessionId, instanceId: process.env.INSTANCE_ID })

  ws.on('message', (data) => {
    if (Buffer.isBuffer(data)) {
      speechController.onAudioChunk(sessionId, data)
    } else {
      const msg = parseAndValidateControlMessage(data)   // Zod schema
      if (!msg) { ws.send(JSON.stringify({ type: 'error', code: 'INVALID_MESSAGE' })); return }
      speechController.onControlMessage(sessionId, msg)
    }
  })

  ws.on('close', () => {
    speechController.onClose(sessionId)
    log.info('websocket closed')
  })
})
```

- Validate `Authorization` header (stub until OQ-01 — `// TODO: OQ-01`).
- Set `X-Session-Id` response header during WS upgrade (used by the load balancer for sticky sessions).
- Validate all JSON control messages with Zod; reject malformed frames with an error frame (never throw uncaught).

**Tests (integration with `ws` client):**
- Open WS → send `session.open` → send binary chunks → send `session.close` → assert `transcript.final` received.
- Malformed JSON frame → assert error frame with `INVALID_MESSAGE` code returned.

---

### P2-5: Prometheus metrics wiring

Verify `GET /metrics` exposes all four metrics after a fake session lifecycle:
`ws_connections_active`, `audio_bytes_relayed_total`, `transcript_latency_ms`, `session_open_errors_total`.

**Test:** Supertest after a simulated open/close — all metric names appear in `/metrics` output with non-zero values.

---

## 8. Phase 3 — Frontend: Data & Logic Layers

> Data layer has no React. Logic layer has React hooks but no DOM/network calls.
> Both layers must be testable in Node.js without a browser.

### P3-1: AudioCapture (data layer)

`packages/speech-widget/src/data/AudioCapture.ts`:
- Wraps `getUserMedia` + `MediaRecorder` (`audio/webm;codecs=opus`, 100ms timeslice).
- Emits `chunk` events for non-empty blobs only (`e.data.size > 0`).
- Exposes `start()` / `stop()`.
- **This is the only class that calls `getUserMedia` directly.**

**Tests (mocked `navigator.mediaDevices`):**
- `start` emits chunk events; `stop` closes all tracks.
- Empty chunks (size 0) are not emitted.

---

### P3-2: WsTransport (data layer)

`packages/speech-widget/src/data/WsTransport.ts`:
- Raw WebSocket wrapper. Handles connect, binary frame send, reconnect.
- Reconnect: exponential backoff from 500ms, doubling, capped at 30s, ±20% jitter.

```typescript
private scheduleReconnect(): void {
  const delay = Math.min(this.baseDelay * Math.pow(2, this.attempts), this.maxDelay)
               * (0.8 + Math.random() * 0.4)
  setTimeout(() => this.connect(), delay)
}
```

- Sends `X-Session-Id` header during WS upgrade for load balancer sticky routing.
- Forwards `Authorization` token in WS upgrade headers (`// TODO: OQ-01`).

**Tests (mock `WebSocket`):**
- `connect` sends the handshake; `sendBinary` sends an `ArrayBuffer`.
- Disconnect triggers reconnect after backoff.
- Maximum retry cap is respected.

---

### P3-3: TranscriptClient (data layer)

`packages/speech-widget/src/data/TranscriptClient.ts`:
- Composes `WsTransport` and `AudioCapture`.
- Implements `ITranscriptClient`.
- Parses incoming JSON server messages into typed `TranscriptEvent` objects.
- Emits `'transcript'` and `'error'` events to Logic layer listeners.

**Tests (mock `WsTransport`):**
- `session.open` control message is sent on `connect`.
- Binary chunk from `AudioCapture` is forwarded to `WsTransport.sendBinary`.
- Incoming `transcript.interim` → emits `{ type: 'interim', text, confidence }`.
- Incoming `transcript.final` → emits `{ type: 'final', text, confidence }`.
- Incoming `error` frame → emits a `SpeechError` with the correct code.

---

### P3-4: recordingMachine (logic layer)

`packages/speech-widget/src/logic/recordingMachine.ts` — XState v5:

```typescript
import { createMachine, assign } from 'xstate'

export const recordingMachine = createMachine({
  id: 'recording',
  initial: 'idle',
  context: {
    error:     null as string | null,
    sessionId: null as string | null,
  },
  states: {
    idle:       { on: { CLICK: 'requesting' } },
    requesting: {
      invoke: {
        src:     'requestPermission',
        onDone:  { target: 'recording', actions: assign({ sessionId: ({ event }) => event.output }) },
        onError: { target: 'error',     actions: assign({ error: ({ event }) => event.error.message }) }
      }
    },
    recording:  {
      on: {
        CLICK:   'processing',
        SILENCE: 'processing',
        ERROR:   { target: 'error', actions: assign({ error: ({ event }) => event.message }) }
      }
    },
    processing: {
      invoke: {
        src:     'finalizeTranscript',
        onDone:  'idle',
        onError: { target: 'error', actions: assign({ error: ({ event }) => event.error.message }) }
      }
    },
    error: { on: { RESET: { target: 'idle', actions: assign({ error: null }) } } }
  }
})
```

Valid transitions only:
```
idle → requesting (CLICK)
requesting → recording (GRANTED) | error (DENIED)
recording → processing (CLICK | SILENCE) | error (ERROR)
processing → idle (DONE) | error (ERROR)
error → idle (RESET)
```

**Tests (pure XState, no DOM):**
- Starts in `idle`.
- `idle + CLICK → requesting`.
- `requesting + resolved → recording` (with `sessionId` in context).
- `requesting + rejected → error` (with `error` in context).
- `recording + CLICK → processing`.
- `recording + SILENCE → processing`.
- `error + RESET → idle` (error context cleared).
- Unknown events leave state unchanged.

---

### P3-5: injectTranscript (logic layer)

`packages/speech-widget/src/logic/injectTranscript.ts`:

```typescript
export function injectTranscript(selector: string, text: string): void {
  const el = document.querySelector<HTMLTextAreaElement | HTMLInputElement>(selector)
  if (!el) throw new SpeechError('TARGET_NOT_FOUND', `No element matches "${selector}"`)

  // React overrides .value on the instance — use the native prototype setter
  // to bypass React's override and trigger React's synthetic event system correctly.
  const nativeValueSetter = Object.getOwnPropertyDescriptor(
    window.HTMLTextAreaElement.prototype, 'value'
  )?.set
  nativeValueSetter?.call(el, text)

  el.dispatchEvent(new Event('input',  { bubbles: true }))
  el.dispatchEvent(new Event('change', { bubbles: true }))
  el.dispatchEvent(new CustomEvent('speech:done', { detail: { text }, bubbles: true }))
}
```

**Why the native prototype setter:** React controlled inputs override the `.value` property on the element instance. Setting `.value` directly is ignored by React's reconciler. The native prototype setter bypasses the instance override and correctly triggers React's synthetic `onChange`.

**Tests (jsdom):**
- Sets `value` on a `<textarea id="input">`.
- Fires native `input` event.
- Fires native `change` event.
- Fires `speech:done` CustomEvent with `detail: { text }`.
- Throws `SpeechError` with code `TARGET_NOT_FOUND` for missing selector.

---

### P3-6: useRecorder + useTranscript (logic layer)

`useRecorder.ts`:
```typescript
export function useRecorder(client: ITranscriptClient) {
  const recorderRef = useRef<MediaRecorder | null>(null)
  const start = useCallback(async () => {
    const stream   = await navigator.mediaDevices.getUserMedia({ audio: true })
    const recorder = new MediaRecorder(stream, { mimeType: 'audio/webm;codecs=opus' })
    recorder.ondataavailable = (e) => { if (e.data.size > 0) client.sendChunk(e.data) }
    recorder.start(100)
    recorderRef.current = recorder
  }, [client])
  const stop = useCallback(() => {
    recorderRef.current?.stop()
    recorderRef.current?.stream.getTracks().forEach(t => t.stop())
  }, [])
  return { start, stop }
}
```

`useTranscript.ts`:
```typescript
export function useTranscript(client: ITranscriptClient, targetSelector: string) {
  const [interimText, setInterimText] = useState('')
  const [finalText,   setFinalText]   = useState('')
  useEffect(() => {
    client.on('transcript', (event) => {
      if (event.type === 'interim') setInterimText(event.text)
      if (event.type === 'final') {
        setFinalText(event.text)
        injectTranscript(targetSelector, event.text)
        setInterimText('')
      }
    })
    return () => { client.removeAllListeners('transcript') }
  }, [client, targetSelector])
  return { interimText, finalText }
}
```

**Tests (mock `ITranscriptClient`):**
- `useRecorder.start` calls `client.sendChunk` for each non-empty audio chunk.
- `useTranscript` updates `interimText` on interim events; calls `injectTranscript` and clears `interimText` on final events.

---

### P3-7: SpeechProvider + useWidgetConfig (logic layer)

`SpeechProvider.tsx` — React context provider. Instantiates `TranscriptClient` once on mount. Wires `useRecorder`, `useTranscript`, and the XState actor into a single context value.

`useWidgetConfig.ts` — merges user `SpeechConfig` with defaults (`lang: 'en-US'`, `theme: 'auto'`). Validates that `apiUrl` and `targetSelector` are present; throws if missing. Returns a frozen config object.

**Tests:**
- Context value is populated when rendering `SpeechProvider` with a mock client.
- Missing `apiUrl` throws at config validation time.
- Missing `targetSelector` throws at config validation time.
- Defaults are applied for optional fields.

---

## 9. Phase 4 — Frontend: UI Layer

> All UI components are **purely presentational**. They read state from context
> and call callbacks. They contain no business logic and no direct network calls.

### P4-1: SpeechButton

```typescript
const stateConfig: Record<RecordingState, ButtonConfig> = {
  idle:       { icon: <MicIcon />,       variant: 'outline',     title: 'Click to speak' },
  requesting: { icon: <Spinner />,       variant: 'outline',     title: 'Requesting mic...' },
  recording:  { icon: <WaveAnimation />, variant: 'destructive', title: 'Click to stop' },
  processing: { icon: <Spinner />,       variant: 'secondary',   title: 'Processing...' },
  error:      { icon: <MicOffIcon />,    variant: 'destructive', title: 'Error — click to reset' },
}
```

`data-testid="speech-button"` required.

### P4-2: WaveAnimation

Five CSS-animated bars with staggered `animation-delay`. Zero JavaScript logic.
Must respect `prefers-reduced-motion` via CSS `@media (prefers-reduced-motion: reduce)`.
`data-testid="wave-animation"` required.

### P4-3: TranscriptPreview

Displays `interimText` (italic, muted colour) and `finalText` from context.
Fades in when text is non-empty. Fades out 600ms after final text is injected.
`data-testid="transcript-preview"` required.

### P4-4: StatusBadge

Renders error messages using shadcn `Badge` in `destructive` variant.
Auto-dismisses after 4 seconds (call `RESET` on XState machine).
`data-testid="error-toast"` required.

### P4-5: SpeechWidget (root)

```tsx
export function SpeechWidget(props: SpeechConfig) {
  return (
    <SpeechProvider config={props}>
      <div className="fixed bottom-6 right-6 flex flex-col items-end gap-2">
        <TranscriptPreview />
        <SpeechButton />
      </div>
    </SpeechProvider>
  )
}
```

- `position: fixed`, bottom-right.
- Light/dark/auto theme: for `auto`, read `window.matchMedia('(prefers-color-scheme: dark)')`.
- Wire `onTranscript` and `onError` through context to the appropriate callbacks.

**Tests (`@testing-library/react` for all UI components):**
- Render each component in every `RecordingState`.
- Verify correct icon/variant/title rendered per state.
- Verify all `data-testid` attributes are present.
- `StatusBadge` disappears after 4s (use jest fake timers).
- `WaveAnimation` is absent when `prefers-reduced-motion` is active.
- `SpeechWidget` fires `onTranscript` when final transcript arrives.
- `SpeechWidget` fires `onError` when a `SpeechError` is emitted.
- Theme class is applied correctly for `light`, `dark`, and `auto`.

---

### P4-6: ESLint layer rule verification

Deliberately create a violating import (e.g., `ui/` importing from `data/`) and verify ESLint reports it. Remove the violation and verify ESLint passes. This is a required CI gate — not optional.

---

### P4-7: Vite library build + bundle size gate

`vite.config.ts` — build as library (ES + CJS):

```typescript
export default defineConfig({
  build: {
    lib: {
      entry: 'src/index.ts',
      formats: ['es', 'cjs'],
    },
    rollupOptions: {
      external: ['react', 'react-dom', 'xstate'],
    },
  },
})
```

CI step: build widget, gzip output, assert `< 51,200 bytes` (50KB). Fail CI if exceeded.

> ⚠️ XState v5 alone is ~30KB. Set up the gate from day one and watch it on every PR. Evaluate tree-shaking if the gate is tight.

---

## 10. Phase 5 — Integration, Load Test & Observability

### P5-1: End-to-end WebSocket integration test

Spin up Express/WS server with a mock `DeepgramAdapter`. Open a WebSocket from the test process. Send: `session.open` → binary chunks → `session.close`. Assert `transcript.final` received within 800ms. Run in CI with a real Redis via `docker-compose`.

---

### P5-2: Playwright browser E2E

Mock the microphone with a prerecorded audio file (`context.grantPermissions` + fake media device). Test in Chromium:
1. Mic button renders with `data-testid="speech-button"`.
2. Click mic → `wave-animation` appears.
3. Interim text appears in `transcript-preview`.
4. Stop → final text injected into the target `<textarea>`.

All `data-testid` attributes from §12.5 of the spec must be reachable by Playwright selectors.

---

### P5-3: Load test (k6 or Artillery)

Target: 5,000 concurrent WebSocket sessions, each sending 5 seconds of audio chunks.

**Must run with two Node.js instances to validate ADR-06 (Redis Pub/Sub reconnect).** A single-instance test does not validate horizontal scaling.

Pass criteria:
- p95 transcript latency < 800ms (NF-01).
- Memory per session < 100KB (NF-03).
- Zero connection errors under sustained load.

---

### P5-4: Grafana dashboard

Prometheus scrape from `GET /metrics`. Panels:
1. `ws_connections_active` — line chart, all instances overlaid.
2. `transcript_latency_ms` p50/p95/p99 — 5-minute rolling window.
3. `audio_bytes_relayed_total` rate — area chart.
4. `session_open_errors_total` rate by `reason` — bar chart.
5. Instance memory RSS (node_exporter).

Alerts: p95 > 800ms; active connections > 4,500 per instance.

---

### P5-5: Auth integration (unblocks OQ-01)

Replace all `// TODO: OQ-01` stubs once the host agent team confirms the auth mechanism.

- If JWT: add `@types/jsonwebtoken`, verify signature in `wsGateway` middleware.
- If API key: validate against a Redis allowlist.
- Widget: forward token in `Authorization: Bearer <token>` WS upgrade header.

Integration tests:
- Valid token → WS upgrade succeeds.
- Invalid/missing token → server closes with code 4401.

---

### P5-6: npm publish + smoke test

Publish `@{orgname}/speech-widget` to npm. Create a minimal React host app per the integration guide. Verify end-to-end user flow with the deployed backend.

---

## 11. Non-Functional Requirements Checklist

Verify each before marking the project complete:

| ID | Requirement | Target | Verified in |
|----|-------------|--------|-------------|
| NF-01 | Transcript latency | p95 < 800ms | P5-3 |
| NF-02 | Widget bundle size | < 50KB gzipped | P4-7 CI gate |
| NF-03 | WS RAM overhead per session | < 100KB | P5-3 |
| NF-04 | Concurrent WS sessions per instance | 5,000+ | P5-3 |
| NF-05 | All logs structured JSON + correlation IDs | Required | P1-1 |
| NF-06 | Prometheus metrics endpoint | Required | P2-5, P5-4 |
| NF-07 | Deepgram API key never client-side | Required | P2-1 (env only) |
| NF-08 | Horizontally scalable, zero widget changes | Required | P5-3 (2-instance) |

---

## 12. package.json Dependencies Reference

**`packages/speech-widget/package.json`:**
```json
{
  "dependencies": {
    "react": "^18.0.0",
    "react-dom": "^18.0.0",
    "xstate": "^5.0.0"
  },
  "devDependencies": {
    "typescript": "^5.4.0",
    "vite": "^5.0.0",
    "@testing-library/react": "^15.0.0",
    "jest": "^29.0.0",
    "jest-environment-jsdom": "^29.0.0"
  },
  "peerDependencies": {
    "react": ">=18"
  }
}
```

**`apps/api/package.json`:**
```json
{
  "dependencies": {
    "express": "^4.19.0",
    "ws": "^8.17.0",
    "ioredis": "^5.3.0",
    "pino": "^9.0.0",
    "pino-http": "^10.0.0",
    "prom-client": "^15.0.0",
    "@deepgram/sdk": "^3.3.0",
    "uuid": "^10.0.0",
    "zod": "^3.23.0"
  },
  "devDependencies": {
    "typescript": "^5.4.0",
    "jest": "^29.0.0",
    "supertest": "^7.0.0",
    "ioredis-mock": "^8.9.0",
    "@types/express": "^4.17.0",
    "@types/ws": "^8.5.0",
    "@types/supertest": "^6.0.0"
  }
}
```

---

## 13. Redis Key Schema

| Key pattern | Type | TTL | Purpose |
|---|---|---|---|
| `session:{sessionId}` | JSON string | 1800s sliding | Session record |
| `ratelimit:{clientId}:session_count` | integer | none | Concurrent session count |
| `ratelimit:{clientId}:opens_per_min` | integer | 60s fixed | Per-minute open rate |
| `transcript:{sessionId}` | Pub/Sub channel | — | Cross-instance transcript relay |

---

## 14. Wire Protocol Reference

**Client → Server binary:** Raw `ArrayBuffer` audio chunks (16kHz mono PCM from MediaRecorder).

**Client → Server JSON:**
```jsonc
{ "type": "session.open",  "sessionId": "abc123", "lang": "en-US" }
{ "type": "session.close", "sessionId": "abc123" }
```

**Server → Client JSON:**
```jsonc
{ "type": "transcript.interim", "text": "hello wor",   "confidence": 0.91 }
{ "type": "transcript.final",   "text": "hello world", "confidence": 0.98 }
{ "type": "error", "code": "DEEPGRAM_UNAVAILABLE",     "message": "..." }
```

---

## 15. Critical Implementation Notes

1. **React native prototype setter** (`injectTranscript.ts`): Always use `Object.getOwnPropertyDescriptor(HTMLTextAreaElement.prototype, 'value')?.set` to bypass React's instance-level property override. Setting `.value` directly is silently ignored by React's reconciler.

2. **XState v5 API**: Use `createMachine` + `createActor` (not v4's `interpret`). Services are passed as an `actors` option to `createActor`, not as the second argument to `createMachine`.

3. **Deepgram idle timeout**: Deepgram drops idle WebSocket sessions after 10 seconds of silence. `DeepgramAdapter` must send keepalive pings to prevent premature disconnects.

4. **Redis Pub/Sub dual subscribe**: In `RelayService.openSession`, the service both publishes transcripts it receives from Deepgram AND subscribes to the same channel. This is intentional — the subscribe path handles the reconnect case where a different instance now holds the client WebSocket.

5. **Bundle size gate**: XState v5 is ~30KB of the 50KB budget. Enable tree-shaking in Vite. Do not import `xstate` in the `data/` layer — it belongs in `logic/` only.

6. **Sticky session header**: The widget must set `X-Session-Id` in the WS handshake headers. The Nginx load balancer uses `hash $http_x_session_id consistent` for routing.

7. **`data-testid` attributes are non-negotiable**: Playwright E2E and agent-side tests depend on them. Every interactive element must have the correct `data-testid` before P5-2.

8. **Empty audio chunk guard**: In `AudioCapture`, only emit chunks where `e.data.size > 0`. Sending empty buffers to the backend wastes bandwidth and can cause Deepgram parse errors.

---

## 16. Risk Register

| Risk | Severity | Mitigation |
|------|----------|------------|
| `injectTranscript` native setter fails on a React version | High | Test against the real host agent's input component early in P3-5 |
| Bundle > 50KB after XState v5 | Medium | CI gate in P4-7 from day one; evaluate tree-shaking options |
| p95 latency > 800ms due to relay hop | High | P5-3 load test validates; run against staging before launch |
| OQ-01 (auth) unresolved at widget launch | High | Stub in P1-4/P2-4; P5-5 is a dependency — schedule early |
| Redis Pub/Sub reconnect untested | Medium | P5-3 must run with 2 instances; single-instance test is insufficient |

---

## 17. Integration Guide (for Reference)

```tsx
import { SpeechWidget } from '@{orgname}/speech-widget'

function AgentInterface() {
  return (
    <div>
      <textarea id="agent-input" placeholder="Type or speak..." />
      <SpeechWidget
        apiUrl={import.meta.env.VITE_API_URL}
        targetSelector="#agent-input"
        lang="en-US"
        theme="auto"
        onTranscript={(text) => console.log('Transcribed:', text)}
        onError={(err) => console.error(err.code, err.message)}
      />
    </div>
  )
}
```

All agent-specific behaviour belongs in `onTranscript`. The widget is never modified for agent-specific requirements.

---

*CLAUDE.md generated from Speech-to-Text Widget System Design Specification v1.0.0 and Project Plan*
