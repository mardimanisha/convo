# Phase 1 — Backend: Infra & Session Management

> Read this file once at the start of your session in the `voice-adapter-backend-infra` worktree.
> After reading, run `/setup` then `/plan`.

## Context

You are building the foundational backend layer for the voice-adapter relay service.
This phase produces a fully-tested Express server with structured logging, Prometheus metrics,
Redis-backed session management, and token-bucket rate limiting.

**Worktree:** `~/voice-adapter-backend-infra`
**Branch:** `phase/1-backend-infra`
**Package manager:** npm (not pnpm)
**Stack:** Node.js, TypeScript 5.4, Express 4, ioredis 5, pino 9, prom-client 15, Zod 3, uuid 10
**Tests:** Jest 29 + Supertest 7, ioredis-mock 8

---

## Scope — What you build in this phase

| Task | Files to create | Done when |
|------|----------------|-----------|
| P1-1 | `apps/api/src/infra/logger.ts`, `metrics.ts`, `apps/api/src/routes/healthRoute.ts`, `metricsRoute.ts`, `apps/api/src/index.ts` | Supertest: `/health` 200, `/metrics` Prometheus text; pino output valid JSON with `requestId` |
| P1-2 | `apps/api/src/infra/RedisAdapter.ts`, `apps/api/src/services/SessionService.ts`, `apps/api/src/infra/container.ts` | Unit: create/get/touch/delete with ioredis-mock |
| P1-3 | `apps/api/src/services/RateLimitService.ts` | Unit: 10th session succeeds, 11th throws; 50th open/min succeeds, 51st throws |
| P1-4 | `apps/api/src/middleware/auth.ts`, `apps/api/src/controllers/SessionController.ts`, `apps/api/src/routes/speechRoutes.ts` | Supertest: POST/DELETE session; 422 on bad body; 429 on 11th session |

---

## Architecture constraints for this phase

- **Layer rule**: `routes/ → controllers/ → services/ → infra/`
- Services depend on **interfaces** (`IRedisAdapter`, `ISessionService`, `IRateLimitService`), never on concrete classes.
- Controllers have **no** Express imports — they receive typed arguments from routes only.
- `container.ts` is the single place that wires concrete classes to interfaces.

## Logger requirements (P1-1)

Every log line must contain: `level`, `time`, `sessionId`, `requestId`, `instanceId`, `msg`.

```typescript
// apps/api/src/infra/logger.ts
import pino from 'pino'
export const baseLogger = pino({
  level: process.env.LOG_LEVEL ?? 'info',
  formatters: { level: (label) => ({ level: label }) },
  timestamp: pino.stdTimeFunctions.isoTime,
})
// Usage: baseLogger.child({ sessionId, requestId, instanceId: process.env.INSTANCE_ID })
```

Wire `pino-http` middleware with a UUID `requestId` on every request.

## Metrics to register (P1-1)

```typescript
// apps/api/src/infra/metrics.ts
import { Registry, Gauge, Histogram, Counter } from 'prom-client'
export const registry            = new Registry()
export const wsConnectionsActive = new Gauge({ name: 'ws_connections_active', help: '...', registers: [registry] })
export const transcriptLatencyMs = new Histogram({ name: 'transcript_latency_ms', help: '...', buckets: [50,100,200,500,800,1000,2000], registers: [registry] })
export const audioBytesRelayed   = new Counter({ name: 'audio_bytes_relayed_total', help: '...', registers: [registry] })
export const sessionOpenErrors   = new Counter({ name: 'session_open_errors_total', help: '...', labelNames: ['reason'], registers: [registry] })
```

## Redis key schema (P1-2, P1-3)

```
session:{sessionId}                    JSON string  TTL 1800s sliding
ratelimit:{clientId}:session_count     integer      no TTL (decremented on close)
ratelimit:{clientId}:opens_per_min     integer      TTL 60s fixed window
```

> ⚠️ `IRedisAdapter` does NOT expose `incr`/`decr`. Implement rate limiting by calling
> ioredis directly inside `RateLimitService` (which depends on the concrete ioredis client,
> not the interface, for atomic operations). Document this exception in a comment.

## SessionService (P1-2)

- `create(clientId, lang)`: generate UUID v4, store `SessionRecord` JSON at `session:{sessionId}` with 1800s TTL, return `sessionId`.
- `get(sessionId)`: fetch and parse from Redis; return `null` if missing or expired.
- `touch(sessionId)`: reset TTL to 1800s — called on every `pipeChunk`.
- `delete(sessionId)`: `DEL session:{sessionId}`.

## Auth stub (P1-4)

```typescript
// apps/api/src/middleware/auth.ts — TODO: OQ-01 — replace with real auth before launch
export const authMiddleware = (req, res, next) => {
  req.clientId = req.headers['x-client-id'] ?? 'anonymous'
  next()
}
```

Mark every auth stub with `// TODO: OQ-01` so it is greppable.

## Open questions — do not block on these

- **OQ-01**: Auth mechanism unknown. Use the stub above.
- All other OQs are irrelevant to Phase 1.

## Done criteria

- [ ] `npm run tsc --workspaces --if-present` — zero errors
- [ ] `npm run lint --workspaces --if-present` — zero violations
- [ ] `npm run test --workspaces --if-present` — all tests pass
- [ ] Supertest: `GET /health` → 200 `{status:"ok", uptime, version}`
- [ ] Supertest: `GET /metrics` → Prometheus text with all four metric names
- [ ] Supertest: `POST /api/session` → 201 `{sessionId, wsUrl}`
- [ ] Supertest: `POST /api/session` with invalid body → 422
- [ ] Supertest: 11th `POST /api/session` from same clientId → 429
- [ ] pino output contains `requestId` field on every log line
- [ ] `/audit` passes all backend-specific checks
- [ ] No `console.log` in production code

## Merge instructions (when done)

```bash
git push origin phase/1-backend-infra
# In ~/voice-adapter (primary repo):
git fetch origin
git merge phase/1-backend-infra --no-ff -m "merge(p1): backend infra & session management"
git worktree remove ~/voice-adapter-backend-infra
git branch -d phase/1-backend-infra
```
