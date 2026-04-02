import { Router } from 'express'
import { authMiddleware } from '../middleware/auth'
import { SessionController } from '../controllers/SessionController'
import type { Request, Response, NextFunction } from 'express'

type AsyncHandler = (req: Request, res: Response, next: NextFunction) => Promise<void>
const asyncWrapper = (fn: AsyncHandler) => (req: Request, res: Response, next: NextFunction) => {
  fn(req, res, next).catch(next)
}

export function createSpeechRouter(controller: SessionController): Router {
  const router = Router()

  router.use(authMiddleware)

  router.post('/api/session', asyncWrapper(async (req, res) => {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const clientId: string = (req as any).clientId as string
    const result = await controller.create(clientId, req.body)
    if (!result.ok) {
      res.status(result.error.status).json({ error: result.error.message })
      return
    }
    res.status(201).json(result.data)
  }))

  router.delete('/api/session/:id', asyncWrapper(async (req, res) => {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const clientId: string = (req as any).clientId as string
    const sessionId = req.params['id'] as string
    const result = await controller.remove(clientId, sessionId)
    if (!result.ok) {
      res.status(result.error.status).json({ error: result.error.message })
      return
    }
    res.status(204).send()
  }))

  return router
}
