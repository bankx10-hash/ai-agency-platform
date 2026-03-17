import { Router, Request, Response } from 'express'
import { prisma } from '../lib/prisma'
import { authMiddleware, AuthRequest } from '../middleware/auth'
import { onboardingQueue } from '../queue/onboarding.queue'
import { encryptJSON } from '../utils/encrypt'
import { emailService } from '../services/email.service'
import { logger } from '../utils/logger'
import { z } from 'zod'

const router = Router()

const startOnboardingSchema = z.object({
  clientId: z.string(),
  stripeSessionId: z.string().optional()
})

const connectCRMSchema = z.object({
  crmType: z.enum(['gohighlevel', 'hubspot', 'salesforce', 'zoho', 'none']),
  apiKey: z.string().optional(),
  locationId: z.string().optional()   // GHL-specific: sub-account location ID
})

const connectGmailSchema = z.object({
  code: z.string()
})

const connectLinkedInSchema = z.object({
  sessionCookie: z.string()
})

const connectSocialSchema = z.object({
  metaAccessToken: z.string().optional(),
  metaPageId: z.string().optional(),
  instagramUserId: z.string().optional(),
  bufferToken: z.string().optional(),
  platforms: z.array(z.string()).optional()
})

router.post('/start', async (req: Request, res: Response): Promise<void> => {
  try {
    const parsed = startOnboardingSchema.safeParse(req.body)
    if (!parsed.success) {
      res.status(400).json({ error: 'Invalid request body', details: parsed.error.errors })
      return
    }

    const { clientId } = parsed.data

    const client = await prisma.client.findUnique({ where: { id: clientId } })
    if (!client) {
      res.status(404).json({ error: 'Client not found' })
      return
    }

    const existingOnboarding = await prisma.onboarding.findUnique({ where: { clientId } })
    if (!existingOnboarding) {
      await prisma.onboarding.create({
        data: {
          clientId,
          step: 1,
          status: 'IN_PROGRESS',
          data: { startedAt: new Date().toISOString() }
        }
      })
    }

    await onboardingQueue.add(
      { clientId },
      {
        attempts: 3,
        backoff: {
          type: 'exponential',
          delay: 5000
        },
        jobId: `onboarding-${clientId}`
      }
    )

    logger.info('Onboarding job queued', { clientId })

    res.json({ message: 'Onboarding started', clientId })
  } catch (error) {
    logger.error('Error starting onboarding', { error })
    res.status(500).json({ error: 'Internal server error' })
  }
})

router.get('/:clientId/status', authMiddleware, async (req: AuthRequest, res: Response): Promise<void> => {
  try {
    const { clientId } = req.params

    if (req.clientId !== clientId) {
      res.status(403).json({ error: 'Forbidden' })
      return
    }

    const onboarding = await prisma.onboarding.findUnique({
      where: { clientId }
    })

    if (!onboarding) {
      res.status(404).json({ error: 'Onboarding not found' })
      return
    }

    const agents = await prisma.agentDeployment.findMany({
      where: { clientId },
      select: { agentType: true, status: true }
    })

    res.json({
      onboarding: {
        step: onboarding.step,
        status: onboarding.status,
        data: onboarding.data,
        completedAt: onboarding.completedAt
      },
      agents
    })
  } catch (error) {
    logger.error('Error fetching onboarding status', { error, clientId: req.params.clientId })
    res.status(500).json({ error: 'Internal server error' })
  }
})

router.post('/:clientId/connect-crm', authMiddleware, async (req: AuthRequest, res: Response): Promise<void> => {
  try {
    const { clientId } = req.params

    if (req.clientId !== clientId) {
      res.status(403).json({ error: 'Forbidden' })
      return
    }

    const parsed = connectCRMSchema.safeParse(req.body)
    if (!parsed.success) {
      res.status(400).json({ error: 'Invalid request body', details: parsed.error.errors })
      return
    }

    const { crmType, apiKey, locationId } = parsed.data

    if (crmType !== 'none' && apiKey) {
      const credPayload: Record<string, string> = { crmType, apiKey }

      // GHL requires a locationId to scope all API calls to the correct sub-account
      if (crmType === 'gohighlevel') {
        if (!locationId) {
          res.status(400).json({ error: 'GoHighLevel requires a Location ID' })
          return
        }
        credPayload.locationId = locationId

        // Persist locationId directly on the Client record so agents can use it
        await prisma.client.update({
          where: { id: clientId },
          data: { ghlLocationId: locationId }
        })
      }

      const encryptedCreds = encryptJSON(credPayload)

      await prisma.clientCredential.upsert({
        where: { id: `crm-${clientId}` },
        update: { credentials: encryptedCreds, service: crmType },
        create: {
          id: `crm-${clientId}`,
          clientId,
          service: crmType,
          credentials: encryptedCreds
        }
      })
    }

    await prisma.onboarding.update({
      where: { clientId },
      data: {
        data: {
          crmConnected: true,
          crmType
        }
      }
    })

    logger.info('CRM connected', { clientId, crmType })

    res.json({ message: 'CRM connected successfully', crmType })
  } catch (error) {
    logger.error('Error connecting CRM', { error, clientId: req.params.clientId })
    res.status(500).json({ error: 'Internal server error' })
  }
})

router.post('/:clientId/connect-gmail', authMiddleware, async (req: AuthRequest, res: Response): Promise<void> => {
  try {
    const { clientId } = req.params

    if (req.clientId !== clientId) {
      res.status(403).json({ error: 'Forbidden' })
      return
    }

    const parsed = connectGmailSchema.safeParse(req.body)
    if (!parsed.success) {
      res.status(400).json({ error: 'Invalid request body', details: parsed.error.errors })
      return
    }

    const { code } = parsed.data

    const tokens = await emailService.exchangeCodeForTokens(code)

    const encryptedCreds = encryptJSON({
      accessToken: tokens.accessToken,
      refreshToken: tokens.refreshToken,
      email: tokens.email
    })

    await prisma.clientCredential.upsert({
      where: { id: `gmail-${clientId}` },
      update: { credentials: encryptedCreds },
      create: {
        id: `gmail-${clientId}`,
        clientId,
        service: 'gmail',
        credentials: encryptedCreds
      }
    })

    await prisma.onboarding.update({
      where: { clientId },
      data: {
        data: {
          emailConnected: true,
          gmailEmail: tokens.email
        }
      }
    })

    logger.info('Gmail connected', { clientId, gmailEmail: tokens.email })

    res.json({ message: 'Gmail connected successfully', email: tokens.email })
  } catch (error) {
    logger.error('Error connecting Gmail', { error, clientId: req.params.clientId })
    res.status(500).json({ error: 'Internal server error' })
  }
})

router.get('/gmail/auth-url', authMiddleware, (req: AuthRequest, res: Response): void => {
  try {
    const authUrl = emailService.getGmailAuthUrl(req.clientId!)
    res.json({ url: authUrl })
  } catch (error) {
    logger.error('Error generating Gmail auth URL', { error })
    res.status(500).json({ error: 'Internal server error' })
  }
})

router.get('/oauth/gmail/callback', async (req: Request, res: Response): Promise<void> => {
  const { code, state: clientId, error: oauthError } = req.query as Record<string, string>
  const portalUrl = process.env['PORTAL_URL'] || 'http://localhost:3000'

  if (oauthError || !code || !clientId) {
    res.redirect(`${portalUrl}/onboarding/connect?gmail=error`)
    return
  }

  try {
    const tokens = await emailService.exchangeCodeForTokens(code)

    const encryptedCreds = encryptJSON({
      accessToken: tokens.accessToken,
      refreshToken: tokens.refreshToken,
      email: tokens.email
    })

    await prisma.clientCredential.upsert({
      where: { id: `gmail-${clientId}` },
      update: { credentials: encryptedCreds },
      create: {
        id: `gmail-${clientId}`,
        clientId,
        service: 'gmail',
        credentials: encryptedCreds
      }
    })

    await prisma.onboarding.upsert({
      where: { clientId },
      update: { data: { emailConnected: true, gmailEmail: tokens.email } },
      create: {
        clientId,
        step: 1,
        status: 'IN_PROGRESS',
        data: { emailConnected: true, gmailEmail: tokens.email }
      }
    })

    logger.info('Gmail connected via OAuth callback', { clientId, gmailEmail: tokens.email })
    res.redirect(`${portalUrl}/onboarding/connect?gmail=connected`)
  } catch (error) {
    logger.error('Error in Gmail OAuth callback', { error, clientId })
    res.redirect(`${portalUrl}/onboarding/connect?gmail=error`)
  }
})

router.post('/:clientId/connect-linkedin', authMiddleware, async (req: AuthRequest, res: Response): Promise<void> => {
  try {
    const { clientId } = req.params

    if (req.clientId !== clientId) {
      res.status(403).json({ error: 'Forbidden' })
      return
    }

    const parsed = connectLinkedInSchema.safeParse(req.body)
    if (!parsed.success) {
      res.status(400).json({ error: 'Invalid request body', details: parsed.error.errors })
      return
    }

    const encryptedCreds = encryptJSON({ sessionCookie: parsed.data.sessionCookie })

    await prisma.clientCredential.upsert({
      where: { id: `linkedin-${clientId}` },
      update: { credentials: encryptedCreds },
      create: {
        id: `linkedin-${clientId}`,
        clientId,
        service: 'linkedin',
        credentials: encryptedCreds
      }
    })

    logger.info('LinkedIn cookie saved', { clientId })

    res.json({ message: 'LinkedIn connected successfully' })
  } catch (error) {
    logger.error('Error connecting LinkedIn', { error, clientId: req.params.clientId })
    res.status(500).json({ error: 'Internal server error' })
  }
})

router.post('/:clientId/connect-social', authMiddleware, async (req: AuthRequest, res: Response): Promise<void> => {
  try {
    const { clientId } = req.params

    if (req.clientId !== clientId) {
      res.status(403).json({ error: 'Forbidden' })
      return
    }

    const parsed = connectSocialSchema.safeParse(req.body)
    if (!parsed.success) {
      res.status(400).json({ error: 'Invalid request body', details: parsed.error.errors })
      return
    }

    const { metaAccessToken, metaPageId, instagramUserId, bufferToken, platforms } = parsed.data

    if (metaAccessToken || metaPageId || instagramUserId) {
      const encryptedMeta = encryptJSON({
        accessToken: metaAccessToken || '',
        pageId: metaPageId || '',
        instagramUserId: instagramUserId || ''
      })

      await prisma.clientCredential.upsert({
        where: { id: `meta-${clientId}` },
        update: { credentials: encryptedMeta },
        create: {
          id: `meta-${clientId}`,
          clientId,
          service: 'meta',
          credentials: encryptedMeta
        }
      })
    }

    if (bufferToken) {
      const encryptedBuffer = encryptJSON({ accessToken: bufferToken })

      await prisma.clientCredential.upsert({
        where: { id: `buffer-${clientId}` },
        update: { credentials: encryptedBuffer },
        create: {
          id: `buffer-${clientId}`,
          clientId,
          service: 'buffer',
          credentials: encryptedBuffer
        }
      })
    }

    if (platforms && platforms.length > 0) {
      await prisma.onboarding.update({
        where: { clientId },
        data: {
          data: {
            socialConnected: true,
            platforms
          }
        }
      })
    }

    logger.info('Social credentials saved', { clientId, platforms })

    res.json({ message: 'Social credentials saved successfully' })
  } catch (error) {
    logger.error('Error saving social credentials', { error, clientId: req.params.clientId })
    res.status(500).json({ error: 'Internal server error' })
  }
})

export default router
