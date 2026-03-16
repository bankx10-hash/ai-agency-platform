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
        logger.error('HubSpot API error', { status: error.response?.status, data: error.response?.data })
        throw error
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

  async updateContact(contactId: string, data: Partial<ContactData>): Promise<void> {
    await this.client.patch(`/crm/v3/objects/contacts/${contactId}`, {
      properties: {
        firstname: data.firstName,
        lastname: data.lastName,
        email: data.email,
        phone: data.phone
      }
    })
    logger.info('HubSpot contact updated', { contactId })
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
