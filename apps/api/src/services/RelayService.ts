import { EventEmitter } from 'events'
import type { IRelayService, IDeepgramAdapter, IRedisAdapter, IDeepgramSession, TranscriptEvent } from '../infra/types'
import * as metrics from '../infra/metrics'

interface SessionEntry {
  dg:       IDeepgramSession
  lang:     string
  openedAt: number   // Date.now() — used to observe transcript latency histogram
}

export class RelayService extends EventEmitter implements IRelayService {
  private readonly sessions = new Map<string, SessionEntry>()

  constructor(
    private readonly deepgram: IDeepgramAdapter,
    private readonly redis:    IRedisAdapter,
  ) {
    super()
  }

  async openSession(sessionId: string, lang: string): Promise<void> {
    const dg       = await this.deepgram.connect({ language: lang })
    const openedAt = Date.now()
    this.sessions.set(sessionId, { dg, lang, openedAt })

    dg.on('transcript', (event: TranscriptEvent) => {
      const stamped: TranscriptEvent = { ...event, sessionId }

      // Publish for cross-instance relay (ADR-06)
      this.redis.publish(`transcript:${sessionId}`, JSON.stringify(stamped)).catch(() => {
        // Non-fatal — local emit still proceeds
      })

      if (stamped.type === 'final' && stamped.text) {
        metrics.transcriptLatencyMs.observe(Date.now() - openedAt)
      }

      this.emit('transcript', stamped)
    })

    dg.on('close', () => {
      // Unexpected Deepgram disconnect — clean up without double-counting metrics
      if (this.sessions.has(sessionId)) {
        this.sessions.delete(sessionId)
        metrics.wsConnectionsActive.dec()
      }
    })

    // Cross-instance reconnect bridge (ADR-06):
    // If this instance doesn't hold the Deepgram connection (another node does),
    // transcripts arrive here via Redis and are re-emitted to the local WS client.
    await this.redis.subscribe(`transcript:${sessionId}`, (msg: string) => {
      try {
        this.emit('transcript', JSON.parse(msg) as TranscriptEvent)
      } catch {
        // Ignore malformed Redis messages
      }
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
