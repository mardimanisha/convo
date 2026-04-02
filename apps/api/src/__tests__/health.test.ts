import request from 'supertest'
import express, { Request, Response } from 'express'
import pinoHttp from 'pino-http'
import pino from 'pino'
import { v4 as uuidv4 } from 'uuid'
import { Writable } from 'stream'
import { app } from '../index'

describe('GET /health', () => {
  it('returns 200 with correct shape', async () => {
    const res = await request(app).get('/health')
    expect(res.status).toBe(200)
    expect(res.body).toMatchObject({
      status: 'ok',
      uptime: expect.any(Number),
      version: expect.any(String),
    })
  })
})

describe('GET /metrics', () => {
  it('returns Prometheus text with all four metric names', async () => {
    const res = await request(app).get('/metrics')
    expect(res.status).toBe(200)
    expect(res.headers['content-type']).toMatch(/text\/plain/)
    expect(res.text).toMatch(/ws_connections_active/)
    expect(res.text).toMatch(/transcript_latency_ms/)
    expect(res.text).toMatch(/audio_bytes_relayed_total/)
    expect(res.text).toMatch(/session_open_errors_total/)
  })
})

describe('pino-http requestId', () => {
  it('emits a log line with a UUID requestId field on every request', async () => {
    const logLines: string[] = []

    const captureStream = new Writable({
      write(chunk, _enc, cb) {
        logLines.push(chunk.toString())
        cb()
      },
    })

    const testLogger = pino(
      { level: 'info', formatters: { level: (l: string) => ({ level: l }) } },
      captureStream
    )

    const testApp = express()
    testApp.use(express.json())
    testApp.use(
      pinoHttp({
        logger: testLogger,
        genReqId: () => uuidv4(),
        customProps: (req) => ({
          requestId: req.id,
          instanceId: 'test',
        }),
      })
    )
    testApp.get('/ping', (_req: Request, res: Response) => res.json({ ok: true }))

    await request(testApp).get('/ping')
    await new Promise<void>((r) => setImmediate(r))

    expect(logLines.length).toBeGreaterThan(0)
    const parsed = JSON.parse(logLines[logLines.length - 1]!) as Record<string, unknown>
    expect(parsed).toHaveProperty('requestId')
    expect(typeof parsed['requestId']).toBe('string')
    expect(parsed['requestId']).toMatch(
      /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i
    )
  })
})
