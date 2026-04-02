import { Registry, Gauge, Histogram, Counter } from 'prom-client'

export const registry = new Registry()

export const wsConnectionsActive = new Gauge({
  name: 'ws_connections_active',
  help: 'Number of currently active WebSocket connections',
  registers: [registry],
})

export const transcriptLatencyMs = new Histogram({
  name: 'transcript_latency_ms',
  help: 'Latency from session.open to transcript.final in milliseconds',
  buckets: [50, 100, 200, 500, 800, 1000, 2000],
  registers: [registry],
})

export const audioBytesRelayed = new Counter({
  name: 'audio_bytes_relayed_total',
  help: 'Total audio bytes relayed to Deepgram',
  registers: [registry],
})

export const sessionOpenErrors = new Counter({
  name: 'session_open_errors_total',
  help: 'Total session open errors',
  labelNames: ['reason'] as const,
  registers: [registry],
})
