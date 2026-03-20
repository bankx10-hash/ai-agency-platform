import { Router, Response } from 'express'
import { flexibleAuthMiddleware, AuthRequest } from '../middleware/auth'
import { crmService } from '../services/crm/crm.service'
import { logger } from '../utils/logger'

const serializeError = (error: unknown): string =>
  error instanceof Error ? error.message : String(error)

const router = Router({ mergeParams: true })

// All routes require auth and client ownership (accepts JWT or service secret)
router.use(flexibleAuthMiddleware)
router.use((req: AuthRequest, res: Response, next) => {
  if (req.clientId !== req.params.clientId) {
    res.status(403).json({ error: 'Forbidden' })
    return
  }
  next()
})

router.get('/contacts', async (req: AuthRequest, res: Response): Promise<void> => {
  try {
    const crm = await crmService.forClient(req.params.clientId)
    if (req.query.contactId) {
      const contact = await crm.getContact(req.query.contactId as string)
      res.json(contact)
    } else {
      const query = req.query.query as string | undefined
      const limit = req.query.limit ? parseInt(req.query.limit as string) : 50
      const result = await crm.getContacts(query, limit)
      res.json(result)
    }
  } catch (error) {
    const msg = serializeError(error)
    if (msg.includes('credentials found') || msg.includes('Unsupported CRM')) {
      res.json({ contacts: [], total: 0, message: 'CRM not connected' })
      return
    }
    logger.error('CRM get contacts error', { error: msg, clientId: req.params.clientId })
    res.status(500).json({ error: msg })
  }
})

router.post('/contacts', async (req: AuthRequest, res: Response): Promise<void> => {
  try {
    const crm = await crmService.forClient(req.params.clientId)
    const result = await crm.createContact(req.body)
    res.json(result)
  } catch (error) {
    const msg = serializeError(error)
    if (msg.includes('credentials found') || msg.includes('Unsupported CRM')) {
      res.json({ id: null, message: 'CRM not connected' })
      return
    }
    logger.error('CRM create contact error', { error: msg, clientId: req.params.clientId })
    res.status(500).json({ error: msg })
  }
})

router.put('/contacts/:contactId', async (req: AuthRequest, res: Response): Promise<void> => {
  try {
    const crm = await crmService.forClient(req.params.clientId)
    await crm.updateContact(req.params.contactId, req.body)
    res.json({ success: true })
  } catch (error) {
    const msg = serializeError(error)
    if (msg.includes('credentials found') || msg.includes('Unsupported CRM')) {
      res.json({ success: false, message: 'CRM not connected' })
      return
    }
    logger.error('CRM update contact error', { error: msg, clientId: req.params.clientId })
    res.status(500).json({ error: msg })
  }
})

router.post('/deals', async (req: AuthRequest, res: Response): Promise<void> => {
  try {
    const crm = await crmService.forClient(req.params.clientId)
    const result = await crm.createDeal(req.body)
    res.json(result)
  } catch (error) {
    const msg = serializeError(error)
    if (msg.includes('credentials found') || msg.includes('Unsupported CRM')) {
      res.json({ id: null, message: 'CRM not connected' })
      return
    }
    logger.error('CRM create deal error', { error: msg, clientId: req.params.clientId })
    res.status(500).json({ error: msg })
  }
})

router.put('/pipeline', async (req: AuthRequest, res: Response): Promise<void> => {
  try {
    const crm = await crmService.forClient(req.params.clientId)
    await crm.moveDealStage(req.body.dealId, req.body.stageId)
    res.json({ success: true })
  } catch (error) {
    const msg = serializeError(error)
    if (msg.includes('credentials found') || msg.includes('Unsupported CRM')) {
      res.json({ success: false, message: 'CRM not connected' })
      return
    }
    logger.error('CRM pipeline update error', { error: msg, clientId: req.params.clientId })
    res.status(500).json({ error: msg })
  }
})

router.post('/sms', async (req: AuthRequest, res: Response): Promise<void> => {
  try {
    const crm = await crmService.forClient(req.params.clientId)
    await crm.sendSMS(req.body.contactId, req.body.phone, req.body.message)
    res.json({ success: true })
  } catch (error) {
    const msg = serializeError(error)
    if (msg.includes('credentials found') || msg.includes('Unsupported CRM')) {
      res.json({ success: false, message: 'CRM not connected' })
      return
    }
    logger.error('CRM send SMS error', { error: msg, clientId: req.params.clientId })
    res.status(500).json({ error: msg })
  }
})

router.post('/email', async (req: AuthRequest, res: Response): Promise<void> => {
  try {
    const crm = await crmService.forClient(req.params.clientId)
    await crm.createNote(req.body.contactId, req.body.message)
    res.json({ success: true })
  } catch (error) {
    const msg = serializeError(error)
    if (msg.includes('credentials found') || msg.includes('Unsupported CRM')) {
      res.json({ success: false, message: 'CRM not connected' })
      return
    }
    logger.error('CRM send email error', { error: msg, clientId: req.params.clientId })
    res.status(500).json({ error: msg })
  }
})

router.post('/appointments', async (req: AuthRequest, res: Response): Promise<void> => {
  try {
    const crm = await crmService.forClient(req.params.clientId)
    const result = await crm.bookAppointment(req.body)
    res.json(result)
  } catch (error) {
    const msg = serializeError(error)
    if (msg.includes('credentials found') || msg.includes('Unsupported CRM')) {
      res.json({ id: null, message: 'CRM not connected' })
      return
    }
    logger.error('CRM book appointment error', { error: msg, clientId: req.params.clientId })
    res.status(500).json({ error: msg })
  }
})

export default router
