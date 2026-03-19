import { Request, Response, NextFunction } from 'express'
import jwt from 'jsonwebtoken'
import crypto from 'crypto'
import { prisma } from '../lib/prisma'
import { logger } from '../utils/logger'

export interface AuthRequest extends Request {
  clientId?: string
  email?: string
}

interface JwtPayload {
  clientId: string
  email: string
  iat?: number
  exp?: number
}

export function authMiddleware(
  req: AuthRequest,
  res: Response,
  next: NextFunction
): void {
  const authHeader = req.headers.authorization

  if (!authHeader || !authHeader.startsWith('Bearer ')) {
    res.status(401).json({ error: 'Authorization header required' })
    return
  }

  const token = authHeader.substring(7)

  const jwtSecret = process.env['JWT_SECRET']
  if (!jwtSecret) {
    logger.error('JWT_SECRET not configured')
    res.status(500).json({ error: 'Server configuration error' })
    return
  }

  try {
    const payload = jwt.verify(token, jwtSecret) as JwtPayload
    req.clientId = payload.clientId
    req.email = payload.email
    next()
  } catch (error) {
    if (error instanceof jwt.TokenExpiredError) {
      res.status(401).json({ error: 'Token expired' })
    } else if (error instanceof jwt.JsonWebTokenError) {
      res.status(401).json({ error: 'Invalid token' })
    } else {
      logger.error('JWT verification error', { error })
      res.status(500).json({ error: 'Authentication error' })
    }
  }
}

export function generateToken(clientId: string, email: string, expiresIn: string = '7d'): string {
  const jwtSecret = process.env['JWT_SECRET']
  if (!jwtSecret) {
    throw new Error('JWT_SECRET not configured')
  }

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  return jwt.sign({ clientId, email }, jwtSecret, { expiresIn } as any)
}

export function generateServiceToken(clientId: string, email: string): string {
  return generateToken(clientId, email, '1y')
}

export function generateServiceSecret(): string {
  return crypto.randomBytes(32).toString('hex')
}

/**
 * Accepts either a standard JWT (portal users) or a client service secret (N8N workflows).
 * For service secrets: the token is looked up against client.serviceSecret in the DB,
 * and req.params.clientId must match the owner — so the secret is scoped to one client.
 */
export async function flexibleAuthMiddleware(
  req: AuthRequest,
  res: Response,
  next: NextFunction
): Promise<void> {
  const authHeader = req.headers.authorization

  if (!authHeader || !authHeader.startsWith('Bearer ')) {
    res.status(401).json({ error: 'Authorization header required' })
    return
  }

  const token = authHeader.substring(7)
  const jwtSecret = process.env['JWT_SECRET']

  // Try JWT first
  if (jwtSecret) {
    try {
      const payload = jwt.verify(token, jwtSecret) as JwtPayload
      req.clientId = payload.clientId
      req.email = payload.email
      next()
      return
    } catch {
      // Not a valid JWT — fall through to service secret check
    }
  }

  // Try service secret: look up the client whose serviceSecret matches
  try {
    const clientId = req.params.clientId
    if (!clientId) {
      res.status(401).json({ error: 'Invalid token' })
      return
    }

    const client = await prisma.client.findUnique({
      where: { id: clientId },
      select: { id: true, email: true, serviceSecret: true }
    })

    if (!client || !client.serviceSecret || client.serviceSecret !== token) {
      res.status(401).json({ error: 'Invalid token' })
      return
    }

    req.clientId = client.id
    req.email = client.email
    next()
  } catch (error) {
    logger.error('Service secret auth error', { error })
    res.status(500).json({ error: 'Authentication error' })
  }
}
