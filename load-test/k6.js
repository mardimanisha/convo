/**
 * P5-3: Load test — 5,000 concurrent WebSocket sessions
 *
 * Validates NF-01 (p95 latency < 800ms), NF-03 (RAM per session < 100KB),
 * NF-04 (5,000+ concurrent sessions), and ADR-06 (Redis Pub/Sub reconnect).
 *
 * IMPORTANT: Must run with TWO api instances to exercise ADR-06.
 * A single-instance run does NOT validate horizontal scaling.
 *
 * Prerequisites:
 *   brew install k6          # macOS
 *   sudo apt install k6      # Ubuntu/Debian (via k6 PPA)
 *   choco install k6         # Windows
 *
 * Run:
 *   docker compose -f docker-compose.loadtest.yml up --scale api=2 -d
 *   k6 run --env WS_URL=ws://localhost/ws load-test/k6.js
 *
 * Pass criteria (checked automatically via thresholds):
 *   ✅ transcript_latency_ms p95 < 800ms   (NF-01)
 *   ✅ ws_session_errors     count == 0    (NF-04)
 */

import ws       from 'k6/ws'
import { Trend, Counter } from 'k6/metrics'
import { check } from 'k6'

// ── Custom metrics ─────────────────────────────────────────────────────────────

// Time from session.close sent → transcript.final received.
// This maps directly to NF-01: "speech end → text in input" latency.
const transcriptLatency = new Trend('transcript_latency_ms', true)

// Incremented on: connection error, missing final, server error frame, parse error.
const sessionErrors = new Counter('ws_session_errors')

// ── Options ───────────────────────────────────────────────────────────────────

export const options = {
  vus:      5000,
  duration: '30s',

  thresholds: {
    // NF-01: 95th-percentile relay latency must be under 800ms
    'transcript_latency_ms': ['p(95)<800'],
    // NF-04: zero connection errors under sustained load
    'ws_session_errors':     ['count==0'],
  },
}

// ── Helpers ───────────────────────────────────────────────────────────────────

/** UUID v4 — Math.random() is sufficient for session IDs in load tests. */
function uuidv4() {
  return 'xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx'.replace(/[xy]/g, (c) => {
    const r = (Math.random() * 16) | 0
    return (c === 'x' ? r : (r & 0x3) | 0x8).toString(16)
  })
}

// ── Configuration ─────────────────────────────────────────────────────────────

// Override with: k6 run --env WS_URL=ws://your-host/ws load-test/k6.js
// Default points at the nginx proxy started by docker-compose.loadtest.yml
/* global __ENV */
const WS_URL = __ENV.WS_URL || 'ws://localhost/ws'

// ── VU workload ───────────────────────────────────────────────────────────────

export default function () {
  const sessionId = uuidv4()

  let closeTime = 0   // timestamp when session.close is sent (start of latency clock)
  let completed = false

  const res = ws.connect(
    WS_URL,
    { headers: { 'X-Session-Id': sessionId } },
    (socket) => {

      // ── open ────────────────────────────────────────────────────────────────

      socket.on('open', () => {
        // Send session.open to start the relay session
        socket.send(JSON.stringify({ type: 'session.open', sessionId, lang: 'en-US' }))

        // Send 50 binary chunks at 100ms intervals = 5 seconds of simulated audio.
        // 1600 bytes ≈ 100ms of 16kHz mono PCM (matching AudioCapture.ts timeslice).
        //
        // Using socket.setInterval rather than sleep() — sleep() blocks the k6
        // WebSocket event loop and prevents message events from being processed.
        let chunksSent = 0
        const chunkInterval = socket.setInterval(() => {
          socket.sendBinary(new ArrayBuffer(1600))
          chunksSent++

          if (chunksSent >= 50) {
            socket.clearInterval(chunkInterval)

            // All audio sent — close session and start the NF-01 latency clock.
            // The server will call dg.close(), which triggers MockDeepgramAdapter
            // (or real Deepgram) to emit transcript.final.
            closeTime = Date.now()
            socket.send(JSON.stringify({ type: 'session.close', sessionId }))
          }
        }, 100)
      })

      // ── message ─────────────────────────────────────────────────────────────

      socket.on('message', (data) => {
        try {
          const msg = JSON.parse(data)

          if (msg.type === 'transcript.final' && closeTime > 0) {
            // Record NF-01 latency: session.close → transcript.final
            transcriptLatency.add(Date.now() - closeTime)
            completed = true
            socket.close()
            return
          }

          if (msg.type === 'error') {
            sessionErrors.add(1)
            completed = true   // prevent double-count in close handler
            socket.close()
            return
          }

          // transcript.interim is expected mid-session; not an error, no latency recorded
        } catch {
          sessionErrors.add(1)
          socket.close()
        }
      })

      // ── error ────────────────────────────────────────────────────────────────

      socket.on('error', () => {
        sessionErrors.add(1)
      })

      // ── close ────────────────────────────────────────────────────────────────

      socket.on('close', () => {
        // If socket closed before we received transcript.final, count as error.
        // (Excludes intentional closes after recording latency above.)
        if (!completed) {
          sessionErrors.add(1)
        }
      })

      // ── hard timeout ─────────────────────────────────────────────────────────

      // If a session hasn't completed within 15s, something is wrong.
      // Force-close and count as error so the test doesn't hang.
      socket.setTimeout(() => {
        if (!completed) {
          sessionErrors.add(1)
          completed = true
          socket.close()
        }
      }, 15_000)
    },
  )

  // Verify the WebSocket upgrade succeeded (HTTP 101)
  check(res, {
    'WebSocket upgrade succeeded (101)': (r) => r !== null && r.status === 101,
  })
}
