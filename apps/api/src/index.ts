import 'dotenv/config'
import express from 'express'
import cors from 'cors'
import { apiRateLimit } from './middleware/rateLimit'
import authRouter from './routes/auth'
import billingRouter from './routes/billing'
import clientsRouter from './routes/clients'
import agentsRouter from './routes/agents'
import onboardingRouter from './routes/onboarding'
import webhooksRouter from './routes/webhooks'
import { logger } from './utils/logger'
import { prisma } from './lib/prisma'
import { emailService } from './services/email.service'
import { encryptJSON } from './utils/encrypt'

process.on('uncaughtException', (err) => {
  logger.error('Uncaught exception', { message: err.message, stack: err.stack })
  process.exit(1)
})

process.on('unhandledRejection', (reason) => {
  logger.error('Unhandled rejection', { reason })
  process.exit(1)
})

const app = express()
const PORT = process.env['PORT'] || 4000

app.use(cors({ origin: true, credentials: true }))

app.post('/webhooks/stripe', express.raw({ type: 'application/json' }))

app.use(express.json({ limit: '10mb' }))
app.use(express.urlencoded({ extended: true }))
app.use(apiRateLimit)

app.get('/health', (_req, res) => {
  res.json({ status: 'ok', timestamp: new Date().toISOString() })
})

app.get('/onboarding/oauth/gmail/callback', async (req, res) => {
  const { code, state: clientId, error: oauthError } = req.query as Record<string, string>
  const portalUrl = process.env['PORTAL_URL'] || 'http://localhost:3000'

  if (oauthError || !code || !clientId) {
    logger.warn('Gmail OAuth callback missing params', { code: !!code, clientId, oauthError })
    res.redirect(`${portalUrl}/onboarding/connect?gmail=error`)
    return
  }

  try {
    logger.info('Gmail callback attempting token exchange', {
      clientId,
      gmailClientId: process.env['GMAIL_CLIENT_ID']?.substring(0, 20) + '...',
      hasSecret: !!process.env['GMAIL_CLIENT_SECRET'],
      redirectUri: process.env['GMAIL_REDIRECT_URI']
    })
    const tokens = await emailService.exchangeCodeForTokens(code)
    const encryptedCreds = encryptJSON({
      accessToken: tokens.accessToken,
      refreshToken: tokens.refreshToken,
      email: tokens.email
    })

    await prisma.clientCredential.upsert({
      where: { id: `gmail-${clientId}` },
      update: { credentials: encryptedCreds },
      create: { id: `gmail-${clientId}`, clientId, service: 'gmail', credentials: encryptedCreds }
    })

    await prisma.onboarding.upsert({
      where: { clientId },
      update: { data: { emailConnected: true, gmailEmail: tokens.email } },
      create: { clientId, step: 1, status: 'IN_PROGRESS', data: { emailConnected: true, gmailEmail: tokens.email } }
    })

    logger.info('Gmail connected via OAuth callback', { clientId, gmailEmail: tokens.email })
    res.redirect(`${portalUrl}/onboarding/connect?gmail=connected`)
  } catch (error) {
    logger.error('Gmail OAuth callback error', { error, clientId })
    res.redirect(`${portalUrl}/onboarding/connect?gmail=error`)
  }
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
    message: process.env['NODE_ENV'] === 'development' ? err.message : undefined
  })
})

app.use((_req, res) => {
  res.status(404).json({ error: 'Not found' })
})

app.listen(PORT, () => {
  logger.info('API server running', { port: PORT, environment: process.env['NODE_ENV'] || 'production' })
})

export default app
