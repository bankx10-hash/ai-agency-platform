import { Router, Response } from 'express'
import { prisma } from '../lib/prisma'
import { authMiddleware, AuthRequest } from '../middleware/auth'
import { stripeService } from '../services/stripe.service'
import { logger } from '../utils/logger'
import { z } from 'zod'

const router = Router()

const checkoutSchema = z.object({
  planId: z.enum(['STARTER', 'GROWTH', 'AGENCY']),
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

    const { planId, clientId, successUrl, cancelUrl } = parsed.data

    if (req.clientId !== clientId) {
      res.status(403).json({ error: 'Forbidden' })
      return
    }

    let client = await prisma.client.findUnique({ where: { id: clientId } })
    if (!client) {
      res.status(404).json({ error: 'Client not found' })
      return
    }

    if (client.stripeCustomerId.startsWith('manual_')) {
      const stripeCustomer = await stripeService.createCustomer(client.email, client.businessName)
      client = await prisma.client.update({
        where: { id: clientId },
        data: { stripeCustomerId: stripeCustomer.id }
      })
      logger.info('Created real Stripe customer to replace manual placeholder', { clientId, stripeCustomerId: stripeCustomer.id })
    }

    const priceIdMap: Record<string, string | undefined> = {
      STARTER: process.env['STRIPE_STARTER_PRICE_ID'],
      GROWTH: process.env['STRIPE_GROWTH_PRICE_ID'],
      AGENCY: process.env['STRIPE_AGENCY_PRICE_ID']
    }
    const priceId = priceIdMap[planId]
    if (!priceId) {
      res.status(500).json({ error: `Stripe price ID for plan ${planId} is not configured` })
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
