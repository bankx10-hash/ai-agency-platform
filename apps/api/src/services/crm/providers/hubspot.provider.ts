import axios, { AxiosInstance } from 'axios'
import { ICRMProvider, ContactData, DealData, AppointmentData, CRMContact } from '../crm.interface'
import { logger } from '../../../utils/logger'

export interface HubSpotCredentials {
  accessToken: string
  portalId: string
}

export class HubSpotProvider implements ICRMProvider {
  private client: AxiosInstance

  constructor(credentials: HubSpotCredentials) {
    this.client = axios.create({
      baseURL: 'https://api.hubapi.com',
      headers: {
        'Authorization': `Bearer ${credentials.accessToken}`,
        'Content-Type': 'application/json'
      }
    })

    this.client.interceptors.response.use(
      (response) => response,
      (error) => {
        logger.error('HubSpot API error', { status: error.response?.status, data: JSON.stringify(error.response?.data) })
        throw new Error(`HubSpot ${error.response?.status}: ${JSON.stringify(error.response?.data)}`)
      }
    )
  }

  async createContact(data: ContactData): Promise<{ id: string }> {
    const response = await this.client.post('/crm/v3/objects/contacts', {
      properties: {
        firstname: data.firstName,
        lastname: data.lastName,
        email: data.email,
        phone: data.phone,
        hs_lead_status: data.source
      }
    })
    logger.info('HubSpot contact created', { contactId: response.data.id })
    return { id: response.data.id }
  }

  async updateContact(contactId: string, data: Partial<ContactData> & { score?: number; summary?: string; tags?: string[] }): Promise<void> {
    const properties: Record<string, string> = {}
    if (data.firstName !== undefined) properties.firstname = data.firstName
    if (data.lastName !== undefined) properties.lastname = data.lastName
    if (data.email !== undefined) properties.email = data.email
    if (data.phone !== undefined) properties.phone = data.phone
    if (data.score !== undefined) properties.hs_lead_status = data.score >= 70 ? 'IN_PROGRESS' : 'OPEN'
    if (data.summary !== undefined) properties.jobtitle = data.summary.slice(0, 100)
    if (Object.keys(properties).length === 0) {
      logger.info('HubSpot updateContact: no valid fields to update', { contactId })
      return
    }
    await this.client.patch(`/crm/v3/objects/contacts/${contactId}`, { properties })
    logger.info('HubSpot contact updated', { contactId })
  }

  async getContacts(query?: string, limit = 50): Promise<{ contacts: CRMContact[], total: number }> {
    const params: Record<string, unknown> = {
      limit,
      properties: 'firstname,lastname,email,phone'
    }
    if (query) params['filterGroups'] = query
    const response = await this.client.get('/crm/v3/objects/contacts', { params })
    const contacts: CRMContact[] = (response.data.results || []).map((r: { id: string, properties: Record<string, string> }) => ({
      id: r.id,
      firstName: r.properties.firstname,
      lastName: r.properties.lastname,
      email: r.properties.email,
      phone: r.properties.phone
    }))
    return { contacts, total: response.data.total ?? contacts.length }
  }

  async getContact(contactId: string): Promise<CRMContact> {
    const response = await this.client.get(`/crm/v3/objects/contacts/${contactId}`, {
      params: { properties: 'firstname,lastname,email,phone' }
    })
    const p = response.data.properties
    return {
      id: response.data.id,
      firstName: p.firstname,
      lastName: p.lastname,
      email: p.email,
      phone: p.phone
    }
  }

  async createDeal(data: DealData): Promise<{ id: string }> {
    const response = await this.client.post('/crm/v3/objects/deals', {
      properties: {
        dealname: data.title,
        pipeline: data.pipelineId,
        dealstage: data.stageId,
        amount: data.value
      },
      associations: [{
        to: { id: data.contactId },
        types: [{ associationCategory: 'HUBSPOT_DEFINED', associationTypeId: 3 }]
      }]
    })
    logger.info('HubSpot deal created', { dealId: response.data.id })
    return { id: response.data.id }
  }

  async moveDealStage(dealId: string, stageId: string): Promise<void> {
    await this.client.patch(`/crm/v3/objects/deals/${dealId}`, {
      properties: { dealstage: stageId }
    })
    logger.info('HubSpot deal moved to stage', { dealId, stageId })
  }

  async bookAppointment(data: AppointmentData): Promise<{ id: string }> {
    const response = await this.client.post('/crm/v3/objects/meetings', {
      properties: {
        hs_meeting_title: data.title || 'Appointment',
        hs_meeting_start_time: new Date(data.startTime).getTime(),
        hs_meeting_end_time: new Date(data.endTime).getTime(),
        hs_meeting_body: data.notes
      },
      associations: [{
        to: { id: data.contactId },
        types: [{ associationCategory: 'HUBSPOT_DEFINED', associationTypeId: 200 }]
      }]
    })
    logger.info('HubSpot meeting booked', { meetingId: response.data.id })
    return { id: response.data.id }
  }

  async sendSMS(_contactId: string, phone: string, message: string): Promise<void> {
    // HubSpot does not have native SMS — log for now, handled via Twilio in voice agents
    logger.warn('HubSpot SMS not natively supported', { phone, messageLength: message.length })
  }

  async createNote(contactId: string, note: string): Promise<void> {
    await this.client.post('/crm/v3/objects/notes', {
      properties: {
        hs_note_body: note,
        hs_timestamp: Date.now()
      },
      associations: [{
        to: { id: contactId },
        types: [{ associationCategory: 'HUBSPOT_DEFINED', associationTypeId: 202 }]
      }]
    })
    logger.info('HubSpot note created', { contactId })
  }
}
