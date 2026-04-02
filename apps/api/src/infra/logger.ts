import pino from 'pino'

export const baseLogger = pino({
  level: process.env['LOG_LEVEL'] ?? 'info',
  formatters: {
    level: (label) => ({ level: label }),
  },
  timestamp: pino.stdTimeFunctions.isoTime,
})

// Usage: baseLogger.child({ sessionId, requestId, instanceId: process.env.INSTANCE_ID })
