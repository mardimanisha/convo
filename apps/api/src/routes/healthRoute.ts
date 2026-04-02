import { Router } from 'express'

export const healthRouter = Router()

healthRouter.get('/health', (_req, res) => {
  res.json({
    status: 'ok',
    uptime: process.uptime(),
    // npm sets npm_package_version automatically when running via npm scripts
    version: process.env['npm_package_version'] ?? '0.0.0',
  })
})
