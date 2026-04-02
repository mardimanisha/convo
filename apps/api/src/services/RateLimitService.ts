import type Redis from 'ioredis'
import type { IRateLimitService } from '../infra/types'

// NOTE: RateLimitService depends on the concrete ioredis client (not IRedisAdapter)
// because it needs atomic INCR/DECR operations that are not part of IRedisAdapter.
// IRedisAdapter intentionally omits incr/decr — see types.ts.

const MAX_CONCURRENT = parseInt(process.env['MAX_CONCURRENT_SESSIONS_PER_CLIENT'] ?? '10', 10)
const MAX_PER_MINUTE = parseInt(process.env['MAX_SESSION_OPENS_PER_MINUTE'] ?? '50', 10)
const WINDOW_TTL = 60 // seconds

if (!Number.isFinite(MAX_CONCURRENT) || MAX_CONCURRENT <= 0) {
  throw new Error(
    `Invalid MAX_CONCURRENT_SESSIONS_PER_CLIENT: "${process.env['MAX_CONCURRENT_SESSIONS_PER_CLIENT']}" — must be a positive integer`
  )
}
if (!Number.isFinite(MAX_PER_MINUTE) || MAX_PER_MINUTE <= 0) {
  throw new Error(
    `Invalid MAX_SESSION_OPENS_PER_MINUTE: "${process.env['MAX_SESSION_OPENS_PER_MINUTE']}" — must be a positive integer`
  )
}
if (!Number.isFinite(WINDOW_TTL) || WINDOW_TTL <= 0) {
  throw new Error(`Invalid WINDOW_TTL: ${WINDOW_TTL} — must be a positive integer`)
}

export class RateLimitError extends Error {
  readonly code = 'RATE_LIMIT_EXCEEDED' as const

  constructor(message: string) {
    super(message)
    this.name = 'RateLimitError'
  }
}

export class RateLimitService implements IRateLimitService {
  constructor(private readonly redis: Redis) {}

  async checkAndIncrement(clientId: string): Promise<void> {
    const countKey = `ratelimit:${clientId}:session_count`
    const windowKey = `ratelimit:${clientId}:opens_per_min`

    // Atomic check-and-increment for concurrent session count
    const newCount = await this.redis.incr(countKey)
    if (newCount > MAX_CONCURRENT) {
      await this.redis.decr(countKey)
      throw new RateLimitError(
        `Client ${clientId} has reached the maximum of ${MAX_CONCURRENT} concurrent sessions`
      )
    }

    // Atomic check-and-increment for per-minute window
    const newWindow = await this.redis.incr(windowKey)
    if (newWindow === 1) {
      // First open in this window — set the TTL
      await this.redis.expire(windowKey, WINDOW_TTL)
    }
    if (newWindow > MAX_PER_MINUTE) {
      await this.redis.decr(countKey)
      throw new RateLimitError(
        `Client ${clientId} has exceeded ${MAX_PER_MINUTE} session opens per minute`
      )
    }
  }

  async decrement(clientId: string): Promise<void> {
    const countKey = `ratelimit:${clientId}:session_count`
    const current = await this.redis.get(countKey)
    if (current !== null && parseInt(current, 10) > 0) {
      await this.redis.decr(countKey)
    }
  }
}
