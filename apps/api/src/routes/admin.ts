import { Router, Request, Response } from 'express'
import { prisma, CrmType } from '../lib/prisma'
import { logger } from '../utils/logger'
import { onboardingQueue } from '../queue/onboarding.queue'

const router = Router()

function requireAdminSecret(req: Request, res: Response): boolean {
  const secret = req.headers['x-admin-secret'] || req.body?.adminSecret
  if (!secret || secret !== process.env['ADMIN_SECRET']) {
    res.status(401).json({ error: 'Invalid admin secret' })
    return false
  }
  return true
}

// POST /admin/ghl/token — update GHL API token in DB (no redeployment needed)
router.post('/ghl/token', async (req: Request, res: Response) => {
  if (!requireAdminSecret(req, res)) return

  const { token } = req.body
  if (!token || typeof token !== 'string' || !token.startsWith('pit-')) {
    res.status(400).json({ error: 'Invalid token format — must start with pit-' })
    return
  }

  await prisma.systemConfig.upsert({
    where: { key: 'GHL_API_KEY' },
    update: { value: token },
    create: { key: 'GHL_API_KEY', value: token }
  })

  logger.info('GHL API token updated via admin endpoint')
  res.json({ success: true, message: 'GHL token updated — active immediately' })
})

// GET /admin/ghl/token — check current token expiry info
router.get('/ghl/token', async (req: Request, res: Response) => {
  if (!requireAdminSecret(req, res)) return

  const config = await prisma.systemConfig.findUnique({ where: { key: 'GHL_API_KEY' } })
  if (!config) {
    res.json({ source: 'env', message: 'Using token from environment variable' })
    return
  }

  const daysSinceUpdate = Math.floor((Date.now() - config.updatedAt.getTime()) / (1000 * 60 * 60 * 24))
  const daysRemaining = 7 - daysSinceUpdate

  res.json({
    source: 'database',
    updatedAt: config.updatedAt,
    daysRemaining: daysRemaining > 0 ? daysRemaining : 0,
    expired: daysRemaining <= 0,
    token: config.value.slice(0, 12) + '...'
  })
})

// POST /admin/test-onboarding — create a test client and trigger full onboarding (bypasses Stripe)
router.post('/test-onboarding', async (req: Request, res: Response) => {
  if (!requireAdminSecret(req, res)) return

  const {
    email = 'test@nodusaisystems.com',
    businessName = 'Nodus Test Client',
    plan = 'STARTER',
    businessDescription = 'An Australian business looking to grow with AI automation',
    icpDescription = 'Australian SMBs with 5-200 employees looking to grow revenue'
  } = req.body

  // Create client record
  const client = await prisma.client.create({
    data: {
      email,
      businessName,
      plan,
      status: 'PENDING',
      crmType: CrmType.NONE,
      businessDescription,
      icpDescription,
      passwordHash: 'test-only',
      stripeCustomerId: `test_${Date.now()}`
    }
  })

  // Queue onboarding job
  await onboardingQueue.add({ clientId: client.id }, {
    jobId: `onboarding-${client.id}-${Date.now()}`,
    attempts: 3,
    backoff: { type: 'exponential', delay: 5000 }
  })

  logger.info('Admin test onboarding triggered', { clientId: client.id, plan, businessName })

  res.json({
    success: true,
    clientId: client.id,
    message: `Onboarding job queued for ${businessName} (${plan}). Watch N8N for workflow deployments.`,
    n8nUrl: process.env['N8N_BASE_URL']
  })
})

// GET /admin/test-onboarding/:clientId — check onboarding status
router.get('/test-onboarding/:clientId', async (req: Request, res: Response) => {
  if (!requireAdminSecret(req, res)) return

  const { clientId } = req.params
  const onboarding = await prisma.onboarding.findUnique({ where: { clientId } })
  const agents = await prisma.agentDeployment.findMany({
    where: { clientId },
    select: { agentType: true, status: true, n8nWorkflowId: true, createdAt: true }
  })

  res.json({ onboarding, agents })
})

export default router
