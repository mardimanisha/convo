import Redis from 'ioredis'
import { RedisAdapter } from './RedisAdapter'
import { DeepgramAdapter } from './DeepgramAdapter'
import { MockDeepgramAdapter } from './MockDeepgramAdapter'
import { SessionService } from '../services/SessionService'
import { RateLimitService } from '../services/RateLimitService'
import { RelayService } from '../services/RelayService'
import type { IRedisAdapter, ISessionService, IRateLimitService, IRelayService, IDeepgramAdapter } from './types'

// container.ts is the single place that wires concrete classes to interfaces.

const redisUrl = process.env['REDIS_URL'] ?? 'redis://localhost:6379'

const redisClient     = new Redis(redisUrl, { lazyConnect: true })
const redisSubscriber = new Redis(redisUrl, { lazyConnect: true })

// MOCK_DEEPGRAM=true uses MockDeepgramAdapter (no API key, deterministic transcripts).
// Used by Playwright E2E tests and local dev without a real Deepgram subscription.
const deepgramAdapter: IDeepgramAdapter = process.env['MOCK_DEEPGRAM'] === 'true'
  ? new MockDeepgramAdapter()
  : new DeepgramAdapter()

export const redisAdapter:     IRedisAdapter     = new RedisAdapter(redisClient, redisSubscriber)
export const sessionService:   ISessionService   = new SessionService(redisAdapter)
export const relayService:     IRelayService     = new RelayService(deepgramAdapter, redisAdapter)

// RateLimitService uses the concrete Redis client directly for atomic INCR/DECR
export const rateLimitService: IRateLimitService = new RateLimitService(redisClient)

export const wsBaseUrl = process.env['WS_BASE_URL'] ?? `ws://localhost:${process.env['PORT'] ?? 3000}`
