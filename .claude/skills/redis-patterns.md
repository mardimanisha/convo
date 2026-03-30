# Skill: Redis Patterns for voice-adapter

## Key Schema (do not deviate — colons only, no underscores)

| Key pattern | Type | TTL | Purpose |
|-------------|------|-----|---------|
| `session:{sessionId}` | JSON string | 1800s sliding | Session record |
| `ratelimit:{clientId}:session_count` | integer | none | Concurrent session count |
| `ratelimit:{clientId}:opens_per_min` | integer | 60s fixed | Per-minute open rate |
| `transcript:{sessionId}` | Pub/Sub channel | — | Cross-instance transcript relay |

---

## IRedisAdapter interface — what it exposes

```typescript
interface IRedisAdapter {
  get(key: string): Promise<string | null>
  set(key: string, value: string, ttlSeconds?: number): Promise<void>
  del(key: string): Promise<void>
  expire(key: string, seconds: number): Promise<void>
  publish(channel: string, message: string): Promise<void>
  subscribe(channel: string, fn: (msg: string) => void): Promise<void>
  unsubscribe(channel: string): Promise<void>
}
```

> ⚠️ `IRedisAdapter` does **NOT** have `incr` or `decr` methods.
> `RateLimitService` performs atomic increment/decrement directly through the
> underlying ioredis instance (via a pipeline) — not through the shared interface.
> This keeps the interface minimal and prevents misuse of raw Redis primitives in services
> that shouldn't need them.

---

## SessionService patterns

```typescript
// Create session — store JSON with 1800s TTL
await redis.set(
  `session:${sessionId}`,
  JSON.stringify(record satisfies SessionRecord),
  1800,
)

// Touch — slide TTL on every pipeChunk call
await redis.expire(`session:${sessionId}`, 1800)

// Get session
const raw = await redis.get(`session:${sessionId}`)
return raw ? (JSON.parse(raw) as SessionRecord) : null

// Delete session
await redis.del(`session:${sessionId}`)
```

---

## RateLimitService — atomic operations via ioredis pipeline

`RateLimitService` holds a reference to the raw ioredis client (not through `IRedisAdapter`)
because it needs `INCR`, `DECR`, and `EXPIRE` atomically via pipeline.

```typescript
class RateLimitService implements IRateLimitService {
  constructor(private readonly redis: Redis) {}  // raw ioredis, not IRedisAdapter

  async checkAndIncrement(clientId: string): Promise<void> {
    // --- Concurrent session limit ---
    const count = await this.redis.incr(`ratelimit:${clientId}:session_count`)
    if (count > this.maxConcurrent) {
      await this.redis.decr(`ratelimit:${clientId}:session_count`) // rollback!
      throw new RateLimitError('RATE_LIMIT_EXCEEDED', 'Too many concurrent sessions')
    }

    // --- Per-minute open rate limit ---
    const pipe = this.redis.pipeline()
    pipe.incr(`ratelimit:${clientId}:opens_per_min`)
    pipe.expire(`ratelimit:${clientId}:opens_per_min`, 60)
    const results = await pipe.exec()
    const opens = results?.[0]?.[1] as number
    if (opens > this.maxPerMinute) {
      await this.redis.decr(`ratelimit:${clientId}:session_count`) // rollback concurrent count
      throw new RateLimitError('RATE_LIMIT_EXCEEDED', 'Rate limit exceeded')
    }
  }

  async decrement(clientId: string): Promise<void> {
    await this.redis.decr(`ratelimit:${clientId}:session_count`)
  }
}
```

Key rules:
- **Always rollback** the concurrent count before throwing — otherwise the count drifts.
- `opens_per_min` TTL is set to 60s on every increment — it self-expires, no manual cleanup needed.
- `session_count` has **no TTL** — it must be explicitly decremented on `closeSession`.

---

## Pub/Sub bridge (RelayService — ADR-06)

```typescript
// Publish transcript from whichever instance holds the Deepgram connection
await redis.publish(`transcript:${sessionId}`, JSON.stringify(event))

// Subscribe on the same channel — handles reconnect case
// (a different instance now holds the client WebSocket)
await redis.subscribe(`transcript:${sessionId}`, (msg) => {
  const event = JSON.parse(msg) as TranscriptEvent
  this.emit('transcript', event)  // re-emit to ws client
})

// Clean up on session close
await redis.unsubscribe(`transcript:${sessionId}`)
```

Why subscribe AND publish on the same channel: the publishing instance also subscribes
so that if the WebSocket client reconnects to a different Node.js instance mid-session,
that new instance will receive the transcript events published by the instance still
holding the Deepgram connection.

---

## Testing with ioredis-mock

```typescript
import Redis from 'ioredis-mock'
import { RedisAdapter } from '../infra/RedisAdapter'
import { SessionService } from '../services/SessionService'

const redis = new Redis()
const adapter = new RedisAdapter(redis)
const service = new SessionService(adapter)

test('create returns a UUID', async () => {
  const id = await service.create('client-1', 'en-US')
  expect(id).toMatch(/^[0-9a-f-]{36}$/)
})

test('get after create returns record', async () => {
  const id = await service.create('client-1', 'en-US')
  const record = await service.get(id)
  expect(record?.sessionId).toBe(id)
  expect(record?.lang).toBe('en-US')
})

test('get after delete returns null', async () => {
  const id = await service.create('client-1', 'en-US')
  await service.delete(id)
  expect(await service.get(id)).toBeNull()
})

// RateLimitService tests use raw ioredis-mock (not through adapter)
test('11th concurrent session throws', async () => {
  const redis = new Redis()
  const svc = new RateLimitService(redis)
  for (let i = 0; i < 10; i++) await svc.checkAndIncrement('client-x')
  await expect(svc.checkAndIncrement('client-x')).rejects.toThrow('RATE_LIMIT_EXCEEDED')
})

test('after decrement, new session succeeds', async () => {
  const redis = new Redis()
  const svc = new RateLimitService(redis)
  for (let i = 0; i < 10; i++) await svc.checkAndIncrement('client-y')
  await svc.decrement('client-y')
  await expect(svc.checkAndIncrement('client-y')).resolves.toBeUndefined()
})
```

---

## Common mistakes

| ❌ Wrong | ✅ Right |
|---------|---------|
| `session_${sessionId}` | `session:${sessionId}` — always colons |
| Calling `redis.incr()` through `IRedisAdapter` | `IRedisAdapter` has no `incr` — use raw ioredis in `RateLimitService` |
| No TTL on session | Always 1800s on `create`; reset on `touch` |
| No rollback before throwing rate limit error | Always `decr` before throw to avoid drift |
| No `expire` on `opens_per_min` after `incr` | Pipeline `incr` + `expire 60` atomically |
| Direct ioredis in `SessionService` | `SessionService` uses `IRedisAdapter` — testable with mock |
