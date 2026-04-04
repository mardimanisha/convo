import { createServer } from 'http'
import { EventEmitter } from 'events'
import { AddressInfo } from 'net'
import Redis from 'ioredis'
import { app } from '../../../index'
import { attachWsGateway } from '../../../routes/wsGateway'
import { RedisAdapter } from '../../../infra/RedisAdapter'
import { SessionService } from '../../../services/SessionService'
import { RateLimitService } from '../../../services/RateLimitService'
import { RelayService } from '../../../services/RelayService'
import type { IDeepgramAdapter, IDeepgramSession, DeepgramOptions, TranscriptEvent } from '../../../infra/types'

// ── Mock Deepgram ─────────────────────────────────────────────────────────────
//
// Emits a single transcript.final ~50ms after the first audio chunk arrives.
// No API key, no network — deterministic and fast.

class MockDeepgramSession extends EventEmitter implements IDeepgramSession {
  private emitted = false

  send(_chunk: Buffer): void {
    if (this.emitted) return
    this.emitted = true
    setTimeout(() => {
      this.emit('transcript', {
        type:       'final',
        text:       'hello world',
        confidence: 0.99,
        sessionId:  '',           // stamped by RelayService
      } satisfies TranscriptEvent)
    }, 50)
  }

  close(): void {
    this.emit('close')
  }
}

class MockDeepgramAdapter implements IDeepgramAdapter {
  async connect(_opts: DeepgramOptions): Promise<IDeepgramSession> {
    return new MockDeepgramSession()
  }
}

// ── TestServer ────────────────────────────────────────────────────────────────

export interface TestServer {
  /** WebSocket base URL: ws://127.0.0.1:<port> */
  url:     string
  /** HTTP base URL: http://127.0.0.1:<port> */
  httpUrl: string
  /** Tears down server and closes Redis connections */
  close:   () => Promise<void>
}

export async function createTestServer(): Promise<TestServer> {
  const redisUrl = process.env['REDIS_URL'] ?? 'redis://localhost:6379'

  // Two separate ioredis clients: one for commands, one dedicated to pub/sub.
  // (ioredis enters subscriber mode on the pub/sub client and can no longer
  //  issue regular commands on that connection.)
  // maxRetriesPerRequest: 0 makes tests fail fast when Redis is not available
  // (default is 20 retries, which adds ~5s per test to the failure output)
  const redisClient     = new Redis(redisUrl, { lazyConnect: false, maxRetriesPerRequest: 0 })
  const redisSubscriber = new Redis(redisUrl, { lazyConnect: false, maxRetriesPerRequest: 0 })

  const redisAdapter    = new RedisAdapter(redisClient, redisSubscriber)
  const sessionService  = new SessionService(redisAdapter)
  const rateLimitService = new RateLimitService(redisClient)
  const relayService    = new RelayService(new MockDeepgramAdapter(), redisAdapter)

  void rateLimitService  // wired but not passed to wsGateway (session creation uses it via speechRoutes)

  const server = createServer(app)
  const wss    = attachWsGateway(server, relayService, sessionService)

  await new Promise<void>((resolve) => {
    server.listen(0, '127.0.0.1', resolve)
  })

  const { port } = server.address() as AddressInfo
  const url      = `ws://127.0.0.1:${port}`
  const httpUrl  = `http://127.0.0.1:${port}`

  const close = (): Promise<void> =>
    new Promise((resolve) => {
      wss.clients.forEach((c) => c.terminate())
      server.close(async () => {
        await redisClient.quit()
        await redisSubscriber.quit()
        resolve()
      })
    })

  return { url, httpUrl, close }
}
