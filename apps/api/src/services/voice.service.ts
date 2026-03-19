import axios, { AxiosInstance } from 'axios'
import twilio from 'twilio'
import { logger } from '../utils/logger'

interface InboundAgentConfig {
  prompt: string
  voice: string
  firstSentence?: string
  transferNumber?: string
  calendarWebhook?: string
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
    const apiKey = process.env['RETELL_API_KEY']
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

  async createInboundAgent(config: InboundAgentConfig): Promise<{ agentId: string }> {
    const llmId = await this.createLlm(
      config.prompt,
      config.firstSentence || `Thank you for calling ${config.businessName}. How can I help you today?`
    )

    const response = await this.client.post<RetellAgentResponse>('/create-agent', {
      response_engine: { type: 'retell-llm', llm_id: llmId },
      agent_name: `${config.businessName} — Inbound`,
      voice_id: config.voice || '11labs-Noah',
      language: 'en-US',
      webhook_url: config.calendarWebhook || null,
      responsiveness: 1,
      interruption_sensitivity: 1,
      enable_backchannel: true,
      ambient_sound: 'call-center',
      metadata: {
        clientId: config.clientId,
        businessName: config.businessName,
        type: 'inbound'
      }
    })

    const agentId = response.data.agent_id
    logger.info('Retell inbound agent created', { agentId, clientId: config.clientId })
    return { agentId }
  }

  async provisionRetellNumber(agentId: string, nickname: string, areaCode?: number): Promise<string> {
    const body: Record<string, unknown> = {
      number_provider: process.env['RETELL_NUMBER_PROVIDER'] || 'twilio',
      nickname,
      inbound_agents: [{ agent_id: agentId, weight: 1 }]
    }
    if (areaCode) body.area_code = areaCode

    const response = await this.client.post<{ phone_number: string }>('/create-phone-number', body)
    const phoneNumber = response.data.phone_number

    logger.info('Retell phone number provisioned', { phoneNumber, agentId })
    return phoneNumber
  }

  async createOutboundAgent(config: OutboundAgentConfig): Promise<{ agentId: string }> {
    const llmId = await this.createLlm(config.prompt, config.firstSentence)

    const response = await this.client.post<RetellAgentResponse>('/create-agent', {
      response_engine: { type: 'retell-llm', llm_id: llmId },
      agent_name: `${config.businessName} — Outbound`,
      voice_id: config.voice || '11labs-Noah',
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
    contactData: CallData,
    fromNumber?: string
  ): Promise<{ callId: string }> {
    const from = fromNumber || process.env['TWILIO_OUTBOUND_NUMBER']
    if (!from) throw new Error('No outbound number provided and TWILIO_OUTBOUND_NUMBER not set')

    const response = await this.client.post('/v2/create-phone-call', {
      from_number: from,
      to_number: toNumber,
      override_agent_id: agentId,
      metadata: contactData
    })

    logger.info('Retell outbound call launched', { callId: response.data.call_id, toNumber })

    return { callId: response.data.call_id }
  }

  async getCallTranscript(callId: string): Promise<CallTranscript> {
    const response = await this.client.get(`/v2/get-call/${callId}`)
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

  // Provision a phone number via Twilio for any country, attach it to the SIP trunk,
  // then import it into Retell so inbound calls route to the given agent.
  async provisionTwilioNumber(
    agentId: string,
    nickname: string,
    countryCode = 'AU'
  ): Promise<string> {
    const accountSid = process.env['TWILIO_ACCOUNT_SID']
    const authToken = process.env['TWILIO_AUTH_TOKEN']
    const trunkSid = process.env['TWILIO_SIP_TRUNK_SID']

    if (!accountSid || !authToken || !trunkSid) {
      throw new Error('TWILIO_ACCOUNT_SID, TWILIO_AUTH_TOKEN, and TWILIO_SIP_TRUNK_SID must be set')
    }

    const twilioClient = twilio(accountSid, authToken)

    // Search for a local voice-enabled number in the target country
    const available = await twilioClient
      .availablePhoneNumbers(countryCode)
      .local.list({ limit: 1, voiceEnabled: true })

    if (!available.length) {
      throw new Error(`No available ${countryCode} numbers`)
    }

    // Some countries (e.g. AU) require a verified address SID on purchase.
    // Use the env var if set, otherwise fetch the first address on the account.
    let addressSid = process.env['TWILIO_ADDRESS_SID']
    if (!addressSid) {
      const addresses = await twilioClient.addresses.list({ limit: 1 })
      if (addresses.length) addressSid = addresses[0].sid
    }

    // Purchase the number
    const purchased = await twilioClient.incomingPhoneNumbers.create({
      phoneNumber: available[0].phoneNumber,
      ...(addressSid ? { addressSid } : {})
    })

    // Attach it to the SIP trunk so Twilio routes calls outbound via Retell
    await twilioClient.trunking.v1.trunks(trunkSid).phoneNumbers.create({
      phoneNumberSid: purchased.sid
    })

    // Fetch the trunk's SIP domain name — used as Retell's termination_uri
    const trunk = await twilioClient.trunking.v1.trunks(trunkSid).fetch()
    const terminationUri = trunk.domainName

    logger.info('Twilio number purchased and attached to trunk', {
      phoneNumber: purchased.phoneNumber,
      countryCode,
      trunkSid,
      terminationUri
    })

    // Import the Twilio number into Retell and bind the agent
    await this.client.post('/import-phone-number', {
      phone_number: purchased.phoneNumber,
      termination_uri: terminationUri,
      nickname,
      inbound_agents: [{ agent_id: agentId, weight: 1 }]
    })

    logger.info('Twilio number imported into Retell', {
      phoneNumber: purchased.phoneNumber,
      agentId
    })

    return purchased.phoneNumber
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
