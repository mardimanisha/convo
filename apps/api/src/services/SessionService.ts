import { v4 as uuidv4 } from 'uuid'
import type { IRedisAdapter, ISessionService, SessionRecord } from '../infra/types'

const SESSION_TTL = parseInt(process.env['SESSION_TTL_SECONDS'] ?? '1800', 10)

export class SessionService implements ISessionService {
  constructor(private readonly redis: IRedisAdapter) {}

  async create(clientId: string, lang: string): Promise<string> {
    const sessionId = uuidv4()
    const now = new Date().toISOString()
    const record: SessionRecord = {
      sessionId,
      clientId,
      lang,
      createdAt: now,
      lastActiveAt: now,
      instanceId: process.env['INSTANCE_ID'] ?? 'local',
    }
    await this.redis.set(`session:${sessionId}`, JSON.stringify(record), SESSION_TTL)
    return sessionId
  }

  async get(sessionId: string): Promise<SessionRecord | null> {
    const raw = await this.redis.get(`session:${sessionId}`)
    if (raw === null) return null
    return JSON.parse(raw) as SessionRecord
  }

  async touch(sessionId: string): Promise<void> {
    await this.redis.expire(`session:${sessionId}`, SESSION_TTL)
  }

  async delete(sessionId: string): Promise<void> {
    await this.redis.del(`session:${sessionId}`)
  }
}
