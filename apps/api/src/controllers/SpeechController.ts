import type { Logger } from 'pino'
import type { IRelayService, ISessionService, TranscriptEvent } from '../infra/types'
import type { ClientControlMessage } from '../infra/types'
import { sessionOpenErrors } from '../infra/metrics'

// SpeechController has NO ws or Express imports — those live in wsGateway.ts only.

export class SpeechController {
  private readonly log: Logger

  constructor(
    private readonly relay:      IRelayService,
    private readonly session:    ISessionService,
    private readonly sendToClient: (msg: object) => void,
    logger: Logger,
    sessionId: string,
  ) {
    this.log = logger.child({ sessionId })
  }

  async onControlMessage(sessionId: string, msg: ClientControlMessage): Promise<void> {
    if (msg.type === 'session.open') {
      try {
        await this.relay.openSession(sessionId, msg.lang)

        // Wire relay transcript events → client for this session
        this.relay.on('transcript', (event: TranscriptEvent) => {
          if (event.sessionId !== sessionId) return
          this.sendToClient({
            type:       `transcript.${event.type}`,
            text:       event.text,
            confidence: event.confidence,
          })
        })

        this.log.info({ lang: msg.lang }, 'session opened')
      } catch (err) {
        const message = err instanceof Error ? err.message : String(err)
        const code    = (err != null && typeof err === 'object' && 'code' in err)
          ? String((err as { code: unknown }).code)
          : 'DEEPGRAM_UNAVAILABLE'
        this.log.error({ err, code }, 'session.open failed')
        sessionOpenErrors.inc({ reason: code })
        this.sendToClient({ type: 'error', code, message })
      }
    }

    if (msg.type === 'session.close') {
      try {
        await this.relay.closeSession(sessionId)
        this.log.info('session closed by client')
      } catch (err) {
        this.log.error({ err }, 'session.close failed')
      }
    }
  }

  onAudioChunk(sessionId: string, chunk: Buffer): void {
    this.relay.pipeChunk(sessionId, chunk)
  }

  async onClose(sessionId: string): Promise<void> {
    try {
      await this.relay.closeSession(sessionId)
    } catch (err) {
      this.log.error({ err }, 'relay.closeSession failed on WS close')
    }
    try {
      await this.session.delete(sessionId)
    } catch (err) {
      this.log.error({ err }, 'session.delete failed on WS close')
    }
    this.log.info('websocket cleanup complete')
  }
}
