import { AgentType } from '../../../packages/shared/types/agent.types'
import { BaseAgent } from './base.agent'
import { LeadGenerationAgent } from './lead-generation.agent'
import { LinkedInAgent } from './linkedin.agent'
import { SocialMediaAgent } from './social-media.agent'
import { AdvertisingAgent } from './advertising.agent'
import { AppointmentSetterAgent } from './appointment-setter.agent'
import { VoiceInboundAgent } from './voice-inbound.agent'
import { VoiceOutboundAgent } from './voice-outbound.agent'
import { VoiceCloserAgent } from './voice-closer.agent'
import { ClientServicesAgent } from './client-services.agent'

export {
  BaseAgent,
  LeadGenerationAgent,
  LinkedInAgent,
  SocialMediaAgent,
  AdvertisingAgent,
  AppointmentSetterAgent,
  VoiceInboundAgent,
  VoiceOutboundAgent,
  VoiceCloserAgent,
  ClientServicesAgent
}

export type AgentConstructor = new () => BaseAgent

export const AGENT_REGISTRY: Record<AgentType, AgentConstructor> = {
  [AgentType.LEAD_GENERATION]: LeadGenerationAgent,
  [AgentType.LINKEDIN_OUTREACH]: LinkedInAgent,
  [AgentType.SOCIAL_MEDIA]: SocialMediaAgent,
  [AgentType.ADVERTISING]: AdvertisingAgent,
  [AgentType.APPOINTMENT_SETTER]: AppointmentSetterAgent,
  [AgentType.VOICE_INBOUND]: VoiceInboundAgent,
  [AgentType.VOICE_OUTBOUND]: VoiceOutboundAgent,
  [AgentType.VOICE_CLOSER]: VoiceCloserAgent,
  [AgentType.CLIENT_SERVICES]: ClientServicesAgent
}

export function createAgent(agentType: AgentType): BaseAgent {
  const AgentClass = AGENT_REGISTRY[agentType]
  if (!AgentClass) {
    throw new Error(`Unknown agent type: ${agentType}`)
  }
  return new AgentClass()
}
