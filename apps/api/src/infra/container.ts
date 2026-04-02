import Redis from 'ioredis'
import { RedisAdapter } from './RedisAdapter'
import { SessionService } from '../services/SessionService'
import { RateLimitService } from '../services/RateLimitService'
import type { IRedisAdapter, ISessionService, IRateLimitService } from './types'

// container.ts is the single place that wires concrete classes to interfaces.

const redisUrl = process.env['REDIS_URL'] ?? 'redis://localhost:6379'

const redisClient = new Redis(redisUrl, { lazyConnect: true })
const redisSubscriber = new Redis(redisUrl, { lazyConnect: true })

export const redisAdapter: IRedisAdapter = new RedisAdapter(redisClient, redisSubscriber)
export const sessionService: ISessionService = new SessionService(redisAdapter)

// RateLimitService uses the concrete Redis client directly for atomic INCR/DECR
export const rateLimitService: IRateLimitService = new RateLimitService(redisClient)

export const wsBaseUrl = process.env['WS_BASE_URL'] ?? `ws://localhost:${process.env['PORT'] ?? 3000}`
