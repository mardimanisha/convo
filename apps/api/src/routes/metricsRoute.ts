import { Router } from 'express'
import { registry } from '../infra/metrics'

export const metricsRouter = Router()

metricsRouter.get('/metrics', async (_req, res, next) => {
  try {
    res.set('Content-Type', registry.contentType)
    res.send(await registry.metrics())
  } catch (err) {
    next(err)
  }
})
