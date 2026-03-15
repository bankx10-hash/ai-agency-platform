import axios, { AxiosInstance } from 'axios'
import { logger } from '../utils/logger'

interface InboundAgentConfig {
  prompt: string
  voice: string
  firstSentence?: string
  transferNumber?: string
  calendarWebhook?: string
  twilioPhoneNumber: string
  clientId: string
  businessName: string
}

interface OutboundAgentConfig {
  prompt: string
  voice: string
  firstSentence?: string
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

interface RetellAgentResponse {
  agent_id: string
  agent_name?: string
}

interface RetellLlmResponse {
  llm_id: string
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
    const apiKey = process.env.RETELL_API_KEY
    if (!apiKey) {
      logger.warn('RETELL_API_KEY not set — voice agent features will be unavailable')
    }

    this.client = axios.create({
      baseURL: 'https://api.retellai.com',
      headers: {
        'Authorization': `Bearer ${apiKey || 'not-configured'}`,
        'Content-Type': 'application/json'
      }
    })

    this.client.interceptors.response.use(
      (response) => response,
      (error) => {
        logger.error('Retell API error', {
          status: error.response?.status,
          data: error.response?.data,
          url: error.config?.url
        })
        throw error
      }
    )
  }

  private async createLlm(prompt: string, beginMessage?: string): Promise<string> {
    const response = await this.client.post<RetellLlmResponse>('/create-retell-llm', {
      general_prompt: prompt,
      begin_message: beginMessage || null
    })
    return response.data.llm_id
  }

  async createInboundAgent(config: InboundAgentConfig): Promise<{ agentId: string; phoneNumber: string }> {
    const llmId = await this.createLlm(
      config.prompt,
      config.firstSentence || `Thank you for calling ${config.businessName}. How can I help you today?`
    )

    const response = await this.client.post<RetellAgentResponse>('/create-agent', {
      llm_websocket_url: `wss://api.retellai.com/retell-llm/llm-websocket/${llmId}`,
      agent_name: `${config.businessName} — Inbound`,
      voice_id: config.voice || 'eleven_labs_english_male_adam',
      language: 'en-US',
      webhook_url: config.calendarWebhook || null,
      responsiveness: 1,
      interruption_sensitivity: 1,
      enable_backchannel: true,
      ambient_sound: 'office',
      metadata: {
        clientId: config.clientId,
        businessName: config.businessName,
        type: 'inbound'
      }
    })

    const agentId = response.data.agent_id

    // Bind the client's Twilio number to this Retell agent for inbound calls
    await this.client.post('/create-phone-number-from-existing-number', {
      phone_number: config.twilioPhoneNumber,
      inbound_agent_id: agentId,
      nickname: `${config.businessName} Inbound`
    })

    logger.info('Retell inbound agent created and bound to Twilio number', {
      agentId,
      phoneNumber: config.twilioPhoneNumber
    })

    return {
      agentId,
      phoneNumber: config.twilioPhoneNumber
    }
  }

  async createOutboundAgent(config: OutboundAgentConfig): Promise<{ agentId: string }> {
    const llmId = await this.createLlm(config.prompt, config.firstSentence)

    const response = await this.client.post<RetellAgentResponse>('/create-agent', {
      llm_websocket_url: `wss://api.retellai.com/retell-llm/llm-websocket/${llmId}`,
      agent_name: `${config.businessName} — Outbound`,
      voice_id: config.voice || 'eleven_labs_english_male_adam',
      language: 'en-US',
      responsiveness: 1,
      interruption_sensitivity: 1,
      enable_backchannel: true,
      metadata: {
        clientId: config.clientId,
        businessName: config.businessName,
        type: 'outbound'
      }
    })

    logger.info('Retell outbound agent created', { agentId: response.data.agent_id })

    return { agentId: response.data.agent_id }
  }

  async launchOutboundCall(
    agentId: string,
    toNumber: string,
    contactData: CallData
  ): Promise<{ callId: string }> {
    const fromNumber = process.env.TWILIO_OUTBOUND_NUMBER
    if (!fromNumber) throw new Error('TWILIO_OUTBOUND_NUMBER not set')

    const response = await this.client.post('/create-call', {
      from_number: fromNumber,
      to_number: toNumber,
      override_agent_id: agentId,
      metadata: contactData
    })

    logger.info('Retell outbound call launched', { callId: response.data.call_id, toNumber })

    return { callId: response.data.call_id }
  }

  async getCallTranscript(callId: string): Promise<CallTranscript> {
    const response = await this.client.get(`/get-call/${callId}`)
    const call = response.data

    return {
      callId: call.call_id || callId,
      status: call.call_status,
      duration: call.duration_ms ? Math.round(call.duration_ms / 1000) : undefined,
      transcript: (call.transcript_object || []).map((t: { role: string; content: string; words?: Array<{ start: number }> }) => ({
        role: t.role === 'user' ? 'user' : 'assistant',
        text: t.content,
        timestamp: t.words?.[0]?.start?.toString()
      })),
      summary: call.call_analysis?.call_summary,
      outcome: call.call_analysis?.call_successful ? 'successful' : 'unsuccessful',
      recordingUrl: call.recording_url
    }
  }

  async updateAgentPrompt(agentId: string, newPrompt: string): Promise<void> {
    const agentRes = await this.client.get(`/get-agent/${agentId}`)
    const llmWebsocketUrl: string = agentRes.data.llm_websocket_url || ''
    const llmId = llmWebsocketUrl.split('/').pop()

    if (llmId) {
      await this.client.patch(`/update-retell-llm/${llmId}`, {
        general_prompt: newPrompt
      })
      logger.info('Retell agent prompt updated', { agentId, llmId })
    }
  }
}

export const voiceService = new VoiceService()
