# Phase 3 — Frontend: Data & Logic Layers

> Read this file once at the start of your session in the `voice-adapter-frontend-data` worktree.
> After reading, run `/setup` then `/plan`.

## Prerequisites

Phase 0 types (`packages/speech-widget/src/data/types.ts`) must be in `main`.
This phase runs in **parallel** with Phase 2 — no backend dependency required.

## Context

You are building the pure-TypeScript data layer and the React logic layer of the speech widget.
No UI components yet. No visual rendering. Every class/hook must be independently testable
without a browser, real WebSocket, or real microphone.

**Worktree:** `~/voice-adapter-frontend-data`
**Branch:** `phase/3-frontend-data`
**Package manager:** npm (not pnpm)
**Stack:** TypeScript 5.4, React 18 hooks, XState v5, Vite 5 (library mode)
**Tests:** Jest 29, jest-environment-jsdom, @testing-library/react 15

---

## Scope — What you build in this phase

| Task | Files to create | Done when |
|------|----------------|-----------|
| P3-1 | `packages/speech-widget/src/data/AudioCapture.ts` | Unit: start emits chunks, stop closes tracks, empty chunks not emitted |
| P3-2 | `packages/speech-widget/src/data/WsTransport.ts` | Unit: connects with correct headers, sends binary/text frames, reconnects with capped backoff |
| P3-3 | `packages/speech-widget/src/data/TranscriptClient.ts` | Unit with mock WsTransport: session.open sent, chunks forwarded, transcript/error events emitted |
| P3-4 | `packages/speech-widget/src/logic/recordingMachine.ts` | Pure XState unit tests: all valid transitions, context updates, unknown events ignored |
| P3-5 | `packages/speech-widget/src/logic/injectTranscript.ts` | jsdom tests: sets textarea value, fires input/change/speech:done events, throws TARGET_NOT_FOUND |
| P3-6 | `packages/speech-widget/src/logic/useRecorder.ts`, `useTranscript.ts` | RTL tests with mock ITranscriptClient |
| P3-7 | `packages/speech-widget/src/logic/SpeechProvider.tsx`, `useWidgetConfig.ts` | RTL: context populated; missing apiUrl/targetSelector throws |

---

## CRITICAL — Layer dependency rule (ADR-04)

```
ui/  →  logic/  →  data/
```

- `data/` files: **no** React, **no** XState, **no** internal imports from other layers.
- `logic/` files: may import from `data/` only. Never from `ui/`.
- ESLint `no-restricted-imports` is already configured (from P0-2). Violations fail CI.

```bash
# Verify before every commit:
npm run lint --workspaces --if-present 2>&1 | grep "no-restricted-imports" \
  && echo "❌ LAYER VIOLATION" || echo "✅ OK"
```

---

## AudioCapture requirements (P3-1)

```typescript
// data/AudioCapture.ts
class AudioCapture extends EventEmitter {
  async start(): Promise<void>  // getUserMedia → MediaRecorder(audio/webm;codecs=opus, timeslice=100ms)
  stop(): void                  // stops recorder + all tracks
  // emits: 'chunk' (Blob) — ONLY when e.data.size > 0
}
```

This is the **only** class that calls `getUserMedia` directly. Test with mocked `navigator.mediaDevices`.

## WsTransport requirements (P3-2)

```typescript
// data/WsTransport.ts
class WsTransport extends EventEmitter {
  connect(sessionId: string): Promise<void>
  sendBinary(data: ArrayBuffer): void
  sendJSON(msg: object): void
  disconnect(): void
  // emits: 'message' (parsed JSON), 'error' (SpeechError), 'close'
}
```

**Headers sent on WS upgrade:**
- `X-Session-Id: {sessionId}` — for load balancer sticky routing (ADR-06)
- `Authorization: Bearer {token}` — forwarded from widget config (`// TODO: OQ-01`)

**Reconnect strategy (implement exactly as specified):**
```typescript
private scheduleReconnect(): void {
  const delay = Math.min(this.baseDelay * Math.pow(2, this.attempts), this.maxDelay)
               * (0.8 + Math.random() * 0.4)  // ±20% jitter
  setTimeout(() => this.connect(), delay)
}
// baseDelay = 500ms, maxDelay = 30_000ms
```

Test: disconnect triggers reconnect after backoff; maximum retry cap (30s) is respected.

## TranscriptClient requirements (P3-3)

Implements `ITranscriptClient`. Composes `WsTransport`:
- `connect(sessionId, lang)`: opens WsTransport, sends `session.open` JSON.
- `sendChunk(data)`: forwards binary chunk via `WsTransport.sendBinary`.
- `disconnect()`: sends `session.close` JSON, disconnects WsTransport.
- Maps `transcript.interim` / `transcript.final` WS messages → emits `TranscriptEvent`.
- Maps `error` WS message frames → emits `SpeechError` with correct code.

## recordingMachine requirements (P3-4)

Use XState **v5** API: `createMachine` + `createActor`. Not v4's `interpret`.

**Invoke source name is `requestPermission`** (not `requestMic`):
```typescript
requesting: {
  invoke: {
    src:     'requestPermission',   // ← exact name required
    onDone:  { target: 'recording', actions: assign({ sessionId: ({ event }) => event.output }) },
    onError: { target: 'error',     actions: assign({ error: ({ event }) => event.error.message }) }
  }
}
```

Valid transitions:
```
idle       + CLICK   → requesting
requesting + GRANTED → recording   (context: { sessionId })
requesting + DENIED  → error       (context: { error: message })
recording  + CLICK   → processing
recording  + SILENCE → processing
recording  + ERROR   → error
processing + DONE    → idle
error      + RESET   → idle        (context: { error: null })
```

**No boolean flags** (`isRecording`, `isProcessing`, etc.) anywhere in this file.

## injectTranscript requirements (P3-5)

Must use the native prototype setter to bypass React's value override:
```typescript
const nativeValueSetter = Object.getOwnPropertyDescriptor(
  window.HTMLTextAreaElement.prototype, 'value'
)?.set
nativeValueSetter?.call(el, text)

el.dispatchEvent(new Event('input',  { bubbles: true }))
el.dispatchEvent(new Event('change', { bubbles: true }))
el.dispatchEvent(new CustomEvent('speech:done', { detail: { text }, bubbles: true }))
```

Throw `SpeechError('TARGET_NOT_FOUND', ...)` if selector matches nothing.

## Open questions

- **OQ-02**: Interim transcripts — default to preview bubble only (do not call `injectTranscript` on interim). Mark with `// TODO: OQ-02` in `useTranscript.ts`.
- **OQ-01**: Auth token in WsTransport headers — stub with `// TODO: OQ-01`.

## Done criteria

- [ ] `npm run tsc --workspaces --if-present` — zero errors
- [ ] `npm run lint --workspaces --if-present` — zero `no-restricted-imports` violations
- [ ] `npm run test --workspaces --if-present` — all tests pass
- [ ] `data/` layer has no React, XState, or internal imports
- [ ] `logic/` layer has no `ui/` imports
- [ ] XState machine uses v5 API (`createMachine`, `createActor`) and `requestPermission` as invoke src name
- [ ] No boolean state flags in `logic/`
- [ ] `AudioCapture` does not emit empty chunks
- [ ] `WsTransport` reconnects with 500ms base, 30s cap, ±20% jitter
- [ ] `WsTransport` sends both `X-Session-Id` and `Authorization` headers (auth stubbed OQ-01)
- [ ] `injectTranscript` uses native prototype setter
- [ ] `/audit` passes all frontend-specific checks

## Merge instructions (when done)

```bash
git push origin phase/3-frontend-data
# In ~/voice-adapter:
git fetch origin
git merge phase/3-frontend-data --no-ff -m "merge(p3): frontend data & logic layers"
git worktree remove ~/voice-adapter-frontend-data
git branch -d phase/3-frontend-data
```
