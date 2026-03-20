import axios, { AxiosInstance } from 'axios'
import { ICRMProvider, ContactData, DealData, AppointmentData, CRMContact } from '../crm.interface'
import { logger } from '../../../utils/logger'

export interface ZohoCredentials {
  accessToken: string
  orgId: string
  region?: string
}

export class ZohoProvider implements ICRMProvider {
  private client: AxiosInstance

  constructor(credentials: ZohoCredentials) {
    const baseURL = `https://www.zohoapis.${credentials.region || 'com'}/crm/v2`

    this.client = axios.create({
      baseURL,
      headers: {
        'Authorization': `Zoho-oauthtoken ${credentials.accessToken}`,
        'Content-Type': 'application/json'
      }
    })

    this.client.interceptors.response.use(
      (response) => response,
      (error) => {
        logger.error('Zoho API error', { status: error.response?.status, data: error.response?.data })
        throw error
      }
    )
  }

  async createContact(data: ContactData): Promise<{ id: string }> {
    const response = await this.client.post('/Contacts', {
      data: [{
        First_Name: data.firstName,
        Last_Name: data.lastName || 'Unknown',
        Email: data.email,
        Phone: data.phone,
        Lead_Source: data.source
      }]
    })
    const id = response.data.data?.[0]?.details?.id
    logger.info('Zoho contact created', { contactId: id })
    return { id }
  }

  async updateContact(contactId: string, data: Partial<ContactData>): Promise<void> {
    await this.client.put(`/Contacts/${contactId}`, {
      data: [{
        First_Name: data.firstName,
        Last_Name: data.lastName,
        Email: data.email,
        Phone: data.phone
      }]
    })
    logger.info('Zoho contact updated', { contactId })
  }

  async getContacts(_query?: string, limit = 50): Promise<{ contacts: CRMContact[], total: number }> {
    const response = await this.client.get(`/Contacts?per_page=${limit}`)
    const contacts: CRMContact[] = (response.data.data || []).map((c: Record<string, string>) => ({
      id: c['id'], firstName: c['First_Name'], lastName: c['Last_Name'], email: c['Email'], phone: c['Phone']
    }))
    return { contacts, total: contacts.length }
  }

  async getContact(contactId: string): Promise<CRMContact> {
    const response = await this.client.get(`/Contacts/${contactId}`)
    const c = response.data.data?.[0]
    return {
      id: c.id,
      firstName: c.First_Name,
      lastName: c.Last_Name,
      email: c.Email,
      phone: c.Phone
    }
  }

  async createDeal(data: DealData): Promise<{ id: string }> {
    const response = await this.client.post('/Deals', {
      data: [{
        Deal_Name: data.title,
        Contact_Name: { id: data.contactId },
        Stage: data.stageId || 'Qualification',
        Amount: data.value,
        Pipeline: data.pipelineId,
        Closing_Date: new Date(Date.now() + 30 * 24 * 60 * 60 * 1000).toISOString().split('T')[0]
      }]
    })
    const id = response.data.data?.[0]?.details?.id
    logger.info('Zoho deal created', { dealId: id })
    return { id }
  }

  async moveDealStage(dealId: string, stageId: string): Promise<void> {
    await this.client.put(`/Deals/${dealId}`, {
      data: [{ Stage: stageId }]
    })
    logger.info('Zoho deal stage updated', { dealId, stageId })
  }

  async bookAppointment(data: AppointmentData): Promise<{ id: string }> {
    const response = await this.client.post('/Events', {
      data: [{
        Event_Title: data.title || 'Appointment',
        Start_DateTime: data.startTime,
        End_DateTime: data.endTime,
        Description: data.notes,
        Who_Id: { id: data.contactId, type: 'Contacts' }
      }]
    })
    const id = response.data.data?.[0]?.details?.id
    logger.info('Zoho event created', { eventId: id })
    return { id }
  }

  async sendSMS(_contactId: string, phone: string, message: string): Promise<void> {
    // Zoho SMS requires Zoho Cliq or third-party integration
    logger.warn('Zoho SMS requires additional integration', { phone, messageLength: message.length })
  }

  async createNote(contactId: string, note: string): Promise<void> {
    await this.client.post('/Notes', {
      data: [{
        Note_Title: 'Agent Note',
        Note_Content: note,
        Parent_Id: { id: contactId, type: 'Contacts' }
      }]
    })
    logger.info('Zoho note created', { contactId })
  }
}
