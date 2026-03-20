import { Router, Request, Response } from 'express'
import { prisma, CrmType } from '../lib/prisma'
import { logger } from '../utils/logger'
import { onboardingQueue } from '../queue/onboarding.queue'
import { encryptJSON } from '../utils/encrypt'
import { n8nService } from '../services/n8n.service'
import { AGENT_REGISTRY } from '../agents'
import { AgentType, AgentStatus } from '../types/agent.types'
import { generateServiceSecret } from '../middleware/auth'

const router = Router()

function requireAdminSecret(req: Request, res: Response): boolean {
  const secret = req.headers['x-admin-secret'] || req.body?.adminSecret
  if (!secret || secret !== process.env['ADMIN_SECRET']) {
    res.status(401).json({ error: 'Invalid admin secret' })
    return false
  }
  return true
}

// GET /admin/clients — list all clients with their IDs
router.get('/clients', async (req: Request, res: Response) => {
  if (!requireAdminSecret(req, res)) return
  const clients = await prisma.client.findMany({
    select: { id: true, email: true, plan: true, status: true, createdAt: true }
  })
  res.json(clients)
})

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

// POST /admin/resave-crm-creds — re-encrypt CRM credentials using server's ENCRYPTION_KEY
router.post('/resave-crm-creds', async (req: Request, res: Response) => {
  if (!requireAdminSecret(req, res)) return

  const { clientId, crmType, accessToken, portalId, apiKey } = req.body
  if (!clientId || !crmType) {
    res.status(400).json({ error: 'clientId and crmType required' })
    return
  }

  const credPayload: Record<string, string> = { crmType }
  if (crmType === 'hubspot') {
    credPayload.accessToken = accessToken || ''
    credPayload.portalId = portalId || ''
  } else {
    credPayload.apiKey = apiKey || ''
  }

  const encrypted = encryptJSON(credPayload)

  await prisma.clientCredential.upsert({
    where: { id: `crm-${clientId}` },
    update: { credentials: encrypted, service: crmType },
    create: { id: `crm-${clientId}`, clientId, service: crmType, credentials: encrypted }
  })

  logger.info('CRM credentials re-saved via admin', { clientId, crmType })
  res.json({ success: true, message: 'Credentials re-encrypted and saved' })
})

// POST /admin/redeploy-agent — delete and redeploy a single agent workflow
router.post('/redeploy-agent', async (req: Request, res: Response) => {
  if (!requireAdminSecret(req, res)) return

  const { clientId, agentType } = req.body
  if (!clientId || !agentType) {
    res.status(400).json({ error: 'clientId and agentType required' })
    return
  }

  const existing = await prisma.agentDeployment.findFirst({
    where: { clientId, agentType }
  })

  if (existing?.n8nWorkflowId) {
    try {
      await n8nService.deleteWorkflow(existing.n8nWorkflowId)
    } catch (e) {
      logger.warn('Could not delete old workflow', { workflowId: existing.n8nWorkflowId })
    }
    await prisma.agentDeployment.delete({ where: { id: existing.id } })
  }

  const client = await prisma.client.findUnique({
    where: { id: clientId },
    select: { businessName: true, email: true, serviceSecret: true, businessDescription: true, icpDescription: true }
  })
  if (!client) {
    res.status(404).json({ error: 'Client not found' })
    return
  }

  let serviceSecret = client.serviceSecret
  if (!serviceSecret) {
    serviceSecret = generateServiceSecret()
    await prisma.client.update({ where: { id: clientId }, data: { serviceSecret } })
  }

  const AgentClass = AGENT_REGISTRY[agentType as AgentType]
  if (!AgentClass) {
    res.status(400).json({ error: `Unknown agent type: ${agentType}` })
    return
  }

  const agent = new AgentClass()
  await agent.deploy(clientId, {
    locationId: clientId,
    businessName: client.businessName,
    businessDescription: client.businessDescription ?? undefined,
    icpDescription: client.icpDescription ?? undefined,
    api_key: serviceSecret
  })

  logger.info('Agent redeployed via admin', { clientId, agentType })
  res.json({ success: true, message: `${agentType} redeployed successfully` })
})

export default router
