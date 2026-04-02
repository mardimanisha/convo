import { z } from 'zod'
import type { ISessionService, IRateLimitService } from '../infra/types'
import { RateLimitError } from '../services/RateLimitService'
import { baseLogger } from '../infra/logger'

const createBodySchema = z.object({
  lang: z.string().optional().default('en-US'),
})

export interface CreateSessionResult {
  sessionId: string
  wsUrl: string
}

export type CreateSessionError =
  | { status: 422; message: string }
  | { status: 429; message: string }
  | { status: 500; message: string }

// Controllers have no Express imports — they receive typed arguments from routes only.
export class SessionController {
  constructor(
    private readonly sessions: ISessionService,
    private readonly rateLimit: IRateLimitService,
    private readonly wsBaseUrl: string
  ) {}

  async create(
    clientId: string,
    body: unknown
  ): Promise<{ ok: true; data: CreateSessionResult } | { ok: false; error: CreateSessionError }> {
    const parsed = createBodySchema.safeParse(body)
    if (!parsed.success) {
      return { ok: false, error: { status: 422, message: parsed.error.message } }
    }

    try {
      await this.rateLimit.checkAndIncrement(clientId)
    } catch (err) {
      if (err instanceof RateLimitError) {
        return { ok: false, error: { status: 429, message: err.message } }
      }
      return { ok: false, error: { status: 500, message: 'Internal error' } }
    }

    let sessionId: string
    try {
      sessionId = await this.sessions.create(clientId, parsed.data.lang)
    } catch {
      await this.rateLimit.decrement(clientId).catch((err) =>
        baseLogger.error({ clientId, err }, 'Failed to roll back rate-limit increment after session create failure')
      )
      return { ok: false, error: { status: 500, message: 'Internal error' } }
    }
    return {
      ok: true,
      data: {
        sessionId,
        wsUrl: `${this.wsBaseUrl}/ws?sessionId=${sessionId}`,
      },
    }
  }

  async remove(
    clientId: string,
    sessionId: string
  ): Promise<{ ok: true } | { ok: false; error: { status: 403; message: string } | { status: 404; message: string } | { status: 500; message: string } }> {
    const existing = await this.sessions.get(sessionId)
    if (existing === null) {
      return { ok: false, error: { status: 404, message: 'Session not found' } }
    }
    if (existing.clientId !== clientId) {
      return { ok: false, error: { status: 403, message: 'Forbidden' } }
    }
    try {
      await this.sessions.delete(sessionId)
      await this.rateLimit.decrement(existing.clientId)
    } catch (err) {
      console.error('Failed to remove session', err)
      return { ok: false, error: { status: 500, message: 'Failed to remove session' } }
    }
    return { ok: true }
  }
}
