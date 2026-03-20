import 'dotenv/config'
import express from 'express'
import cors from 'cors'
import { apiRateLimit } from './middleware/rateLimit'
import authRouter from './routes/auth'
import billingRouter from './routes/billing'
import clientsRouter from './routes/clients'
import agentsRouter from './routes/agents'
import crmRouter from './routes/crm'
import onboardingRouter from './routes/onboarding'
import webhooksRouter from './routes/webhooks'
import adminRouter from './routes/admin'
import { logger } from './utils/logger'
import { prisma } from './lib/prisma'
import { emailService } from './services/email.service'
import { socialService } from './services/social.service'
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

app.post('/admin/test-onboard', async (req, res) => {
  try {
    const bcrypt = require('bcryptjs')
    const { onboardingQueue } = require('./queue/onboarding.queue')
    const {
      businessName = 'Test Business',
      email = `test-${Date.now()}@test.com`,
      password = 'password123',
      plan = 'STARTER',
      crmType = 'NONE',
      businessDescription = 'A test business for AI automation',
      icpDescription = 'Small business owners looking to automate'
    } = req.body

    const existing = await prisma.client.findUnique({ where: { email } })
    if (existing) {
      // Reset existing client for re-onboarding
      await prisma.onboarding.deleteMany({ where: { clientId: existing.id } })
      await prisma.client.update({ where: { id: existing.id }, data: { status: 'PENDING', crmType, businessDescription, icpDescription } })
      await onboardingQueue.add({ clientId: existing.id }, { jobId: `onboarding-${existing.id}-${Date.now()}`, attempts: 3 })
      res.json({ message: 'Existing client re-queued for onboarding', clientId: existing.id, email })
      return
    }

    const passwordHash = await bcrypt.hash(password, 12)
    const client = await prisma.client.create({
      data: {
        businessName,
        email,
        passwordHash,
        stripeCustomerId: `test_${Date.now()}`,
        status: 'PENDING',
        plan,
        crmType,
        businessDescription,
        icpDescription
      }
    })

    await onboardingQueue.add({ clientId: client.id }, { jobId: `onboarding-${client.id}-${Date.now()}`, attempts: 3 })

    const { generateToken } = require('./middleware/auth')
    const token = generateToken(client.id, client.email)

    logger.info('Test onboarding triggered', { clientId: client.id, email, plan })
    res.json({ message: 'Test client created and onboarding queued', clientId: client.id, email, plan, token })
  } catch (error) {
    res.status(500).json({ error: String(error) })
  }
})

app.post('/admin/flush-redis', async (_req, res) => {
  try {
    const Bull = require('bull')
    const queue = new Bull('onboarding', process.env['REDIS_URL'] || 'redis://localhost:6379')
    await queue.empty()
    await queue.clean(0, 'failed')
    await queue.clean(0, 'completed')
    await queue.clean(0, 'delayed')
    await queue.close()
    logger.info('Redis queue flushed via admin endpoint')
    res.json({ success: true, message: 'Queue flushed' })
  } catch (error) {
    res.status(500).json({ error: String(error) })
  }
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

// Meta data deletion callback (required by Facebook Login)
app.post('/meta/data-deletion', (req, res) => {
  logger.info('Meta data deletion request received')
  res.json({
    url: `${process.env['PORTAL_URL'] || 'http://localhost:3000'}/data-deletion`,
    confirmation_code: `del_${Date.now()}`
  })
})

app.get('/onboarding/oauth/meta/callback', async (req, res) => {
  const { code, state: clientId, error: oauthError } = req.query as Record<string, string>
  const portalUrl = process.env['PORTAL_URL'] || 'http://localhost:3000'

  if (oauthError || !code || !clientId) {
    logger.warn('Meta OAuth callback missing params', { code: !!code, clientId, oauthError })
    res.redirect(`${portalUrl}/onboarding/connect?meta=error`)
    return
  }

  try {
    const { pageAccessToken, pageId, pageName, instagramUserId } = await socialService.exchangeMetaCode(code)

    const encryptedCreds = encryptJSON({ pageAccessToken, pageId, pageName, instagramUserId })

    await prisma.clientCredential.upsert({
      where: { id: `meta-${clientId}` },
      update: { credentials: encryptedCreds },
      create: { id: `meta-${clientId}`, clientId, service: 'meta', credentials: encryptedCreds }
    })

    await prisma.onboarding.upsert({
      where: { clientId },
      update: { data: { metaConnected: true, metaPageId: pageId, metaPageName: pageName } },
      create: { clientId, step: 1, status: 'IN_PROGRESS', data: { metaConnected: true, metaPageId: pageId, metaPageName: pageName } }
    })

    logger.info('Meta connected via OAuth callback', { clientId, pageId, pageName, hasInstagram: !!instagramUserId })
    res.redirect(`${portalUrl}/onboarding/connect?meta=connected`)
  } catch (error) {
    logger.error('Meta OAuth callback error', { error, clientId })
    res.redirect(`${portalUrl}/onboarding/connect?meta=error`)
  }
})

app.get('/onboarding/oauth/linkedin/callback', async (req, res) => {
  const { code, state: clientId, error: oauthError } = req.query as Record<string, string>
  const portalUrl = process.env['PORTAL_URL'] || 'http://localhost:3000'

  if (oauthError || !code || !clientId) {
    logger.warn('LinkedIn OAuth callback missing params', { code: !!code, clientId, oauthError })
    res.redirect(`${portalUrl}/onboarding/connect?linkedin=error`)
    return
  }

  try {
    const { accessToken, personUrn, name } = await socialService.exchangeLinkedInCode(code)

    const encryptedCreds = encryptJSON({ accessToken, personUrn, name })

    await prisma.clientCredential.upsert({
      where: { id: `linkedin-social-${clientId}` },
      update: { credentials: encryptedCreds },
      create: { id: `linkedin-social-${clientId}`, clientId, service: 'linkedin-social', credentials: encryptedCreds }
    })

    await prisma.onboarding.upsert({
      where: { clientId },
      update: { data: { linkedinConnected: true, linkedinName: name } },
      create: { clientId, step: 1, status: 'IN_PROGRESS', data: { linkedinConnected: true, linkedinName: name } }
    })

    logger.info('LinkedIn connected via OAuth callback', { clientId, personUrn, name })
    res.redirect(`${portalUrl}/onboarding/connect?linkedin=connected`)
  } catch (error) {
    logger.error('LinkedIn OAuth callback error', { error, clientId })
    res.redirect(`${portalUrl}/onboarding/connect?linkedin=error`)
  }
})

app.use('/auth', authRouter)
app.use('/billing', billingRouter)
app.use('/clients', clientsRouter)
app.use('/agents', agentsRouter)
app.use('/clients/:clientId/crm', crmRouter)
app.use('/onboarding', onboardingRouter)
app.use('/webhooks', webhooksRouter)
app.use('/admin', adminRouter)

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
