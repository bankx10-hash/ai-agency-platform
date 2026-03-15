export enum Plan {
  STARTER = 'STARTER',
  GROWTH = 'GROWTH',
  AGENCY = 'AGENCY'
}

export enum ClientStatus {
  PENDING = 'PENDING',
  ACTIVE = 'ACTIVE',
  PAUSED = 'PAUSED',
  CANCELLED = 'CANCELLED'
}

export enum OnboardingStatus {
  IN_PROGRESS = 'IN_PROGRESS',
  COMPLETED = 'COMPLETED',
  FAILED = 'FAILED'
}

export interface Client {
  id: string
  businessName: string
  email: string
  phone?: string
  stripeCustomerId: string
  stripeSubId?: string
  plan: Plan
  status: ClientStatus
  ghlSubAccountId?: string
  ghlLocationId?: string
  createdAt: Date
  updatedAt: Date
}

export interface Onboarding {
  id: string
  clientId: string
  step: number
  status: OnboardingStatus
  completedAt?: Date
  data: OnboardingData
}

export interface OnboardingData {
  ghlCreated?: boolean
  emailConnected?: boolean
  crmConnected?: boolean
  linkedinConnected?: boolean
  agentsDeployed?: boolean
  voiceAssigned?: boolean
  welcomeEmailSent?: boolean
  businessDescription?: string
  icpDescription?: string
  crmType?: string
}

export interface ClientCredential {
  id: string
  clientId: string
  service: string
  credentials: string
  createdAt: Date
}

export interface CreateClientInput {
  businessName: string
  email: string
  password: string
  phone?: string
}

export interface UpdateClientInput {
  businessName?: string
  phone?: string
  ghlSubAccountId?: string
  ghlLocationId?: string
  stripeSubId?: string
}
