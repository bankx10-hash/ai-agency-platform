export interface ContactData {
  firstName?: string
  lastName?: string
  email?: string
  phone?: string
  tags?: string[]
  source?: string
  customFields?: Record<string, string>
}

export interface DealData {
  contactId: string
  title: string
  pipelineId?: string
  stageId?: string
  value?: number
}

export interface AppointmentData {
  contactId: string
  calendarId?: string
  startTime: string
  endTime: string
  title?: string
  notes?: string
}

export interface CRMContact {
  id: string
  firstName?: string
  lastName?: string
  email?: string
  phone?: string
}

export interface ICRMProvider {
  createContact(data: ContactData): Promise<{ id: string }>
  updateContact(contactId: string, data: Partial<ContactData>): Promise<void>
  getContact(contactId: string): Promise<CRMContact>
  createDeal(data: DealData): Promise<{ id: string }>
  moveDealStage(dealId: string, stageId: string): Promise<void>
  bookAppointment(data: AppointmentData): Promise<{ id: string }>
  sendSMS(contactId: string, phone: string, message: string): Promise<void>
  createNote(contactId: string, note: string): Promise<void>
}
