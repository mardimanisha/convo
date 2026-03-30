# Speech-to-Text Widget — Project Plan

**Phases:** 6 | **Tasks:** 28 | **Estimated sprints:** 8–10 | **Status:** Ready to start

---

## Open Questions to Resolve Before Coding

| ID | Question |
|----|----------|
| OQ-01 | What auth token mechanism does the host agent use? Widget must forward it in WS upgrade headers. |
| OQ-02 | Should interim transcripts update the input field directly, or only the preview bubble? |
| OQ-03 | What is the Deepgram plan's concurrent stream limit? Determines first instance-upgrade threshold. |
| OQ-04 | Push-to-talk in v1 or defer to v1.1? |

---

## Phase 0 — Repo & Monorepo Setup
**Duration:** ~0.5 sprint | **Tasks:** 3

### P0-1: Initialise monorepo
**Layers:** Infra, Architecture

Scaffold the monorepo with `apps/api`, `packages/speech-widget` using npm workspaces (no Turborepo, no `turbo.json`). Wire build/test/lint/dev scripts directly in each `package.json`. Replace all `@acme` placeholders with the real org scope across `package.json` files, import paths, and Docker image tags (per spec naming convention).

**Testing:** TypeScript compilation is the test — no runtime errors, all imports resolve.

---

### P0-2: Toolchain & CI skeleton
**Layers:** Infra, Testing

Configure TypeScript 5.4, ESLint (with `no-restricted-imports` rules enforcing the UI→Logic→Data layer dependency rule from ADR-04), Prettier, and Jest. Set up a GitHub Actions pipeline that runs lint, build, and test via npm workspace scripts (`npm run lint -w`, `npm run build -w`, `npm test -w`) — no Turbo cache layer. Add `.env.example` and `docker-compose.yml` for Redis.

**Testing:** CI pipeline runs lint, build, and test successfully on a clean branch. Redis container starts via docker-compose.

---

### P0-3: Shared types package
**Layers:** Frontend, Backend, Architecture

Create `packages/types` (or `packages/speech-widget/src/data/types.ts` at minimum). Define `SpeechConfig`, `RecordingState`, `TranscriptEvent`, `SpeechError`, `SpeechErrorCode`, `ITranscriptClient`. These types are consumed by both frontend and backend — lock them first.

**Testing:** TypeScript compilation is the test — no runtime errors, all imports resolve.

---

## Phase 1 — Backend: Infra & Session Management
**Duration:** ~1.5 sprints | **Tasks:** 4

### P1-1: Express app + Pino logger + prom-client metrics
**Layers:** Backend, Infra

Bootstrap the Express app. Wire `pino-http` middleware for structured JSON request logging with a correlation ID on every request. Initialise prom-client default metrics. Expose `GET /health` and `GET /metrics` routes. Set `INSTANCE_ID` from env for horizontal tracing.

**Testing:** Supertest: `GET /health` returns 200 with `{status:"ok", uptime, version}`. `GET /metrics` returns Prometheus text format. Verify pino output is valid JSON with correlation ID field.

---

### P1-2: Redis connection & SessionService
**Layers:** Backend

Wire ioredis. Implement `SessionService`: create (generate UUID, store in Redis with 30-min sliding TTL), get, delete. Validate session IDs in all downstream calls. Use `ioredis-mock` in tests so no real Redis is needed.

**Testing:** Unit tests with `ioredis-mock`: create returns a UUID, get returns it, delete removes it, expired sessions return null.

---

### P1-3: RateLimitService (token bucket)
**Layers:** Backend

Implement token-bucket rate limiting backed by Redis atomic increment. Limits: 10 concurrent sessions per `clientId`, 50 `session.open` per minute. Throw a typed `RateLimitError` on violation. `SessionController` maps this to HTTP 429.

**Testing:** Unit tests: 10 concurrent sessions succeed, 11th throws. 50 opens per minute succeed, 51st throws. Use `ioredis-mock` for atomic ops.

---

### P1-4: REST session routes & SessionController
**Layers:** Backend

Implement `POST /api/session` (create session, return `{sessionId, wsUrl}`) and `DELETE /api/session/:id`. `SessionController` calls `SessionService` and `RateLimitService`. Parse and validate request body with Zod. Wire auth middleware stub (real auth pending OQ-01).

**Testing:** Supertest: POST creates and returns `sessionId`. DELETE removes it. POST with invalid body returns 422. 11th concurrent session returns 429.

---

## Phase 2 — Backend: Relay Service & WebSocket Gateway
**Duration:** ~2 sprints | **Tasks:** 5

### P2-1: DeepgramAdapter
**Layers:** Backend, Architecture

Implement `DeepgramAdapter` wrapping the `@deepgram/sdk` live streaming client. Expose `connect({language})`, `send(chunk)`, `close()`, and emit transcript events. Config reads `DEEPGRAM_API_KEY` from env — it never leaves the server. Implement `IDeepgramAdapter` interface so `RelayService` can be tested with a mock.

**Testing:** Unit tests with a mock adapter: verify `connect` is called with correct language, `send` forwards binary chunks, `close` tears down the connection. Integration test (skipped in CI unless `DEEPGRAM_API_KEY` present) dials the real API.

---

### P2-2: RelayService with Redis Pub/Sub bridge
**Layers:** Backend, Architecture

Implement `RelayService` (extends `EventEmitter`, implements `IRelayService`). `openSession`: dial Deepgram, store in sessions Map, publish transcript events to Redis channel `transcript:{sessionId}`, subscribe to the same channel for the reconnect scenario. `pipeChunk`: forward buffer to Deepgram, increment `audioBytesRelayed` metric. `closeSession`: close Deepgram, unsubscribe, decrement `wsConnectionsActive` metric.

**Testing:** Unit tests with mock `DeepgramAdapter` and `ioredis-mock`: `openSession` emits transcript events, `pipeChunk` forwards chunks, `closeSession` cleans up. Test the Redis Pub/Sub bridge: simulate a transcript arriving on the Redis channel and verify it is re-emitted.

---

### P2-3: SpeechController
**Layers:** Backend

Implement `SpeechController`. `onControlMessage`: dispatch `session.open` (call `relay.openSession`, wire transcript→`sendToClient`) and `session.close`. `onAudioChunk`: call `relay.pipeChunk`. `onClose`: close relay session, delete from `SessionService`. Wire child Pino logger with `sessionId`.

**Testing:** Unit tests with mock `RelayService` and `SessionService`: verify each method delegates correctly. Verify error paths (relay throws) are caught and logged.

---

### P2-4: WebSocket gateway (`wsGateway.ts`)
**Layers:** Backend

Upgrade HTTP to WebSocket on `/ws`. Validate `Authorization` header (stub until OQ-01 resolved). Attach `sessionId` from `SessionController`. Route binary frames to `onAudioChunk`, JSON frames to `onControlMessage`. Fire `onClose` on disconnect. Validate all JSON control messages with Zod — reject malformed messages with an error frame.

**Testing:** Integration test with `ws` client: open a WebSocket, send `session.open` JSON, send binary chunks, send `session.close` — verify `transcript.final` frames are received back. Test malformed JSON returns an error frame.

---

### P2-5: Prometheus metrics wiring
**Layers:** Backend, Infra

Register `ws_connections_active` (gauge), `audio_bytes_relayed_total` (counter), `transcript_latency_seconds` (histogram, p95 target < 800ms). Verify `GET /metrics` exposes all three in Prometheus text format.

**Testing:** Supertest: after a fake session open and close, `GET /metrics` contains the expected metric names and a sample value.

---

## Phase 3 — Frontend: Data & Logic Layers
**Duration:** ~1.5 sprints | **Tasks:** 5

### P3-1: AudioCapture (data layer)
**Layers:** Frontend, Architecture

Implement `AudioCapture.ts` wrapping `getUserMedia` and `MediaRecorder` (`audio/webm;codecs=opus`, 100ms timeslice). Emit `chunk` events. Expose `start()` / `stop()`. This class is the only thing that touches browser audio APIs — Logic layer never calls `getUserMedia` directly, enabling unit tests to mock `AudioCapture`.

**Testing:** Unit test with mocked `navigator.mediaDevices`: `start` emits chunk events, `stop` closes tracks. Test that empty chunks (size 0) are not emitted.

---

### P3-2: WsTransport (data layer)
**Layers:** Frontend

Implement `WsTransport.ts`. Handle WebSocket connection lifecycle, binary frame sending, JSON control message sending, and reconnect with exponential backoff (500ms base, 2× per attempt, 30s cap, ±20% jitter). Emit `message` and `error` events.

**Testing:** Unit tests with a mock WebSocket: `connect` sends `session.open`, `sendChunk` sends binary, `scheduleReconnect` applies backoff formula. Test that jitter stays within ±20% of the computed delay.

---

### P3-3: TranscriptClient (data layer)
**Layers:** Frontend

Compose `WsTransport` and `AudioCapture`. Manage the `sessionId` (UUID generated client-side). Parse incoming JSON server frames and emit typed `TranscriptEvent` or `SpeechError`. Implement `ITranscriptClient` interface so Logic layer depends on the interface, not the concrete class.

**Testing:** Unit tests with mocked `WsTransport` and `AudioCapture`: `connect` calls transport with `session.open`, `sendChunk` calls transport binary send, incoming `transcript.interim` emits interim event, `transcript.final` emits final event, error frame emits `SpeechError`.

---

### P3-4: XState recordingMachine (logic layer)
**Layers:** Frontend, Architecture

Implement `recordingMachine.ts` per the spec state diagram: `idle → requesting → recording → processing → error → idle`. Assign `sessionId` on `GRANTED`, error message on `ERROR`. Wire `requestPermission` and `finalizeTranscript` services.

**State transitions:**
```
idle          → CLICK              → requesting
requesting    → GRANTED            → recording
requesting    → DENIED             → error
recording     → CLICK              → processing
recording     → SILENCE            → processing
recording     → ERROR              → error
processing    → DONE               → idle
processing    → ERROR              → error
error         → RESET              → idle
```

**Testing:** XState unit tests (no DOM required): verify every valid transition, verify all impossible transitions are rejected, verify error messages are assigned correctly, verify RESET clears error context.

---

### P3-5: useRecorder, useTranscript, injectTranscript (logic layer)
**Layers:** Frontend

Implement `useRecorder` (owns `MediaRecorder` lifecycle via `AudioCapture`), `useTranscript` (subscribes to `TranscriptClient` events, updates `interimText`/`finalText` state, calls `injectTranscript` on final), and `injectTranscript` (pure DOM function: uses native prototype setter to bypass React controlled input, dispatches `input` / `change` / `speech:done` events).

> **Note:** The native prototype setter trick is necessary because React controlled inputs override the `.value` property on the element instance. Setting `.value` directly does not trigger React's reconciler. The native prototype setter bypasses the instance override and triggers React's synthetic event system correctly.

**Testing:** `useRecorder`: mock `AudioCapture`, verify `start`/`stop` delegate correctly. `useTranscript`: mock `TranscriptClient` emitter, verify interim/final state updates. `injectTranscript`: jsdom test — verify value is set and all three events fire on a mock input; test that React controlled input simulation is handled.

---

## Phase 4 — Frontend: UI Layer & Widget Integration
**Duration:** ~1.5 sprints | **Tasks:** 5

### P4-1: SpeechProvider & useWidgetConfig
**Layers:** Frontend

Implement `SpeechProvider.tsx`: instantiate `TranscriptClient` once on mount, wire `useRecorder`, `useTranscript`, and the XState actor into a single React context value. Implement `useWidgetConfig`: merge user `SpeechConfig` with defaults, validate required fields (`apiUrl`, `targetSelector`), return a frozen config object.

**Testing:** `@testing-library/react`: render `SpeechProvider` with a mock client, verify context value is populated. `useWidgetConfig`: test missing `apiUrl` throws, missing `targetSelector` throws, defaults are applied.

---

### P4-2: UI components
**Layers:** Frontend

Implement all presentational components:

| Component | Behaviour |
|-----------|-----------|
| `SpeechButton` | Maps `RecordingState` to `stateConfig` (icon, variant, title); calls `onToggle` on click |
| `WaveAnimation` | 5 CSS-animated bars, respects `prefers-reduced-motion` |
| `TranscriptPreview` | Fades in/out on `interimText`/`finalText`; fades out 600ms after injection |
| `StatusBadge` | Renders errors via shadcn `Badge` (destructive); auto-dismisses after 4s |

All components must expose `data-testid` attributes per spec §12.5:

| Element | `data-testid` |
|---------|---------------|
| Mic button | `speech-button` |
| Wave animation | `wave-animation` |
| Transcript preview | `transcript-preview` |
| Error toast | `error-toast` |

**Testing:** `@testing-library/react`: render each component in each relevant state. Verify correct icon/variant rendered. Verify `data-testid` attributes present. Verify `StatusBadge` disappears after 4s (jest fake timers). Verify `WaveAnimation` is absent when `prefers-reduced-motion` is set.

---

### P4-3: SpeechWidget root component
**Layers:** Frontend

Implement `SpeechWidget.tsx`: `position:fixed` container (bottom-right), wraps `SpeechProvider`, renders `TranscriptPreview` and `SpeechButton`. Implement light/dark/auto theme support (reads `prefers-color-scheme` for auto). Wire `onTranscript` and `onError` callbacks through context.

**Testing:** `@testing-library/react`: render widget with all config options, verify floating container renders, verify theme class applied correctly in each mode, verify `onTranscript` fires when final transcript arrives, verify `onError` fires on `SpeechError`.

---

### P4-4: ESLint layer dependency enforcement
**Layers:** Frontend, Infra, Architecture

Configure `no-restricted-imports` in `eslint.config.ts` to enforce ADR-04: files in `ui/` cannot import from `data/`, files in `logic/` cannot import from `ui/`. Add a CI step that fails the build on any violation. Document the rule for future contributors.

> ⚠️ Set this up before any UI code is written — violations accumulate silently if added retrospectively.

**Testing:** Write a deliberate violating import in a test file and verify ESLint reports it. Remove the violation and verify ESLint passes.

---

### P4-5: Vite build & bundle size gate
**Layers:** Frontend, Infra

Configure Vite to build the widget as a library (ES + CJS output). Set up `rollup-plugin-visualizer` or a custom CI step to assert bundle size < 50KB gzipped (NF-02). Fail CI if the gate is exceeded.

> ⚠️ XState v5 alone is ~30KB. Set up the gate from day one and watch it on every PR.

**Testing:** CI step: build widget, gzip the output, assert file size < 51,200 bytes. Run the check on every PR.

---

## Phase 5 — Integration, Load Test & Observability
**Duration:** ~1.5 sprints | **Tasks:** 6

### P5-1: End-to-end integration test (real WebSocket)
**Layers:** Testing

Write an E2E test that spins up the Express/WS server (with a mock `DeepgramAdapter`), opens a WebSocket from the test process, sends `session.open` + binary chunks + `session.close`, and asserts `transcript.final` is received. Run this in CI with a real Redis via docker-compose.

**Testing:** This task is the test. Assert the full message sequence completes without errors and `transcript.final` arrives within 800ms.

---

### P5-2: Browser E2E (Playwright)
**Layers:** Testing

Write Playwright tests against a local demo page embedding the `SpeechWidget`. Mock the microphone with a prerecorded audio file (Playwright `context.grantPermissions` + fake media device). Assert: mic button appears, waveform animates, preview bubble shows interim text, final text is injected into the target input. Verify `data-testid` hooks are present.

**Testing:** This task is the test. All assertions must pass in Chromium. Verify `data-testid` attributes per spec §12.5 are reachable by Playwright selectors.

---

### P5-3: Load test (p95 latency & 5,000 concurrent sessions)
**Layers:** Infra, Testing

Use k6 or Artillery to simulate 5,000 concurrent WebSocket sessions (NF-04). Each session sends 5 seconds of audio chunks. Assert: p95 transcript latency < 800ms (NF-01), server memory per session < 100KB (NF-03), no connection drops under sustained load. Run against a staging environment with two Node.js instances and one Redis to validate horizontal scaling (ADR-06).

> ⚠️ Must test with two backend instances to exercise the Redis Pub/Sub reconnect scenario. A single-instance load test does not validate ADR-06.

**Testing:** k6/Artillery output must show p95 < 800ms, zero connection errors, and memory headroom per session < 100KB.

---

### P5-4: Grafana dashboard & alerting
**Layers:** Infra

Set up a Prometheus scrape config targeting `GET /metrics`. Build a Grafana dashboard with panels for `ws_connections_active`, `audio_bytes_relayed_total`, and `transcript_latency_seconds` p95. Configure an alert for p95 > 800ms and active connections > 4,500. Document the runbook.

**Testing:** Manual smoke test: confirm all panels populate after a test recording session. Trigger the alert by driving p95 > 800ms in staging.

---

### P5-5: Auth integration (unblocks OQ-01)
**Layers:** Backend, Frontend

Once the host agent team confirms the auth mechanism (OQ-01), implement the WS upgrade header validation in `wsGateway` and the token forwarding in `WsTransport`. Update the integration tests. If JWT: add `@types/jsonwebtoken` and verify signature. If API key: validate against a Redis allowlist.

**Testing:** Integration test: valid token → WebSocket upgrade succeeds. Invalid/missing token → server closes with code 4401. Widget forwards token in Upgrade headers.

---

### P5-6: npm publish & integration guide smoke test
**Layers:** Infra, Frontend

Publish the widget package to the npm org. Create a minimal React host app (as per spec §12.2 integration guide) that installs the published package, sets `apiUrl`, `targetSelector`, and confirms the full user flow works end-to-end with the deployed backend.

**Testing:** Manual smoke test: install published package in a clean project, confirm widget renders, confirm transcription completes, confirm text is injected into the target field.

---

## Non-Functional Requirements Checklist

| ID | Requirement | Target | Verified in |
|----|-------------|--------|-------------|
| NF-01 | Transcript latency (speech end → text in input) | p95 < 800ms | P5-3 load test |
| NF-02 | Widget bundle size | < 50KB gzipped | P4-5 bundle gate |
| NF-03 | WebSocket RAM overhead per session | < 100KB | P5-3 load test |
| NF-04 | Concurrent WebSocket sessions per instance | 5,000+ | P5-3 load test |
| NF-05 | All logs structured JSON with correlation IDs | Required | P1-1 |
| NF-06 | Prometheus-compatible metrics endpoint | Required | P2-5, P5-4 |
| NF-07 | Deepgram API key never exposed client-side | Required | P2-1 (server-only env) |
| NF-08 | Horizontally scalable without widget changes | Required | P5-3 (2-instance test) |

---

## Risk Register

| Risk | Severity | Mitigation |
|------|----------|------------|
| `injectTranscript` native setter fails on a React version | High | Test against the real host agent's input component early in P3-5 |
| Bundle size exceeds 50KB after XState v5 (~30KB) | Medium | Set up the CI gate in P4-5 from day one; evaluate tree-shaking options |
| p95 latency > 800ms due to relay hop | High | Load test in P5-3 validates this; run against staging before launch |
| OQ-01 (auth) unresolved at widget launch | High | Stub auth in P1-4 / P2-4; P5-5 is a dependency — schedule early |
| Redis Pub/Sub reconnect scenario untested | Medium | P5-3 must run with 2 instances; single-instance load test is insufficient |

---

*Generated from Speech-to-Text Widget System Design Specification v1.0.0*
