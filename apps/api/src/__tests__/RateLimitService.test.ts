import RedisMock from 'ioredis-mock'
import { RateLimitService, RateLimitError } from '../services/RateLimitService'

function makeService() {
  const client = new RedisMock()
  return new RateLimitService(client)
}

describe('RateLimitService — concurrent session limit (MAX=10)', () => {
  it('allows 10 concurrent sessions and rejects the 11th', async () => {
    const svc = makeService()
    for (let i = 0; i < 10; i++) {
      await expect(svc.checkAndIncrement('clientA')).resolves.not.toThrow()
    }
    await expect(svc.checkAndIncrement('clientA')).rejects.toThrow(RateLimitError)
  })

  it('after decrement, a new session is allowed again', async () => {
    const svc = makeService()
    for (let i = 0; i < 10; i++) {
      await svc.checkAndIncrement('clientB')
    }
    await svc.decrement('clientB')
    await expect(svc.checkAndIncrement('clientB')).resolves.not.toThrow()
  })

  it('limits are per-client (different clients are independent)', async () => {
    const svc = makeService()
    for (let i = 0; i < 10; i++) {
      await svc.checkAndIncrement('clientC')
    }
    // clientD should still be fine
    await expect(svc.checkAndIncrement('clientD')).resolves.not.toThrow()
  })
})

describe('RateLimitService — per-minute open rate limit (MAX=50)', () => {
  it('allows 50 opens per minute and rejects the 51st', async () => {
    const svc = makeService()
    // Simulate sessions opening and closing: decrement after each open so the
    // concurrent-session limit (10) never trips before the per-minute limit (50).
    for (let i = 0; i < 50; i++) {
      await expect(svc.checkAndIncrement('clientE')).resolves.not.toThrow()
      await svc.decrement('clientE')
    }
    await expect(svc.checkAndIncrement('clientE')).rejects.toThrow(RateLimitError)
  })

  it('thrown error has code RATE_LIMIT_EXCEEDED', async () => {
    const svc = makeService()
    for (let i = 0; i < 10; i++) {
      await svc.checkAndIncrement('clientF')
    }
    const err = await svc.checkAndIncrement('clientF').catch((e: unknown) => e)
    expect(err).toBeInstanceOf(RateLimitError)
    expect((err as RateLimitError).code).toBe('RATE_LIMIT_EXCEEDED')
  })
})
