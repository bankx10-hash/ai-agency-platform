import axios, { AxiosInstance } from 'axios'
import { logger } from '../utils/logger'

interface InboundAgentConfig {
  prompt: string
  voice: string
  phoneNumber?: string
  firstSentence?: string
  maxDuration?: number
  interruptionThreshold?: number
  backgroundTrack?: string
  transferNumber?: string
  calendarWebhook?: string
  clientId: string
  businessName: string
}

interface OutboundAgentConfig {
  prompt: string
  voice: string
  firstSentence?: string
  maxDuration?: number
  interruptionThreshold?: number
  clientId: string
  businessName: string
}

interface CallData {
  firstName?: string
  lastName?: string
  email?: string
  phone?: string
  notes?: string
  [key: string]: string | undefined
}

interface BlandAgentResponse {
  phone_number?: string
  inbound_phone_number?: string
  id?: string
  agent_id?: string
}

interface CallTranscript {
  callId: string
  status: string
  duration?: number
  transcript: Array<{
    role: string
    text: string
    timestamp?: string
  }>
  summary?: string
  outcome?: string
  recordingUrl?: string
}

export class VoiceService {
  private client: AxiosInstance

  constructor() {
    const apiKey = process.env.BLAND_API_KEY
    if (!apiKey) {
      throw new Error('BLAND_API_KEY environment variable is not set')
    }

    this.client = axios.create({
      baseURL: 'https://api.bland.ai',
      headers: {
        'Authorization': apiKey,
        'Content-Type': 'application/json'
      }
    })

    this.client.interceptors.response.use(
      (response) => response,
      (error) => {
        logger.error('Bland.ai API error', {
          status: error.response?.status,
          data: error.response?.data,
          url: error.config?.url
        })
        throw error
      }
    )
  }

  async createInboundAgent(config: InboundAgentConfig): Promise<{ agentId: string; phoneNumber: string }> {
    const response = await this.client.post<BlandAgentResponse>('/v1/inbound', {
      prompt: config.prompt,
      voice: config.voice || 'nat',
      first_sentence: config.firstSentence || `Thank you for calling ${config.businessName}. How can I help you today?`,
      max_duration: config.maxDuration || 600,
      interruption_threshold: config.interruptionThreshold || 100,
      background_track: config.backgroundTrack || 'none',
      transfer_phone_number: config.transferNumber,
      webhook: config.calendarWebhook,
      metadata: {
        clientId: config.clientId,
        businessName: config.businessName
      }
    })

    logger.info('Bland.ai inbound agent created', {
      agentId: response.data.id,
      phoneNumber: response.data.phone_number
    })

    return {
      agentId: response.data.id || response.data.agent_id || '',
      phoneNumber: response.data.phone_number || response.data.inbound_phone_number || ''
    }
  }

  async createOutboundAgent(config: OutboundAgentConfig): Promise<{ agentId: string }> {
    const response = await this.client.post<BlandAgentResponse>('/v1/agents', {
      prompt: config.prompt,
      voice: config.voice || 'nat',
      first_sentence: config.firstSentence,
      max_duration: config.maxDuration || 600,
      interruption_threshold: config.interruptionThreshold || 100,
      metadata: {
        clientId: config.clientId,
        businessName: config.businessName
      }
    })

    logger.info('Bland.ai outbound agent created', { agentId: response.data.id })

    return { agentId: response.data.id || response.data.agent_id || '' }
  }

  async launchOutboundCall(
    agentId: string,
    phoneNumber: string,
    contactData: CallData
  ): Promise<{ callId: string }> {
    const response = await this.client.post('/v1/calls', {
      phone_number: phoneNumber,
      agent_id: agentId,
      request_data: contactData,
      metadata: {
        contactPhone: phoneNumber
      }
    })

    logger.info('Bland.ai outbound call launched', { callId: response.data.call_id, phoneNumber })

    return { callId: response.data.call_id }
  }

  async getCallTranscript(callId: string): Promise<CallTranscript> {
    const response = await this.client.get(`/v1/calls/${callId}`)

    const call = response.data

    return {
      callId: call.call_id || callId,
      status: call.status,
      duration: call.call_length,
      transcript: (call.transcripts || []).map((t: { user: string; text: string; created_at: string }) => ({
        role: t.user === 'user' ? 'user' : 'assistant',
        text: t.text,
        timestamp: t.created_at
      })),
      summary: call.summary,
      outcome: call.disposition,
      recordingUrl: call.recording_url
    }
  }

  async updateAgentPrompt(agentId: string, newPrompt: string): Promise<void> {
    await this.client.post(`/v1/agents/${agentId}`, {
      prompt: newPrompt
    })

    logger.info('Bland.ai agent prompt updated', { agentId })
  }

  async listInboundNumbers(): Promise<Array<{ phoneNumber: string; agentId: string }>> {
    const response = await this.client.get('/v1/inbound')

    return (response.data.inbound_numbers || []).map((n: { phone_number: string; agent_id: string }) => ({
      phoneNumber: n.phone_number,
      agentId: n.agent_id
    }))
  }
}

export const voiceService = new VoiceService()
