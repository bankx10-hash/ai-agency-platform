import { Router, Request, Response } from 'express'
import { PrismaClient } from '@prisma/client'
import Stripe from 'stripe'
import { stripeService } from '../services/stripe.service'
import { n8nService } from '../services/n8n.service'
import { AgentStatus } from '../types/agent.types'
import { Plan, ClientStatus } from '../types/client.types'
import { logger } from '../utils/logger'

const router = Router()
const prisma = new PrismaClient()

router.post(
  '/stripe',
  async (req: Request, res: Response): Promise<void> => {
    const sig = req.headers['stripe-signature'] as string

    let event: Stripe.Event

    try {
      event = stripeService.constructWebhookEvent(req.body as Buffer, sig)
    } catch (error) {
      logger.error('Stripe webhook signature verification failed', { error })
      res.status(400).json({ error: 'Webhook signature verification failed' })
      return
    }

    try {
      switch (event.type) {
        case 'checkout.session.completed': {
          const session = event.data.object as Stripe.Checkout.Session

          const clientId = session.metadata?.clientId
          if (!clientId) {
            logger.warn('No clientId in Stripe session metadata')
            break
          }

          const subscription = session.subscription
            ? await stripeService.getSubscription(session.subscription as string)
            : null

          if (subscription) {
            const priceId = subscription.items.data[0]?.price.id
            const plan = stripeService.getPlanFromPriceId(priceId)

            await prisma.client.update({
              where: { id: clientId },
              data: {
                stripeSubId: subscription.id,
                plan: plan as unknown as Plan,
                status: ClientStatus.ACTIVE
              }
            })
          }

          // Onboarding is triggered by the portal after the client completes Step 2
          // (connect tools, business description, ICP). Do not queue here.
          logger.info('Stripe checkout completed, plan activated', { clientId })
          break
        }

        case 'invoice.payment_succeeded': {
          const invoice = event.data.object as Stripe.Invoice
          const customerId = invoice.customer as string

          await prisma.client.updateMany({
            where: { stripeCustomerId: customerId },
            data: { status: ClientStatus.ACTIVE }
          })

          logger.info('Payment succeeded', { customerId })
          break
        }

        case 'invoice.payment_failed': {
          const invoice = event.data.object as Stripe.Invoice
          const customerId = invoice.customer as string

          const client = await prisma.client.findFirst({
            where: { stripeCustomerId: customerId },
            include: { agents: true }
          })

          if (client) {
            await pauseAllClientAgents(client.id, client.agents)
            logger.warn('Payment failed — agents paused', { clientId: client.id, customerId })
          }
          break
        }

        case 'customer.subscription.deleted': {
          const subscription = event.data.object as Stripe.Subscription
          const customerId = subscription.customer as string

          const client = await prisma.client.findFirst({
            where: { stripeCustomerId: customerId },
            include: { agents: true }
          })

          if (client) {
            await pauseAllClientAgents(client.id, client.agents)

            await prisma.client.update({
              where: { id: client.id },
              data: { status: ClientStatus.CANCELLED }
            })

            logger.info('Subscription cancelled — all agents paused', { clientId: client.id })
          }
          break
        }

        case 'customer.subscription.updated': {
          const subscription = event.data.object as Stripe.Subscription
          const customerId = subscription.customer as string
          const priceId = subscription.items.data[0]?.price.id

          if (priceId) {
            const plan = stripeService.getPlanFromPriceId(priceId)
            await prisma.client.updateMany({
              where: { stripeCustomerId: customerId },
              data: { plan: plan as unknown as Plan }
            })
            logger.info('Subscription updated', { customerId, plan })
          }
          break
        }

        default:
          logger.debug('Unhandled Stripe event', { type: event.type })
      }

      res.json({ received: true })
    } catch (error) {
      logger.error('Error processing Stripe webhook', { error, type: event.type })
      res.status(500).json({ error: 'Webhook processing error' })
    }
  }
)

async function pauseAllClientAgents(
  clientId: string,
  agents: Array<{ id: string; n8nWorkflowId?: string | null; status: string }>
): Promise<void> {
  const activeAgents = agents.filter(a => a.status === AgentStatus.ACTIVE)

  await Promise.allSettled(
    activeAgents.map(async (agent) => {
      if (agent.n8nWorkflowId) {
        try {
          await n8nService.pauseWorkflow(agent.n8nWorkflowId)
        } catch (error) {
          logger.error('Failed to pause N8N workflow', {
            agentId: agent.id,
            workflowId: agent.n8nWorkflowId,
            error
          })
        }
      }
    })
  )

  await prisma.agentDeployment.updateMany({
    where: { clientId, status: AgentStatus.ACTIVE },
    data: { status: AgentStatus.PAUSED }
  })
}

router.post('/ghl', async (req: Request, res: Response): Promise<void> => {
  try {
    const payload = req.body as Record<string, unknown>

    logger.info('GHL webhook received', { type: payload.type })

    const locationId = payload.locationId as string
    const contactId = payload.contactId as string

    if (payload.type === 'PipelineStageChanged') {
      const stage = payload.stageId as string

      if (stage.toLowerCase().includes('ready-to-close')) {
        const client = await prisma.client.findFirst({
          where: { ghlLocationId: locationId }
        })

        if (client) {
          const closerAgent = await prisma.agentDeployment.findFirst({
            where: { clientId: client.id, agentType: 'VOICE_CLOSER', status: 'ACTIVE' }
          })

          if (closerAgent?.n8nWorkflowId) {
            await n8nService.triggerWorkflow(closerAgent.n8nWorkflowId, {
              contactId,
              locationId,
              stage
            })
          }
        }
      }
    }

    if (payload.type === 'ContactCreated' || payload.type === 'FormSubmitted') {
      const client = await prisma.client.findFirst({
        where: { ghlLocationId: locationId }
      })

      if (client) {
        const leadGenAgent = await prisma.agentDeployment.findFirst({
          where: { clientId: client.id, agentType: 'LEAD_GENERATION', status: 'ACTIVE' }
        })

        if (leadGenAgent?.n8nWorkflowId) {
          await n8nService.triggerWorkflow(leadGenAgent.n8nWorkflowId, {
            contactId,
            locationId,
            contact: payload.contact
          })
        }
      }
    }

    res.json({ received: true })
  } catch (error) {
    logger.error('Error processing GHL webhook', { error })
    res.status(500).json({ error: 'Webhook processing error' })
  }
})

router.post('/retell', async (req: Request, res: Response): Promise<void> => {
  try {
    const payload = req.body as Record<string, unknown>

    logger.info('Retell webhook received', { callId: payload.call_id })

    const callId = payload.call_id as string
    const status = payload.call_status as string

    if (status === 'ended') {
      const metadata = payload.metadata as Record<string, string> | undefined
      const clientId = metadata?.clientId

      if (clientId) {
        const voiceAgents = await prisma.agentDeployment.findMany({
          where: {
            clientId,
            agentType: { in: ['VOICE_INBOUND', 'VOICE_OUTBOUND', 'VOICE_CLOSER'] },
            status: 'ACTIVE'
          }
        })

        for (const agent of voiceAgents) {
          if (agent.n8nWorkflowId) {
            try {
              await n8nService.triggerWorkflow(agent.n8nWorkflowId, {
                call_id: callId,
                status,
                ...payload
              })
              break
            } catch (err) {
              logger.warn('Failed to trigger N8N workflow for call', { agentId: agent.id, err })
            }
          }
        }
      }
    }

    res.json({ received: true })
  } catch (error) {
    logger.error('Error processing Retell webhook', { error })
    res.status(500).json({ error: 'Webhook processing error' })
  }
})

export default router
