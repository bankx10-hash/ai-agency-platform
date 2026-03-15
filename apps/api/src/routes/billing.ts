import { Router, Response } from 'express'
import { PrismaClient } from '@prisma/client'
import { authMiddleware, AuthRequest } from '../middleware/auth'
import { stripeService } from '../services/stripe.service'
import { logger } from '../utils/logger'
import { z } from 'zod'

const router = Router()
const prisma = new PrismaClient()

const checkoutSchema = z.object({
  priceId: z.string(),
  clientId: z.string(),
  successUrl: z.string().url(),
  cancelUrl: z.string().url()
})

const portalSchema = z.object({
  returnUrl: z.string().url()
})

router.post('/create-checkout-session', authMiddleware, async (req: AuthRequest, res: Response): Promise<void> => {
  try {
    const parsed = checkoutSchema.safeParse(req.body)
    if (!parsed.success) {
      res.status(400).json({ error: 'Invalid request', details: parsed.error.errors })
      return
    }

    const { priceId, clientId, successUrl, cancelUrl } = parsed.data

    if (req.clientId !== clientId) {
      res.status(403).json({ error: 'Forbidden' })
      return
    }

    const client = await prisma.client.findUnique({ where: { id: clientId } })
    if (!client) {
      res.status(404).json({ error: 'Client not found' })
      return
    }

    const { url, sessionId } = await stripeService.createCheckoutSession(
      client.stripeCustomerId,
      priceId,
      successUrl,
      cancelUrl,
      { clientId }
    )

    logger.info('Checkout session created', { clientId, priceId, sessionId })

    res.json({ url, sessionId })
  } catch (error) {
    logger.error('Error creating checkout session', { error })
    res.status(500).json({ error: 'Failed to create checkout session' })
  }
})

router.post('/portal', authMiddleware, async (req: AuthRequest, res: Response): Promise<void> => {
  try {
    const parsed = portalSchema.safeParse(req.body)
    if (!parsed.success) {
      res.status(400).json({ error: 'Invalid request' })
      return
    }

    const client = await prisma.client.findUnique({ where: { id: req.clientId } })
    if (!client) {
      res.status(404).json({ error: 'Client not found' })
      return
    }

    const { url } = await stripeService.createBillingPortalSession(
      client.stripeCustomerId,
      parsed.data.returnUrl
    )

    res.json({ url })
  } catch (error) {
    logger.error('Error creating billing portal session', { error })
    res.status(500).json({ error: 'Failed to open billing portal' })
  }
})

export default router
