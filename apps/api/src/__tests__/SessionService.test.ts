import RedisMock from 'ioredis-mock'
import { RedisAdapter } from '../infra/RedisAdapter'
import { SessionService } from '../services/SessionService'

function makeService() {
  const client = new RedisMock()
  const adapter = new RedisAdapter(client)
  return new SessionService(adapter)
}

describe('SessionService', () => {
  it('create returns a UUID v4 sessionId', async () => {
    const svc = makeService()
    const id = await svc.create('client-1', 'en-US')
    expect(id).toMatch(
      /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i
    )
  })

  it('get returns the session record after create', async () => {
    const svc = makeService()
    const id = await svc.create('client-2', 'fr-FR')
    const record = await svc.get(id)
    expect(record).not.toBeNull()
    expect(record!.sessionId).toBe(id)
    expect(record!.clientId).toBe('client-2')
    expect(record!.lang).toBe('fr-FR')
    expect(record!.createdAt).toBeTruthy()
    expect(record!.lastActiveAt).toBeTruthy()
  })

  it('get returns null for a non-existent sessionId', async () => {
    const svc = makeService()
    const result = await svc.get('does-not-exist')
    expect(result).toBeNull()
  })

  it('delete removes the session so get returns null', async () => {
    const svc = makeService()
    const id = await svc.create('client-3', 'en-US')
    await svc.delete(id)
    const result = await svc.get(id)
    expect(result).toBeNull()
  })

  it('touch resets the TTL without changing the record', async () => {
    const svc = makeService()
    const id = await svc.create('client-4', 'en-US')
    // touch should not throw and session should still be retrievable
    await expect(svc.touch(id)).resolves.not.toThrow()
    const record = await svc.get(id)
    expect(record!.sessionId).toBe(id)
  })

  it('two creates produce distinct sessionIds', async () => {
    const svc = makeService()
    const id1 = await svc.create('client-5', 'en-US')
    const id2 = await svc.create('client-5', 'en-US')
    expect(id1).not.toBe(id2)
  })
})
