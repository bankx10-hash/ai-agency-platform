import axios, { AxiosInstance } from 'axios'
import { ICRMProvider, ContactData, DealData, AppointmentData, CRMContact } from '../crm.interface'
import { logger } from '../../../utils/logger'
import { prisma } from '../../../lib/prisma'

export interface GHLCredentials {
  locationId: string
  apiKey?: string
}

// Cache the DB token for 60s to avoid a DB hit on every GHL call
let cachedToken: string | null = null
let cacheExpiry = 0

async function resolveGHLToken(explicitKey?: string): Promise<string> {
  if (explicitKey) return explicitKey

  const now = Date.now()
  if (cachedToken && now < cacheExpiry) return cachedToken

  try {
    const config = await prisma.systemConfig.findUnique({ where: { key: 'GHL_API_KEY' } })
    if (config?.value) {
      cachedToken = config.value
      cacheExpiry = now + 60_000
      return config.value
    }
  } catch {
    // DB unavailable — fall through to env var
  }

  return process.env['GHL_API_KEY'] || 'not-configured'
}

export class GHLProvider implements ICRMProvider {
  private client: AxiosInstance
  private locationId: string

  constructor(credentials: GHLCredentials) {
    this.locationId = credentials.locationId

    // Token resolved at construction time; for long-lived instances the
    // interceptor below re-resolves it on every 401 (token rotation).
    const initialToken = credentials.apiKey || process.env['GHL_API_KEY'] || 'not-configured'

    this.client = axios.create({
      baseURL: process.env['GHL_BASE_URL'] || 'https://services.leadconnectorhq.com',
      headers: {
        'Authorization': `Bearer ${initialToken}`,
        'Version': '2021-07-28',
        'Content-Type': 'application/json'
      }
    })

    // On 401, fetch the latest token from DB and retry once
    this.client.interceptors.response.use(
      (response) => response,
      async (error) => {
        if (error.response?.status === 401 && !error.config?._retried) {
          cachedToken = null // invalidate cache
          const freshToken = await resolveGHLToken()
          error.config._retried = true
          error.config.headers['Authorization'] = `Bearer ${freshToken}`
          return this.client.request(error.config)
        }
        logger.error('GHL API error', { status: error.response?.status, data: error.response?.data })
        throw error
      }
    )
  }

  async createContact(data: ContactData): Promise<{ id: string }> {
    const response = await this.client.post('/contacts', {
      locationId: this.locationId,
      firstName: data.firstName,
      lastName: data.lastName,
      email: data.email,
      phone: data.phone,
      tags: data.tags,
      source: data.source,
      customFields: data.customFields
    })
    logger.info('GHL contact created', { contactId: response.data.contact?.id })
    return { id: response.data.contact?.id }
  }

  async updateContact(contactId: string, data: Partial<ContactData>): Promise<void> {
    await this.client.put(`/contacts/${contactId}`, { locationId: this.locationId, ...data })
    logger.info('GHL contact updated', { contactId })
  }

  async getContact(contactId: string): Promise<CRMContact> {
    const response = await this.client.get(`/contacts/${contactId}`)
    const c = response.data.contact
    return {
      id: c.id,
      firstName: c.firstName,
      lastName: c.lastName,
      email: c.email,
      phone: c.phone
    }
  }

  async createDeal(data: DealData): Promise<{ id: string }> {
    const response = await this.client.post('/opportunities', {
      locationId: this.locationId,
      contactId: data.contactId,
      pipelineId: data.pipelineId,
      stageId: data.stageId,
      title: data.title,
      monetaryValue: data.value,
      status: 'open'
    })
    return { id: response.data.opportunity?.id }
  }

  async moveDealStage(dealId: string, stageId: string): Promise<void> {
    await this.client.put(`/opportunities/contacts/${dealId}/stage/${stageId}`, {
      locationId: this.locationId
    })
    logger.info('GHL deal moved to stage', { dealId, stageId })
  }

  async bookAppointment(data: AppointmentData): Promise<{ id: string }> {
    const response = await this.client.post('/appointments', {
      locationId: this.locationId,
      calendarId: data.calendarId,
      contactId: data.contactId,
      startTime: data.startTime,
      endTime: data.endTime,
      title: data.title,
      notes: data.notes
    })
    return { id: response.data.appointment?.id }
  }

  async sendSMS(contactId: string, _phone: string, message: string): Promise<void> {
    await this.client.post('/conversations/messages', {
      locationId: this.locationId,
      contactId,
      type: 'SMS',
      message
    })
    logger.info('GHL SMS sent', { contactId })
  }

  async createNote(contactId: string, note: string): Promise<void> {
    await this.client.post(`/contacts/${contactId}/notes`, {
      locationId: this.locationId,
      body: note
    })
    logger.info('GHL note created', { contactId })
  }

  async createSubAccount(data: { name: string; email: string; phone?: string }): Promise<{ locationId: string }> {
    const agencyId = process.env['GHL_AGENCY_ID']
    const country = process.env['GHL_DEFAULT_COUNTRY'] || 'AU'
    const timezone = process.env['GHL_DEFAULT_TIMEZONE'] || 'Australia/Sydney'
    const response = await this.client.post('/locations', {
      name: data.name,
      email: data.email,
      phone: data.phone,
      country,
      timezone,
      companyId: agencyId,
      prospectInfo: { email: data.email, name: data.name }
    })
    logger.info('GHL sub-account created', { locationId: response.data.location?.id })
    return { locationId: response.data.location?.id }
  }
}
