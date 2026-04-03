import express from 'express'
import pinoHttp from 'pino-http'
import { v4 as uuidv4 } from 'uuid'
import { baseLogger } from './infra/logger'
import { healthRouter } from './routes/healthRoute'
import { metricsRouter } from './routes/metricsRoute'
import { createSpeechRouter } from './routes/speechRoutes'
import { sessionService, rateLimitService, relayService, wsBaseUrl } from './infra/container'
import { SessionController } from './controllers/SessionController'
import { attachWsGateway } from './routes/wsGateway'

export const app = express()

app.use(express.json())

app.use(
  pinoHttp({
    logger: baseLogger,
    genReqId: () => uuidv4(),
    customProps: (req) => ({
      requestId: req.id,
      instanceId: process.env['INSTANCE_ID'] ?? 'local',
    }),
  })
)

app.use(healthRouter)
app.use(metricsRouter)

const sessionController = new SessionController(sessionService, rateLimitService, wsBaseUrl)
app.use(createSpeechRouter(sessionController))

if (require.main === module) {
  const port = process.env['PORT'] ?? 3000
  const server = app.listen(port, () => {
    baseLogger.info({ instanceId: process.env['INSTANCE_ID'] ?? 'local' }, `api listening on :${port}`)
  })
  attachWsGateway(server, relayService, sessionService)
}
