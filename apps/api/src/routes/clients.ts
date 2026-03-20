import { Router, Response } from 'express'
import { prisma } from '../lib/prisma'
import { authMiddleware, flexibleAuthMiddleware, AuthRequest } from '../middleware/auth'
import { logger } from '../utils/logger'
import { z } from 'zod'
import { decryptJSON } from '../utils/encrypt'
import { emailService } from '../services/email.service'

const router = Router()

const updateClientSchema = z.object({
  businessName: z.string().min(1).optional(),
  phone: z.string().optional(),
  ghlSubAccountId: z.string().optional(),
  ghlLocationId: z.string().optional(),
  businessDescription: z.string().optional(),
  icpDescription: z.string().optional()
})

router.get('/:id', authMiddleware, async (req: AuthRequest, res: Response): Promise<void> => {
  try {
    const { id } = req.params

    if (req.clientId !== id) {
      res.status(403).json({ error: 'Forbidden' })
      return
    }

    const clientRaw = await prisma.client.findUnique({
      where: { id },
      include: {
        agents: {
          orderBy: { createdAt: 'desc' }
        },
        onboarding: true
      }
    })

    if (!clientRaw) {
      res.status(404).json({ error: 'Client not found' })
      return
    }

    const { passwordHash: _ph, ...client } = clientRaw
    res.json({ client })
  } catch (error) {
    logger.error('Error fetching client', { error, clientId: req.params.id })
    res.status(500).json({ error: 'Internal server error' })
  }
})

router.patch('/:id', authMiddleware, async (req: AuthRequest, res: Response): Promise<void> => {
  try {
    const { id } = req.params

    if (req.clientId !== id) {
      res.status(403).json({ error: 'Forbidden' })
      return
    }

    const parsed = updateClientSchema.safeParse(req.body)
    if (!parsed.success) {
      res.status(400).json({ error: 'Invalid request body', details: parsed.error.errors })
      return
    }

    const clientRaw = await prisma.client.update({
      where: { id },
      data: parsed.data
    })

    const { passwordHash: _ph2, ...client } = clientRaw
    res.json({ client })
  } catch (error) {
    logger.error('Error updating client', { error, clientId: req.params.id })
    res.status(500).json({ error: 'Internal server error' })
  }
})

router.get('/:id/agents', authMiddleware, async (req: AuthRequest, res: Response): Promise<void> => {
  try {
    const { id } = req.params

    if (req.clientId !== id) {
      res.status(403).json({ error: 'Forbidden' })
      return
    }

    const agents = await prisma.agentDeployment.findMany({
      where: { clientId: id },
      orderBy: { createdAt: 'desc' }
    })

    res.json({ agents })
  } catch (error) {
    logger.error('Error fetching client agents', { error, clientId: req.params.id })
    res.status(500).json({ error: 'Internal server error' })
  }
})

// Called by N8N after each social media post — logs to Google Sheet
router.post('/:clientId/social/log-post', flexibleAuthMiddleware, async (req: AuthRequest, res: Response): Promise<void> => {
  const { clientId } = req.params
  const { platform, content, imageUrl, imagePrompt, status = 'published' } = req.body

  try {
    const sheetsCred = await prisma.clientCredential.findUnique({ where: { id: `google-sheets-${clientId}` } })
    const gmailCred = await prisma.clientCredential.findUnique({ where: { id: `gmail-${clientId}` } })

    if (sheetsCred && gmailCred) {
      const { spreadsheetId } = decryptJSON<{ spreadsheetId: string }>(sheetsCred.credentials)
      const { accessToken, refreshToken } = decryptJSON<{ accessToken: string; refreshToken: string }>(gmailCred.credentials)

      await emailService.appendSheetRow(accessToken, refreshToken, spreadsheetId, [
        new Date().toISOString(),
        platform || '',
        content || '',
        imageUrl || '',
        imagePrompt || '',
        status
      ])

      logger.info('Social post logged to Google Sheet', { clientId, platform, spreadsheetId })
    } else {
      logger.warn('No Google Sheet configured for client', { clientId })
    }

    res.json({ success: true })
  } catch (error) {
    logger.error('Error logging social post to sheet', { error, clientId })
    res.status(500).json({ error: 'Internal server error' })
  }
})

export default router
