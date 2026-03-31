import type { Request, Response, NextFunction } from 'express'

// TODO: OQ-01 — replace with real auth before launch
export const authMiddleware = (req: Request, _res: Response, next: NextFunction): void => {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  ;(req as any).clientId = (req.headers['x-client-id'] as string | undefined) ?? 'anonymous'
  next()
}
