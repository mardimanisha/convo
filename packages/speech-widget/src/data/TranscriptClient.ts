import { EventEmitter } from 'events'
import { WsTransport } from './WsTransport'
import { SpeechError, TranscriptEvent, ServerMessage } from './types'

/**
 * Implements ITranscriptClient.
 * Composes WsTransport to manage the session lifecycle and forward audio chunks.
 * Maps server wire-protocol messages to typed TranscriptEvent / SpeechError emissions.
 */
export class TranscriptClient extends EventEmitter {
  private transport: WsTransport

  constructor(transport: WsTransport) {
    super()
    this.transport = transport
  }

  async connect(sessionId: string, lang: string): Promise<void> {
    await this.transport.connect(sessionId)

    this.transport.on('message', (msg: ServerMessage) => {
      if (msg.type === 'transcript.interim' || msg.type === 'transcript.final') {
        const event: TranscriptEvent = {
          type:       msg.type === 'transcript.interim' ? 'interim' : 'final',
          text:       msg.text,
          confidence: msg.confidence,
          sessionId,
        }
        this.emit('transcript', event)
      } else if (msg.type === 'error') {
        this.emit('error', new SpeechError(msg.code, msg.message))
      }
    })

    this.transport.on('error', (err: SpeechError) => {
      this.emit('error', err)
    })

    this.transport.sendJSON({ type: 'session.open', sessionId, lang })
  }

  sendChunk(data: Blob | ArrayBuffer): void {
    if (data instanceof ArrayBuffer) {
      this.transport.sendBinary(data)
    } else {
      // Convert Blob → ArrayBuffer for the binary transport
      data.arrayBuffer().then(buf => this.transport.sendBinary(buf))
    }
  }

  disconnect(): void {
    this.transport.sendJSON({ type: 'session.close', sessionId: '' })
    this.transport.disconnect()
  }
}
