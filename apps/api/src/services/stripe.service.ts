import Stripe from 'stripe'
import { Plan } from '../../../packages/shared/types/client.types'
import { logger } from '../utils/logger'

export class StripeService {
  private stripe: Stripe | null = null

  private getStripe(): Stripe {
    if (!this.stripe) {
      const secretKey = process.env.STRIPE_SECRET_KEY
      if (!secretKey) {
        throw new Error('STRIPE_SECRET_KEY environment variable is not set')
      }
      this.stripe = new Stripe(secretKey, {
        apiVersion: '2023-10-16' as Stripe.LatestApiVersion
      })
    }
    return this.stripe
  }

  constructor() {
    if (!process.env.STRIPE_SECRET_KEY) {
      logger.warn('STRIPE_SECRET_KEY not set — billing features will be unavailable')
    }
  }

  async createCustomer(email: string, name: string): Promise<{ id: string }> {
    const customer = await this.getStripe().customers.create({
      email,
      name,
      metadata: {
        platform: 'ai-agency-platform'
      }
    })

    logger.info('Stripe customer created', { customerId: customer.id, email })

    return { id: customer.id }
  }

  async createSubscription(
    customerId: string,
    priceId: string
  ): Promise<{ id: string; clientSecret?: string }> {
    const subscription = await this.getStripe().subscriptions.create({
      customer: customerId,
      items: [{ price: priceId }],
      payment_behavior: 'default_incomplete',
      payment_settings: { save_default_payment_method: 'on_subscription' },
      expand: ['latest_invoice.payment_intent']
    })

    const invoice = subscription.latest_invoice as Stripe.Invoice
    const paymentIntent = invoice?.payment_intent as Stripe.PaymentIntent

    logger.info('Stripe subscription created', { subscriptionId: subscription.id, customerId })

    return {
      id: subscription.id,
      clientSecret: paymentIntent?.client_secret || undefined
    }
  }

  async cancelSubscription(subscriptionId: string): Promise<void> {
    await this.getStripe().subscriptions.cancel(subscriptionId)
    logger.info('Stripe subscription cancelled', { subscriptionId })
  }

  async createCheckoutSession(
    customerId: string,
    priceId: string,
    successUrl: string,
    cancelUrl: string,
    metadata?: Record<string, string>
  ): Promise<{ url: string; sessionId: string }> {
    const session = await this.getStripe().checkout.sessions.create({
      customer: customerId,
      payment_method_types: ['card'],
      line_items: [{ price: priceId, quantity: 1 }],
      mode: 'subscription',
      success_url: successUrl,
      cancel_url: cancelUrl,
      metadata: metadata || {}
    })

    return { url: session.url || '', sessionId: session.id }
  }

  async createBillingPortalSession(
    customerId: string,
    returnUrl: string
  ): Promise<{ url: string }> {
    const session = await this.getStripe().billingPortal.sessions.create({
      customer: customerId,
      return_url: returnUrl
    })
    return { url: session.url }
  }

  constructWebhookEvent(payload: Buffer | string, sig: string): Stripe.Event {
    const webhookSecret = process.env.STRIPE_WEBHOOK_SECRET
    if (!webhookSecret) {
      throw new Error('STRIPE_WEBHOOK_SECRET environment variable is not set')
    }
    return this.getStripe().webhooks.constructEvent(payload, sig, webhookSecret)
  }

  getPlanFromPriceId(priceId: string): Plan {
    const starterPriceId = process.env.STRIPE_STARTER_PRICE_ID || 'price_starter'
    const growthPriceId = process.env.STRIPE_GROWTH_PRICE_ID || 'price_growth'
    const agencyPriceId = process.env.STRIPE_AGENCY_PRICE_ID || 'price_agency'

    if (priceId === starterPriceId) return Plan.STARTER
    if (priceId === growthPriceId) return Plan.GROWTH
    if (priceId === agencyPriceId) return Plan.AGENCY

    logger.warn('Unknown price ID, defaulting to STARTER', { priceId })
    return Plan.STARTER
  }

  async getSubscription(subscriptionId: string): Promise<Stripe.Subscription> {
    return this.getStripe().subscriptions.retrieve(subscriptionId)
  }
}

export const stripeService = new StripeService()
