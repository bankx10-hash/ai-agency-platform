import { BaseAgent } from './base.agent'
import { AgentType } from '../types/agent.types'
import { n8nService } from '../services/n8n.service'
import { voiceService } from '../services/voice.service'
import { prisma } from '../lib/prisma'
import { logger } from '../utils/logger'

export interface VoiceInboundConfig {
  greeting_script: string
  qualification_questions: string[]
  faq_knowledge_base: string
  escalation_number: string
  voice_id: string
  calendar_id: string
  locationId: string
  businessName: string
  api_key?: string
}

export class VoiceInboundAgent extends BaseAgent {
  agentType = AgentType.VOICE_INBOUND

  generatePrompt(config: Partial<VoiceInboundConfig>, contactData?: Record<string, unknown>): string {
    const caller = contactData || {}

    return `You are a professional AI receptionist for ${config.businessName || 'our business'}. You are answering a live phone call right now.

Greeting: ${config.greeting_script || `Thank you for calling ${config.businessName}. How can I help you today?`}

Your qualification questions to work through naturally:
${(config.qualification_questions || []).map((q, i) => `${i + 1}. ${q}`).join('\n')}

Knowledge base:
${config.faq_knowledge_base || 'Answer common questions about the business.'}

Call handling rules:
1. Always greet warmly and professionally
2. Listen actively — do not interrupt
3. Ask qualification questions naturally, not like a form
4. If caller wants to book: collect name, email, and preferred time, then confirm calendar availability
5. If question not in knowledge base: say you will have someone call back and take their contact info
6. If caller is upset or frustrated: empathise, then offer to connect them with a human (transfer to ${config.escalation_number || 'manager'})
7. Keep calls focused but never rushed
8. Always end with a clear next step

Caller context:
${JSON.stringify(caller, null, 2)}

Respond naturally as if in a real phone conversation.`
  }

  async deploy(clientId: string, config: VoiceInboundConfig): Promise<{ id: string; n8nWorkflowId?: string }> {
    logger.info('Deploying Voice Inbound Agent', { clientId })

    const voicePrompt = await this.callClaude(
      `Create a detailed, natural-sounding AI phone receptionist script for ${config.businessName}.

       The agent should:
       1. Answer calls professionally with: "${config.greeting_script}"
       2. Qualify callers with these questions (asked naturally): ${config.qualification_questions.join(', ')}
       3. Handle FAQs from this knowledge base: ${config.faq_knowledge_base}
       4. Book appointments using calendar ID: ${config.calendar_id}
       5. Escalate to human at: ${config.escalation_number}

       Create a comprehensive system prompt that makes the AI sound human, warm, and professional.
       Include specific language for handling common situations.`,
      'You are an expert at creating AI voice agent prompts for businesses. Make them sound completely human.'
    )

    let retellAgentId: string | undefined
    let phoneNumber: string | undefined

    try {
      const voiceResult = await voiceService.createInboundAgent({
        prompt: voicePrompt,
        voice: config.voice_id || '11labs-Noah',
        firstSentence: config.greeting_script,
        clientId,
        businessName: config.businessName,
        transferNumber: config.escalation_number,
        calendarWebhook: `${process.env['N8N_BASE_URL']}/webhook/voice-calendar-${clientId}`
      })

      retellAgentId = voiceResult.agentId

      logger.info('Retell inbound agent created', { clientId, retellAgentId, phoneNumber })
    } catch (error) {
      logger.warn('Failed to create Retell agent', { clientId, error })
    }

    let workflowResult: { workflowId: string } | undefined

    try {
      workflowResult = await n8nService.deployWorkflow('voice-inbound', {
        clientId,
        locationId: config.locationId,
        agentPrompt: voicePrompt,
        webhookUrl: `${process.env['N8N_BASE_URL']}/webhook/voice-inbound-${clientId}`,
        phoneNumber,
        calendarId: config.calendar_id,
        businessName: config.businessName,
        apiKey: config.api_key as string || ''
      })
    } catch (error) {
      logger.warn('N8N workflow deployment failed', { clientId, error: String(error) })
    }

    const deployment = await this.createDeploymentRecord(
      clientId,
      {
        ...config,
        generatedPrompt: voicePrompt,
        phone_number: phoneNumber,
        retell_agent_id: retellAgentId
      },
      workflowResult?.workflowId
    )

    if (retellAgentId) {
      await prisma.agentDeployment.update({
        where: { id: deployment.id },
        data: { retellAgentId }
      })
    }

    logger.info('Voice Inbound Agent deployed', { clientId, deploymentId: deployment.id, phoneNumber })

    return {
      id: deployment.id,
      n8nWorkflowId: workflowResult?.workflowId
    }
  }
}
