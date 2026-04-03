import { EventEmitter } from 'events'
import { createClient, LiveTranscriptionEvents } from '@deepgram/sdk'
import type { ListenLiveClient } from '@deepgram/sdk'
import type { IDeepgramAdapter, IDeepgramSession, DeepgramOptions, TranscriptEvent } from './types'
import { SpeechError } from './types'

const KEEPALIVE_INTERVAL_MS  = 8_000
const RECONNECT_BASE_MS      = 500
const RECONNECT_MAX_MS       = 30_000
const RECONNECT_MAX_ATTEMPTS = 8
const CONNECT_TIMEOUT_MS     = 10_000

// ── DeepgramSession ──────────────────────────────────────────────────────────

class DeepgramSession extends EventEmitter implements IDeepgramSession {
  private keepaliveTimer: ReturnType<typeof setInterval> | null = null
  private closed = false

  constructor(private conn: ListenLiveClient) {
    super()
    this.setupListeners()
    this.startKeepalive()
  }

  private setupListeners(): void {
    this.conn.on(LiveTranscriptionEvents.Transcript, (data) => {
      const alt = data?.channel?.alternatives?.[0]
      if (!alt || !alt.transcript) return
      const isFinal: boolean = data.is_final === true
      const event: TranscriptEvent = {
        type:       isFinal ? 'final' : 'interim',
        text:       alt.transcript,
        confidence: alt.confidence,
        sessionId:  '',   // stamped by RelayService, which owns the sessionId
      }
      this.emit('transcript', event)
    })

    // Fix #4: UtteranceEnd signals silence but carries no text.
    // Emitting { type: 'final', text: '' } would inject a blank into the host input.
    // Suppress — the Results event with is_final:true already handles finalization.
    // UtteranceEnd is intentionally not forwarded.

    this.conn.on(LiveTranscriptionEvents.Close, () => {
      this.stopKeepalive()
      if (!this.closed) this.emit('close')
    })

    this.conn.on(LiveTranscriptionEvents.Error, (err) => {
      this.stopKeepalive()
      if (!this.closed) this.emit('close')
      this.emit('error', err)
    })
  }

  private startKeepalive(): void {
    this.keepaliveTimer = setInterval(() => {
      // Fix #6: keepAlive() may throw if the socket closed between our flag check and the call
      try {
        if (!this.closed) this.conn.keepAlive()
      } catch {
        // Socket already gone — stopKeepalive will be called via the close event
      }
    }, KEEPALIVE_INTERVAL_MS)
  }

  private stopKeepalive(): void {
    if (this.keepaliveTimer !== null) {
      clearInterval(this.keepaliveTimer)
      this.keepaliveTimer = null
    }
  }

  send(chunk: Buffer): void {
    if (!this.closed) {
      // Fix #1: chunk.buffer is the full underlying pool allocation.
      // Slice to the exact byte range this Buffer occupies.
      const safe = chunk.buffer.slice(chunk.byteOffset, chunk.byteOffset + chunk.byteLength)
      this.conn.send(safe as ArrayBuffer)
    }
  }

  close(): void {
    if (this.closed) return
    this.closed = true
    this.stopKeepalive()
    this.conn.requestClose()
  }
}

// ── DeepgramAdapter ──────────────────────────────────────────────────────────

export class DeepgramAdapter implements IDeepgramAdapter {
  async connect(opts: DeepgramOptions): Promise<IDeepgramSession> {
    const apiKey = process.env['DEEPGRAM_API_KEY']
    if (!apiKey) {
      // Fix #7: throw typed SpeechError so SpeechController can discriminate the code
      throw new SpeechError('DEEPGRAM_UNAVAILABLE', 'DEEPGRAM_API_KEY is not set')
    }
    return this.connectWithRetry(apiKey, opts, 0)
  }

  private connectWithRetry(
    apiKey: string,
    opts: DeepgramOptions,
    attempt: number,
  ): Promise<IDeepgramSession> {
    return new Promise((resolve, reject) => {
      const client = createClient(apiKey)
      const conn   = client.listen.live({ language: opts.language, model: 'nova-2' })

      // Fix #8: if Deepgram never fires open or error the promise would hang forever
      const connectTimeout = setTimeout(() => {
        // Fix #3: remove listeners before abandoning this conn
        conn.removeAllListeners()
        if (attempt < RECONNECT_MAX_ATTEMPTS) {
          const delay = Math.min(RECONNECT_BASE_MS * Math.pow(2, attempt), RECONNECT_MAX_MS)
          setTimeout(() => {
            this.connectWithRetry(apiKey, opts, attempt + 1).then(resolve).catch(reject)
          }, delay)
        } else {
          reject(new SpeechError('DEEPGRAM_UNAVAILABLE', `Connection timed out after ${attempt + 1} attempts`))
        }
      }, CONNECT_TIMEOUT_MS)

      const onOpen = () => {
        clearTimeout(connectTimeout)
        // Fix #3: remove the error listener now that open succeeded
        conn.removeListener(LiveTranscriptionEvents.Error, onError)

        const session = new DeepgramSession(conn)

        // Fix #2: do NOT reconnect here. Adapter emits 'close'; RelayService
        // decides whether to re-open the session. A silent reconnect here would
        // create a new IDeepgramSession that nothing holds a reference to, so
        // audio would keep flowing to a dead socket.

        resolve(session)
      }

      const onError = (err: unknown) => {
        clearTimeout(connectTimeout)
        // Fix #3: remove listeners before abandoning this conn
        conn.removeAllListeners()
        if (attempt < RECONNECT_MAX_ATTEMPTS) {
          const delay = Math.min(RECONNECT_BASE_MS * Math.pow(2, attempt), RECONNECT_MAX_MS)
          setTimeout(() => {
            this.connectWithRetry(apiKey, opts, attempt + 1).then(resolve).catch(reject)
          }, delay)
        } else {
          reject(new SpeechError(
            'DEEPGRAM_UNAVAILABLE',
            `Failed after ${attempt + 1} attempts: ${String(err)}`,
          ))
        }
      }

      conn.on(LiveTranscriptionEvents.Open,  onOpen)
      conn.on(LiveTranscriptionEvents.Error, onError)
    })
  }
}
