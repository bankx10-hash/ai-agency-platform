import axios, { AxiosInstance } from 'axios'
import { ICRMProvider, ContactData, DealData, AppointmentData, CRMContact } from '../crm.interface'
import { logger } from '../../../utils/logger'

export interface SalesforceCredentials {
  accessToken: string
  instanceUrl: string
  refreshToken?: string
}

export class SalesforceProvider implements ICRMProvider {
  private client: AxiosInstance

  constructor(credentials: SalesforceCredentials) {
    this.client = axios.create({
      baseURL: `${credentials.instanceUrl}/services/data/v59.0`,
      headers: {
        'Authorization': `Bearer ${credentials.accessToken}`,
        'Content-Type': 'application/json'
      }
    })

    this.client.interceptors.response.use(
      (response) => response,
      (error) => {
        logger.error('Salesforce API error', { status: error.response?.status, data: error.response?.data })
        throw error
      }
    )
  }

  async createContact(data: ContactData): Promise<{ id: string }> {
    const response = await this.client.post('/sobjects/Contact', {
      FirstName: data.firstName,
      LastName: data.lastName || 'Unknown',
      Email: data.email,
      Phone: data.phone,
      LeadSource: data.source
    })
    logger.info('Salesforce contact created', { contactId: response.data.id })
    return { id: response.data.id }
  }

  async updateContact(contactId: string, data: Partial<ContactData>): Promise<void> {
    await this.client.patch(`/sobjects/Contact/${contactId}`, {
      FirstName: data.firstName,
      LastName: data.lastName,
      Email: data.email,
      Phone: data.phone
    })
    logger.info('Salesforce contact updated', { contactId })
  }

  async getContact(contactId: string): Promise<CRMContact> {
    const response = await this.client.get(`/sobjects/Contact/${contactId}`)
    return {
      id: response.data.Id,
      firstName: response.data.FirstName,
      lastName: response.data.LastName,
      email: response.data.Email,
      phone: response.data.Phone
    }
  }

  async createDeal(data: DealData): Promise<{ id: string }> {
    const response = await this.client.post('/sobjects/Opportunity', {
      Name: data.title,
      ContactId: data.contactId,
      StageName: data.stageId || 'Prospecting',
      Amount: data.value,
      CloseDate: new Date(Date.now() + 30 * 24 * 60 * 60 * 1000).toISOString().split('T')[0]
    })
    logger.info('Salesforce opportunity created', { dealId: response.data.id })
    return { id: response.data.id }
  }

  async moveDealStage(dealId: string, stageId: string): Promise<void> {
    await this.client.patch(`/sobjects/Opportunity/${dealId}`, {
      StageName: stageId
    })
    logger.info('Salesforce opportunity stage updated', { dealId, stageId })
  }

  async bookAppointment(data: AppointmentData): Promise<{ id: string }> {
    const response = await this.client.post('/sobjects/Event', {
      WhoId: data.contactId,
      Subject: data.title || 'Appointment',
      StartDateTime: data.startTime,
      EndDateTime: data.endTime,
      Description: data.notes
    })
    logger.info('Salesforce event created', { eventId: response.data.id })
    return { id: response.data.id }
  }

  async sendSMS(_contactId: string, phone: string, message: string): Promise<void> {
    // Salesforce SMS requires Marketing Cloud or third-party — log for now
    logger.warn('Salesforce SMS requires Marketing Cloud add-on', { phone, messageLength: message.length })
  }

  async createNote(contactId: string, note: string): Promise<void> {
    await this.client.post('/sobjects/Note', {
      ParentId: contactId,
      Title: 'Agent Note',
      Body: note
    })
    logger.info('Salesforce note created', { contactId })
  }
}
