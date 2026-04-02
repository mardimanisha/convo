import request from 'supertest'
import express from 'express'
import RedisMock from 'ioredis-mock'
import { RedisAdapter } from '../infra/RedisAdapter'
import { SessionService } from '../services/SessionService'
import { RateLimitService } from '../services/RateLimitService'
import { SessionController } from '../controllers/SessionController'
import { createSpeechRouter } from '../routes/speechRoutes'

function buildApp() {
  const redis = new RedisMock()
  const adapter = new RedisAdapter(redis)
  const sessions = new SessionService(adapter)
  const rateLimit = new RateLimitService(redis)
  const controller = new SessionController(sessions, rateLimit, 'http://localhost:3000')

  const app = express()
  app.use(express.json())
  app.use(createSpeechRouter(controller))
  return app
}

describe('POST /api/session', () => {
  it('creates a session and returns 201 with sessionId and wsUrl', async () => {
    const app = buildApp()
    const res = await request(app).post('/api/session').send({ lang: 'en-US' })
    expect(res.status).toBe(201)
    expect(res.body).toMatchObject({
      sessionId: expect.stringMatching(
        /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i
      ),
      wsUrl: expect.stringContaining('ws?sessionId='),
    })
  })

  it('uses default lang when not provided', async () => {
    const app = buildApp()
    const res = await request(app).post('/api/session').send({})
    expect(res.status).toBe(201)
    expect(res.body).toHaveProperty('sessionId')
  })

  it('returns 422 on invalid body (non-string lang)', async () => {
    const app = buildApp()
    const res = await request(app).post('/api/session').send({ lang: 42 })
    expect(res.status).toBe(422)
    expect(res.body).toHaveProperty('error')
  })

  it('returns 429 on the 11th concurrent session from the same client', async () => {
    const app = buildApp()
    for (let i = 0; i < 10; i++) {
      const r = await request(app)
        .post('/api/session')
        .set('x-client-id', 'heavy-client')
        .send({})
      expect(r.status).toBe(201)
    }
    const res = await request(app)
      .post('/api/session')
      .set('x-client-id', 'heavy-client')
      .send({})
    expect(res.status).toBe(429)
  })
})

describe('DELETE /api/session/:id', () => {
  it('returns 204 on successful delete', async () => {
    const app = buildApp()
    const create = await request(app).post('/api/session').send({})
    const { sessionId } = create.body as { sessionId: string }

    const res = await request(app).delete(`/api/session/${sessionId}`)
    expect(res.status).toBe(204)
  })

  it('returns 404 on double-delete', async () => {
    const app = buildApp()
    const create = await request(app).post('/api/session').send({})
    const { sessionId } = create.body as { sessionId: string }

    await request(app).delete(`/api/session/${sessionId}`)
    const res = await request(app).delete(`/api/session/${sessionId}`)
    expect(res.status).toBe(404)
  })

  it('returns 404 for non-existent sessionId', async () => {
    const app = buildApp()
    const res = await request(app).delete('/api/session/does-not-exist')
    expect(res.status).toBe(404)
  })
})
