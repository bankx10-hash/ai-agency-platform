import 'dotenv/config'
import express from 'express'
import cors from 'cors'
import { PrismaClient } from '@prisma/client'
import { apiRateLimit } from './middleware/rateLimit'
import authRouter from './routes/auth'
import billingRouter from './routes/billing'
import clientsRouter from './routes/clients'
import agentsRouter from './routes/agents'
import onboardingRouter from './routes/onboarding'
import webhooksRouter from './routes/webhooks'
import { logger } from './utils/logger'

const app = express()
const PORT = process.env.PORT || 4000

// CORS — allow all origins in production (restrict per origin in railway via env)
app.use(cors({
  origin: true,
  credentials: true
}))

// Stripe webhook needs raw body — register BEFORE express.json()
app.post('/webhooks/stripe', express.raw({ type: 'application/json' }))

app.use(express.json({ limit: '10mb' }))
app.use(express.urlencoded({ extended: true }))

app.use(apiRateLimit)

app.get('/health', (_req, res) => {
  res.json({ status: 'ok', timestamp: new Date().toISOString() })
})

app.use('/auth', authRouter)
app.use('/billing', billingRouter)
app.use('/clients', clientsRouter)
app.use('/agents', agentsRouter)
app.use('/onboarding', onboardingRouter)
app.use('/webhooks', webhooksRouter)

app.use((err: Error, _req: express.Request, res: express.Response, _next: express.NextFunction) => {
  logger.error('Unhandled error', { message: err.message, stack: err.stack })
  res.status(500).json({
    error: 'Internal server error',
    message: process.env.NODE_ENV === 'development' ? err.message : undefined
  })
})

app.use((_req, res) => {
  res.status(404).json({ error: 'Not found' })
})

async function start() {
  // Validate critical env vars
  const required = ['DATABASE_URL', 'JWT_SECRET']
  const missing = required.filter(k => !process.env[k])
  if (missing.length > 0) {
    logger.error('Missing required environment variables', { missing })
    process.exit(1)
  }

  // Test database connection
  const prisma = new PrismaClient()
  try {
    await prisma.$connect()
    logger.info('Database connected')
    await prisma.$disconnect()
  } catch (err) {
    logger.error('Database connection failed', { err })
    process.exit(1)
  }

  app.listen(PORT, () => {
    logger.info('API server running', { port: PORT, environment: process.env.NODE_ENV || 'production' })
  })
}

start()

export default app
