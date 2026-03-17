import { Router, Request, Response } from 'express'
import { prisma } from '../lib/prisma'
import bcrypt from 'bcryptjs'
import { stripeService } from '../services/stripe.service'
import { generateToken } from '../middleware/auth'
import { authRateLimit } from '../middleware/rateLimit'
import { logger } from '../utils/logger'
import { z } from 'zod'

const router = Router()

const registerSchema = z.object({
  businessName: z.string().min(1, 'Business name required'),
  email: z.string().email('Invalid email'),
  password: z.string().min(8, 'Password must be at least 8 characters'),
  phone: z.string().optional()
})

const loginSchema = z.object({
  email: z.string().email(),
  password: z.string().min(1)
})

router.post('/register', authRateLimit, async (req: Request, res: Response): Promise<void> => {
  try {
    const parsed = registerSchema.safeParse(req.body)
    if (!parsed.success) {
      res.status(400).json({ error: 'Invalid request', details: parsed.error.errors })
      return
    }

    const { businessName, email, password, phone } = parsed.data

    const existing = await prisma.client.findUnique({ where: { email } })
    if (existing) {
      res.status(409).json({ error: 'An account with this email already exists' })
      return
    }

    const passwordHash = await bcrypt.hash(password, 12)

    let stripeCustomerId: string
    try {
      const stripeCustomer = await stripeService.createCustomer(email, businessName)
      stripeCustomerId = stripeCustomer.id
    } catch (stripeError) {
      logger.error('Failed to create Stripe customer', { email, stripeError })
      stripeCustomerId = `manual_${Date.now()}`
    }

    const client = await prisma.client.create({
      data: {
        businessName,
        email,
        phone,
        passwordHash,
        stripeCustomerId,
        status: 'PENDING',
        plan: 'STARTER'
      }
    })

    const token = generateToken(client.id, client.email)

    logger.info('New client registered', { clientId: client.id, email, businessName })

    res.status(201).json({
      message: 'Account created successfully',
      client: {
        id: client.id,
        email: client.email,
        businessName: client.businessName,
        plan: client.plan,
        status: client.status,
        stripeCustomerId: client.stripeCustomerId
      },
      token,
      clientId: client.id
    })
  } catch (error) {
    logger.error('Registration error', { error })
    res.status(500).json({ error: 'Registration failed. Please try again.' })
  }
})

router.post('/login', authRateLimit, async (req: Request, res: Response): Promise<void> => {
  try {
    const parsed = loginSchema.safeParse(req.body)
    if (!parsed.success) {
      res.status(400).json({ error: 'Invalid request' })
      return
    }

    const { email, password } = parsed.data

    const client = await prisma.client.findUnique({ where: { email } })

    if (!client) {
      res.status(401).json({ error: 'Invalid email or password' })
      return
    }

    const passwordMatch = await bcrypt.compare(password, client.passwordHash)
    if (!passwordMatch) {
      res.status(401).json({ error: 'Invalid email or password' })
      return
    }

    const token = generateToken(client.id, client.email)

    logger.info('Client logged in', { clientId: client.id, email })

    res.json({
      message: 'Login successful',
      client: {
        id: client.id,
        email: client.email,
        businessName: client.businessName,
        plan: client.plan,
        status: client.status
      },
      token,
      clientId: client.id
    })
  } catch (error) {
    logger.error('Login error', { error })
    res.status(500).json({ error: 'Login failed. Please try again.' })
  }
})

export default router
