import { WebSocketServer, WebSocket } from 'ws'
import type { Server } from 'http'
import { z } from 'zod'
import { v4 as uuidv4 } from 'uuid'
import { baseLogger } from '../infra/logger'
import { SpeechController } from '../controllers/SpeechController'
import type { IRelayService, ISessionService, ClientControlMessage } from '../infra/types'

// ── Zod schema for client control messages ────────────────────────────────────

const controlMessageSchema = z.discriminatedUnion('type', [
  z.object({
    type:      z.literal('session.open'),
    sessionId: z.string(),
    lang:      z.string().default('en-US'),
  }),
  z.object({
    type:      z.literal('session.close'),
    sessionId: z.string(),
  }),
])

function parseControlMessage(raw: unknown): ClientControlMessage | null {
  try {
    const parsed = controlMessageSchema.parse(
      typeof raw === 'string' ? JSON.parse(raw) : raw,
    )
    return parsed as ClientControlMessage
  } catch {
    return null
  }
}

// ── Gateway factory ───────────────────────────────────────────────────────────

export function attachWsGateway(
  server:         Server,
  relayService:   IRelayService,
  sessionService: ISessionService,
): WebSocketServer {
  const wss = new WebSocketServer({ server })

  wss.on('connection', (ws: WebSocket, req) => {
    // TODO: OQ-01 — validate Authorization header; stub always passes in development

    // X-Session-Id sticky-session routing for the Nginx load balancer:
    //   Nginx config: `hash $http_x_session_id consistent`
    //   $http_x_session_id reads the REQUEST header, not the response header.
    //   Per CLAUDE.md §8 P3-2, the widget (WsTransport) sends X-Session-Id in
    //   the WS upgrade request so Nginx can route the connection to the correct
    //   instance before the server even sees it.
    //
    //   The server honours the client-provided ID if present, or generates one
    //   (e.g., on first connect before the widget knows its sessionId). ws@8
    //   does not support adding custom headers to the 101 Switching Protocols
    //   response without raw socket manipulation, so the generated ID is
    //   communicated back to the client via the first server→client JSON frame.
    const clientSessionId = Array.isArray(req.headers['x-session-id'])
      ? req.headers['x-session-id'][0]
      : req.headers['x-session-id']
    const sessionId = (typeof clientSessionId === 'string' && clientSessionId.length > 0)
      ? clientSessionId
      : uuidv4()

    const log = baseLogger.child({
      sessionId,
      instanceId: process.env['INSTANCE_ID'] ?? 'local',
    })

    const sendToClient = (msg: object) => {
      if (ws.readyState === WebSocket.OPEN) {
        ws.send(JSON.stringify(msg))
      }
    }

    const controller = new SpeechController(relayService, sessionService, sendToClient, log, sessionId)

    log.info({ remoteAddress: req.socket.remoteAddress }, 'websocket connected')

    ws.on('message', (data, isBinary) => {
      if (isBinary) {
        // Binary frame — raw audio chunk
        controller.onAudioChunk(sessionId, Buffer.isBuffer(data) ? data : Buffer.from(data as ArrayBuffer))
        return
      }

      // Text frame — control message (ws@8 delivers text as Buffer; toString() converts it)
      const raw = Buffer.isBuffer(data) ? data.toString('utf8') : String(data)
      const msg = parseControlMessage(raw)
      if (!msg) {
        log.warn({ raw }, 'received invalid control message')
        sendToClient({ type: 'error', code: 'INVALID_MESSAGE', message: 'Unrecognised message format' })
        return
      }

      controller.onControlMessage(sessionId, msg).catch((err) => {
        log.error({ err }, 'unhandled error in onControlMessage')
        sendToClient({ type: 'error', code: 'NETWORK_ERROR', message: 'Internal error' })
      })
    })

    ws.on('close', (code, reason) => {
      log.info({ code, reason: reason.toString() }, 'websocket closed')
      controller.onClose(sessionId).catch((err) => {
        log.error({ err }, 'error during websocket cleanup')
      })
    })

    ws.on('error', (err) => {
      log.error({ err }, 'websocket error')
    })
  })

  return wss
}
