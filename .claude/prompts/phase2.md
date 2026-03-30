# Phase 2 — Backend: Relay Service & WebSocket Gateway

> Read this file once at the start of your session in the `voice-adapter-relay-ws` worktree.
> After reading, run `/setup` then `/plan`.

## Prerequisites

Phase 1 must be merged to `main` before starting this phase.
Run `/sync` first to pull Phase 1 types and infrastructure.

## Context

You are building the real-time audio relay: a WebSocket gateway that accepts audio from the
browser widget, streams it to Deepgram, and returns transcripts back to the client.
Redis Pub/Sub bridges transcript events across multiple server instances (ADR-06).

**Worktree:** `~/voice-adapter-relay-ws`
**Branch:** `phase/2-relay-ws`
**Package manager:** npm (not pnpm)
**Stack:** TypeScript 5.4, Express 4, ws 8, @deepgram/sdk 3, ioredis 5, pino 9, prom-client 15, Zod 3
**Tests:** Jest 29 + Supertest 7, ioredis-mock 8, ws (real client in integration tests)

---

## Scope — What you build in this phase

| Task | Files to create | Done when |
|------|----------------|-----------|
| P2-1 | `apps/api/src/infra/DeepgramAdapter.ts` | Unit with mock: connect/send/close verified; reconnect backoff logic present; integration test skipped unless `DEEPGRAM_API_KEY` set |
| P2-2 | `apps/api/src/services/RelayService.ts` | Unit: openSession emits transcripts; pipeChunk forwards chunks; closeSession cleans up; Redis Pub/Sub bridge re-emits |
| P2-3 | `apps/api/src/controllers/SpeechController.ts` | Unit with mock RelayService: each method delegates correctly; errors caught and surfaced as error frames |
| P2-4 | `apps/api/src/routes/wsGateway.ts` | Integration: WS client sends session.open → binary chunks → session.close → receives transcript.final; malformed JSON returns error frame |
| P2-5 | Metrics wired | After session open/close, `GET /metrics` shows updated values for all four metrics |

---

## Architecture constraints

- **Layer rule**: `routes/ → controllers/ → services/ → infra/`
- `RelayService` depends on `IDeepgramAdapter` and `IRedisAdapter` interfaces — never concrete classes.
- `SpeechController` has **no** ws or Express imports — those live in `wsGateway.ts` only.
- `DEEPGRAM_API_KEY` is read from `process.env` in `DeepgramAdapter.ts` **only**. Never passed as a parameter, never logged.

## DeepgramAdapter requirements (P2-1)

Implements `IDeepgramAdapter`. Wraps `@deepgram/sdk` live streaming.

**Three behaviours beyond basic connect/send/close:**
1. **Keepalive pings**: send a ping every 8 seconds to prevent Deepgram's 10-second idle timeout.
2. **UtteranceEnd mapping**: Deepgram `UtteranceEnd` events must be mapped to `transcript.final` events.
3. **Reconnect with exponential backoff**: on unexpected Deepgram-side disconnects, retry with backoff before surfacing an error.

API key: `process.env.DEEPGRAM_API_KEY` — throw `SpeechError('DEEPGRAM_UNAVAILABLE', ...)` if missing.

## RelayService requirements (P2-2)

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

    // Reconnect scenario: receive transcripts published by other instances (ADR-06)
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

## WebSocket Gateway requirements (P2-4)

```typescript
wss.on('connection', async (ws, req) => {
  // sessionId is created here from the Authorization header
  const sessionId = await sessionController.create(req.headers.authorization)
  const log = baseLogger.child({ sessionId, instanceId: process.env.INSTANCE_ID })

  ws.on('message', (data) => {
    if (Buffer.isBuffer(data)) {
      speechController.onAudioChunk(sessionId, data)
    } else {
      const msg = parseAndValidateControlMessage(data)  // Zod schema
      if (!msg) {
        ws.send(JSON.stringify({ type: 'error', code: 'INVALID_MESSAGE' }))
        return
      }
      speechController.onControlMessage(sessionId, msg)
    }
  })

  ws.on('close', () => {
    speechController.onClose(sessionId)
    log.info('websocket closed')
  })
})
```

**Key details:**
- Validate `Authorization` header — stub with `// TODO: OQ-01`.
- Set `X-Session-Id` as a **response** header during the WS upgrade (used by the Nginx load balancer for sticky session routing via `hash $http_x_session_id consistent`).
- Validate all JSON control messages with Zod — reject malformed frames with an error frame (never throw uncaught).

## Wire protocol (CLAUDE.md §14)

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

## Open questions — stub these

- **OQ-01**: Auth not resolved. Wire `// TODO: OQ-01` stub in both `wsGateway.ts` and `SessionController`.
- **OQ-03**: Deepgram concurrent stream limit unknown. Handle connection errors with `DEEPGRAM_UNAVAILABLE`.

## Done criteria

- [ ] `npm run tsc --workspaces --if-present` — zero errors
- [ ] `npm run lint --workspaces --if-present` — zero violations
- [ ] `npm run test --workspaces --if-present` — all tests pass
- [ ] Controllers have no ws/Express imports
- [ ] `DEEPGRAM_API_KEY` not in any client-facing code or log output
- [ ] DeepgramAdapter has keepalive pings, UtteranceEnd mapping, and reconnect backoff
- [ ] Integration test: WS open → chunks → close → `transcript.final` received
- [ ] Malformed JSON returns `error` frame with `INVALID_MESSAGE` code (no crash)
- [ ] `X-Session-Id` set as response header during WS upgrade
- [ ] `GET /metrics` shows all four metric names with updated values after a session
- [ ] `// TODO: OQ-01` stub present and greppable
- [ ] `/audit` passes all backend-specific checks

## Merge instructions (when done)

```bash
git push origin phase/2-relay-ws
# In ~/voice-adapter:
git fetch origin
git merge phase/2-relay-ws --no-ff -m "merge(p2): relay service & websocket gateway"
git worktree remove ~/voice-adapter-relay-ws
git branch -d phase/2-relay-ws
```
