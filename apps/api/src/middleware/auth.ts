import { Request, Response, NextFunction } from 'express'
import jwt from 'jsonwebtoken'
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

  const jwtSecret = process.env.JWT_SECRET
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

export function generateToken(clientId: string, email: string): string {
  const jwtSecret = process.env.JWT_SECRET
  if (!jwtSecret) {
    throw new Error('JWT_SECRET not configured')
  }

  return jwt.sign(
    { clientId, email },
    jwtSecret,
    { expiresIn: '7d' }
  )
}
