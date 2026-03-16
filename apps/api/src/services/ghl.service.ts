import axios, { AxiosInstance } from 'axios'
import { logger } from '../utils/logger'

interface GHLContactData {
  firstName?: string
  lastName?: string
  email?: string
  phone?: string
  name?: string
  tags?: string[]
  customFields?: Record<string, string>
  source?: string
}

interface GHLSubAccountData {
  name: string
  email: string
  phone?: string
  address?: string
  city?: string
  state?: string
  country?: string
  postalCode?: string
  website?: string
  timezone?: string
}

interface GHLAppointmentData {
  calendarId: string
  contactId: string
  startTime: string
  endTime: string
  title?: string
  notes?: string
}

interface GHLEmailData {
  subject: string
  body: string
  html?: string
}

interface DateRange {
  startDate: string
  endDate: string
}

export class GHLService {
  private client: AxiosInstance
  private agencyId: string

  constructor() {
    const apiKey = process.env['GHL_API_KEY']
    const baseURL = process.env['GHL_BASE_URL'] || 'https://services.leadconnectorhq.com'
    this.agencyId = process.env['GHL_AGENCY_ID'] || ''

    if (!apiKey) {
      logger.warn('GHL_API_KEY not set — GoHighLevel features will be unavailable')
    }

    this.client = axios.create({
      baseURL,
      headers: {
        'Authorization': `Bearer ${apiKey || 'not-configured'}`,
        'Version': '2021-07-28',
        'Content-Type': 'application/json'
      }
    })

    this.client.interceptors.response.use(
      (response) => response,
      (error) => {
        logger.error('GHL API error', {
          status: error.response?.status,
          data: error.response?.data,
          url: error.config?.url
        })
        throw error
      }
    )
  }

  async createSubAccount(clientData: GHLSubAccountData): Promise<{ id: string; locationId: string }> {
    const response = await this.client.post('/locations', {
      name: clientData.name,
      email: clientData.email,
      phone: clientData.phone,
      address: clientData.address || '',
      city: clientData.city || '',
      state: clientData.state || '',
      country: clientData.country || 'US',
      postalCode: clientData.postalCode || '',
      website: clientData.website || '',
      timezone: clientData.timezone || 'America/New_York',
      companyId: this.agencyId,
      prospectInfo: {
        email: clientData.email,
        name: clientData.name
      }
    })

    logger.info('GHL sub-account created', { locationId: response.data.location?.id })

    return {
      id: response.data.location?.id,
      locationId: response.data.location?.id
    }
  }

  async createContact(locationId: string, contactData: GHLContactData): Promise<{ id: string }> {
    const response = await this.client.post('/contacts', {
      locationId,
      ...contactData
    })

    logger.info('GHL contact created', { contactId: response.data.contact?.id, locationId })

    return { id: response.data.contact?.id }
  }

  async updateContact(locationId: string, contactId: string, data: Partial<GHLContactData>): Promise<void> {
    await this.client.put(`/contacts/${contactId}`, {
      locationId,
      ...data
    })

    logger.info('GHL contact updated', { contactId, locationId })
  }

  async addContactToWorkflow(locationId: string, contactId: string, workflowId: string): Promise<void> {
    await this.client.post(`/contacts/${contactId}/workflow/${workflowId}`, {
      locationId
    })

    logger.info('Contact added to workflow', { contactId, workflowId, locationId })
  }

  async createAppointment(locationId: string, appointmentData: GHLAppointmentData): Promise<{ id: string }> {
    const response = await this.client.post('/appointments', {
      locationId,
      ...appointmentData
    })

    logger.info('GHL appointment created', { appointmentId: response.data.appointment?.id })

    return { id: response.data.appointment?.id }
  }

  async getPipelineStages(locationId: string, pipelineId: string): Promise<Array<{ id: string; name: string }>> {
    const response = await this.client.get(`/opportunities/pipelines/${pipelineId}/stages`, {
      params: { locationId }
    })

    return response.data.stages || []
  }

  async moveContactToPipelineStage(
    locationId: string,
    contactId: string,
    stageId: string
  ): Promise<void> {
    await this.client.put(`/opportunities/contacts/${contactId}/stage/${stageId}`, {
      locationId
    })

    logger.info('Contact moved to pipeline stage', { contactId, stageId, locationId })
  }

  async sendSMS(locationId: string, contactId: string, message: string): Promise<void> {
    await this.client.post(`/conversations/messages`, {
      locationId,
      contactId,
      type: 'SMS',
      message
    })

    logger.info('SMS sent', { contactId, locationId })
  }

  async sendEmail(locationId: string, contactId: string, emailData: GHLEmailData): Promise<void> {
    await this.client.post(`/conversations/messages`, {
      locationId,
      contactId,
      type: 'Email',
      subject: emailData.subject,
      body: emailData.html || emailData.body
    })

    logger.info('Email sent via GHL', { contactId, locationId })
  }

  async createNote(locationId: string, contactId: string, note: string): Promise<void> {
    await this.client.post(`/contacts/${contactId}/notes`, {
      locationId,
      body: note
    })

    logger.info('Note created', { contactId, locationId })
  }

  async getCalendarSlots(
    locationId: string,
    calendarId: string,
    dateRange: DateRange
  ): Promise<Array<{ startTime: string; endTime: string }>> {
    const response = await this.client.get(`/calendars/${calendarId}/free-slots`, {
      params: {
        locationId,
        startDate: dateRange.startDate,
        endDate: dateRange.endDate
      }
    })

    return response.data.slots || []
  }

  async createOpportunity(
    locationId: string,
    contactId: string,
    pipelineId: string,
    stageId: string,
    title: string
  ): Promise<{ id: string }> {
    const response = await this.client.post('/opportunities', {
      locationId,
      contactId,
      pipelineId,
      stageId,
      title,
      status: 'open'
    })

    return { id: response.data.opportunity?.id }
  }
}

export const ghlService = new GHLService()
