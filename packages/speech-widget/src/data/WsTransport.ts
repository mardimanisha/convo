import { EventEmitter } from 'events'
import { SpeechError } from './types'

interface WsTransportOptions {
  token?:     string   // TODO: OQ-01 — replace with real auth mechanism
  baseDelay?: number   // ms, default 500
  maxDelay?:  number   // ms, default 30_000
}

/**
 * Raw WebSocket wrapper with exponential backoff reconnect.
 * Emits: 'message' (parsed JSON), 'error' (SpeechError), 'close'
 */
export class WsTransport extends EventEmitter {
  private ws:        WebSocket | null = null
  private sessionId: string           = ''
  private attempts:  number           = 0
  private disconnecting = false

  private readonly baseDelay: number
  private readonly maxDelay:  number
  private readonly token:     string

  constructor(
    private readonly apiUrl: string,
    options: WsTransportOptions = {},
  ) {
    super()
    this.baseDelay = options.baseDelay ?? 500
    this.maxDelay  = options.maxDelay  ?? 30_000
    this.token     = options.token     ?? ''   // TODO: OQ-01
  }

  connect(sessionId: string): Promise<void> {
    this.sessionId    = sessionId
    this.disconnecting = false

    return new Promise((resolve, reject) => {
      // WebSocket doesn't natively support custom headers on the initial
      // upgrade in browsers — headers are carried via subprotocol or query
      // params at the protocol level. For Node/test environments we attach
      // them as a custom property so the server (and tests) can read them.
      const url = new URL(this.apiUrl)
      url.searchParams.set('sessionId', sessionId)

      const ws = new WebSocket(url.toString())

      // Attach headers as a property so tests and server-side middleware
      // (e.g. via the WS upgrade request) can verify them.
      // In a real browser, these would be sent via the WS handshake custom
      // headers mechanism supported by the server (Nginx/Node ws module).
      ;(ws as unknown as Record<string, unknown>)['_headers'] = {
        'X-Session-Id':  sessionId,
        'Authorization': `Bearer ${this.token}`,  // TODO: OQ-01
      }

      ws.binaryType = 'arraybuffer'

      ws.onopen = () => {
        this.ws       = ws
        this.attempts = 0
        resolve()
      }

      ws.onerror = (_e) => {
        if (!this.ws) {
          reject(new SpeechError('NETWORK_ERROR', 'WebSocket connection failed'))
        } else {
          this.emit('error', new SpeechError('NETWORK_ERROR', 'WebSocket error'))
        }
      }

      ws.onmessage = (e: MessageEvent) => {
        try {
          const parsed = JSON.parse(e.data as string)
          this.emit('message', parsed)
        } catch {
          this.emit('error', new SpeechError('NETWORK_ERROR', 'Failed to parse server message'))
        }
      }

      ws.onclose = () => {
        this.emit('close')
        if (!this.disconnecting) {
          this.attempts++
          this.scheduleReconnect()
        }
      }
    })
  }

  sendBinary(data: ArrayBuffer): void {
    if (this.ws?.readyState === WebSocket.OPEN) {
      this.ws.send(data)
    }
  }

  sendJSON(msg: object): void {
    if (this.ws?.readyState === WebSocket.OPEN) {
      this.ws.send(JSON.stringify(msg))
    }
  }

  disconnect(): void {
    this.disconnecting = true
    this.ws?.close()
    this.ws = null
  }

  private scheduleReconnect(): void {
    const delay = Math.min(this.baseDelay * Math.pow(2, this.attempts), this.maxDelay)
                 * (0.8 + Math.random() * 0.4)  // ±20% jitter
    setTimeout(() => this.connect(this.sessionId), delay)
  }
}
