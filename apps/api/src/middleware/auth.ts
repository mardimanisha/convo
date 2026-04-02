import type { Request, Response, NextFunction } from 'express'

// Accepted client-id format: 1–64 alphanumeric/hyphen/underscore characters.
// Values that don't match are treated as anonymous to prevent key-injection
// into Redis namespaces (e.g. ratelimit:<clientId>:session_count).
const CLIENT_ID_RE = /^[a-zA-Z0-9_-]{1,64}$/

// TODO: OQ-01 — replace with real auth before launch
export const authMiddleware = (req: Request, _res: Response, next: NextFunction): void => {
  const raw = req.headers['x-client-id'] as string | undefined
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  ;(req as any).clientId = raw !== undefined && CLIENT_ID_RE.test(raw) ? raw : 'anonymous'
  next()
}
