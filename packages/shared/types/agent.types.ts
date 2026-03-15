export enum AgentType {
  LEAD_GENERATION = 'LEAD_GENERATION',
  LINKEDIN_OUTREACH = 'LINKEDIN_OUTREACH',
  SOCIAL_MEDIA = 'SOCIAL_MEDIA',
  ADVERTISING = 'ADVERTISING',
  APPOINTMENT_SETTER = 'APPOINTMENT_SETTER',
  VOICE_INBOUND = 'VOICE_INBOUND',
  VOICE_OUTBOUND = 'VOICE_OUTBOUND',
  VOICE_CLOSER = 'VOICE_CLOSER',
  CLIENT_SERVICES = 'CLIENT_SERVICES'
}

export enum AgentStatus {
  INACTIVE = 'INACTIVE',
  ACTIVE = 'ACTIVE',
  PAUSED = 'PAUSED',
  ERROR = 'ERROR'
}

export interface AgentDeployment {
  id: string
  clientId: string
  agentType: AgentType
  status: AgentStatus
  n8nWorkflowId?: string
  blandAgentId?: string
  config: AgentConfig
  metrics?: AgentMetrics
  createdAt: Date
  updatedAt: Date
}

export type AgentConfig =
  | LeadGenerationConfig
  | LinkedInConfig
  | SocialMediaConfig
  | AdvertisingConfig
  | AppointmentSetterConfig
  | VoiceInboundConfig
  | VoiceOutboundConfig
  | VoiceCloserConfig
  | ClientServicesConfig

export interface LeadGenerationConfig {
  icp_description: string
  lead_sources: string[]
  scoring_prompt: string
  pipeline_id: string
  high_score_threshold: number
}

export interface LinkedInConfig {
  search_url: string
  connection_message_template: string
  followup_sequences: FollowUpSequence[]
  daily_limit: number
  linkedin_cookie: string
}

export interface FollowUpSequence {
  day: number
  message: string
}

export interface SocialMediaConfig {
  business_description: string
  tone: string
  posting_frequency: string
  platforms: string[]
  content_pillars: string[]
  buffer_token: string
}

export interface AdvertisingConfig {
  meta_ad_account_id: string
  google_ads_customer_id: string
  target_roas: number
  daily_budget_limit: number
  alert_email: string
}

export interface AppointmentSetterConfig {
  followup_sequence: FollowUpSequence[]
  calendar_id: string
  objection_handlers: Record<string, string>
  booking_link: string
  sms_number: string
}

export interface VoiceInboundConfig {
  greeting_script: string
  qualification_questions: string[]
  faq_knowledge_base: string
  escalation_number: string
  voice_id: string
  calendar_id: string
  phone_number?: string
  bland_agent_id?: string
}

export interface VoiceOutboundConfig {
  call_script: string
  objection_handlers: Record<string, string>
  max_daily_calls: number
  call_window_hours: string
  retry_attempts: number
  ghl_pipeline_stage: string
  bland_agent_id?: string
}

export interface VoiceCloserConfig {
  closing_script_template: string
  offer_details: string
  payment_link: string
  contract_link: string
  objection_scripts: Record<string, string>
  commission_tracking: boolean
  bland_agent_id?: string
}

export interface ClientServicesConfig {
  welcome_sequence: FollowUpSequence[]
  onboarding_checklist: string[]
  nps_schedule: string
  health_score_weights: Record<string, number>
  upsell_triggers: string[]
}

export interface AgentMetrics {
  totalLeads?: number
  leadsToday?: number
  callsMade?: number
  callsAnswered?: number
  appointmentsBooked?: number
  appointmentsToday?: number
  emailsSent?: number
  connectionsSent?: number
  postsPublished?: number
  closingRate?: number
  lastRunAt?: string
  errors?: number
}

export const PLANS = {
  STARTER: {
    price: 97,
    stripePriceId: process.env.STRIPE_STARTER_PRICE_ID || 'price_starter',
    agents: [
      AgentType.LEAD_GENERATION,
      AgentType.APPOINTMENT_SETTER,
      AgentType.VOICE_INBOUND
    ]
  },
  GROWTH: {
    price: 297,
    stripePriceId: process.env.STRIPE_GROWTH_PRICE_ID || 'price_growth',
    agents: [
      AgentType.LEAD_GENERATION,
      AgentType.LINKEDIN_OUTREACH,
      AgentType.SOCIAL_MEDIA,
      AgentType.APPOINTMENT_SETTER,
      AgentType.VOICE_INBOUND,
      AgentType.VOICE_OUTBOUND
    ]
  },
  AGENCY: {
    price: 697,
    stripePriceId: process.env.STRIPE_AGENCY_PRICE_ID || 'price_agency',
    agents: [
      AgentType.LEAD_GENERATION,
      AgentType.LINKEDIN_OUTREACH,
      AgentType.SOCIAL_MEDIA,
      AgentType.ADVERTISING,
      AgentType.APPOINTMENT_SETTER,
      AgentType.VOICE_INBOUND,
      AgentType.VOICE_OUTBOUND,
      AgentType.VOICE_CLOSER,
      AgentType.CLIENT_SERVICES
    ]
  }
} as const
