import { BaseAgent } from './base.agent'
import { AgentType } from '../../../packages/shared/types/agent.types'
import { n8nService } from '../services/n8n.service'
import { voiceService } from '../services/voice.service'
import { PrismaClient } from '@prisma/client'
import { logger } from '../utils/logger'

const prisma = new PrismaClient()

export interface VoiceOutboundConfig {
  call_script: string
  objection_handlers: Record<string, string>
  max_daily_calls: number
  call_window_hours: string
  retry_attempts: number
  ghl_pipeline_stage: string
  locationId: string
  businessName: string
}

export class VoiceOutboundAgent extends BaseAgent {
  agentType = AgentType.VOICE_OUTBOUND

  generatePrompt(config: Partial<VoiceOutboundConfig>, contactData?: Record<string, unknown>): string {
    const contact = contactData || {}

    return `You are a professional outbound calling agent for ${config.businessName || 'our business'}. You are making a live outbound call right now.

Call script:
${config.call_script || `Hi, this is an AI assistant calling from ${config.businessName}. Is this a good time to chat for 2 minutes?`}

You are calling: ${contact.firstName || ''} ${contact.lastName || ''}
Their context: ${JSON.stringify(contact, null, 2)}

Objection handling responses:
${JSON.stringify(config.objection_handlers || {}, null, 2)}

Call goals:
1. Confirm identity warmly
2. State your reason for calling concisely
3. Qualify their interest level
4. If interested: book an appointment or transfer to specialist
5. If not interested: thank them and ask if it's okay to follow up in future
6. Log call outcome clearly

Call outcomes to track:
- INTERESTED: Schedule appointment
- CALLBACK: Schedule callback for specific time
- NOT_INTERESTED: Note reason, do not call again
- VOICEMAIL: Leave professional voicemail, send follow-up SMS
- NO_ANSWER: Schedule retry

Always be respectful of the person's time. If they're busy, offer to call at a better time.`
  }

  async deploy(clientId: string, config: VoiceOutboundConfig): Promise<{ id: string; n8nWorkflowId?: string }> {
    logger.info('Deploying Voice Outbound Agent', { clientId })

    const outboundScript = await this.callClaude(
      `Create a natural-sounding outbound call script for ${config.businessName}.

       Starting script: "${config.call_script}"
       Call window: ${config.call_window_hours}
       Max daily calls: ${config.max_daily_calls}

       Develop:
       1. Opening (first 15 seconds - get permission to continue)
       2. Value proposition (30 seconds)
       3. Qualifying questions (2-3 questions)
       4. Objection handlers for: not interested, too busy, already have solution, need to think about it
       5. Close (book appointment or get callback time)
       6. Voicemail script (under 30 seconds)

       Make it sound completely natural and human. Include emotional intelligence cues.`,
      'You are an expert at creating outbound sales call scripts that feel authentic and get results.'
    )

    let blandAgentId: string | undefined

    try {
      const voiceResult = await voiceService.createOutboundAgent({
        prompt: outboundScript,
        voice: 'nat',
        firstSentence: `Hi, is this a good time to chat for just 2 minutes? I'm calling from ${config.businessName}.`,
        clientId,
        businessName: config.businessName
      })

      blandAgentId = voiceResult.agentId
      logger.info('Bland.ai outbound agent created', { clientId, blandAgentId })
    } catch (error) {
      logger.warn('Failed to create Bland.ai outbound agent', { clientId, error })
    }

    let workflowResult: { workflowId: string } | undefined

    try {
      workflowResult = await n8nService.deployWorkflow('voice-outbound', {
        clientId,
        locationId: config.locationId,
        agentPrompt: outboundScript,
        webhookUrl: `${process.env.N8N_BASE_URL}/webhook/voice-outbound-${clientId}`,
        businessName: config.businessName
      })
    } catch (error) {
      logger.warn('N8N workflow deployment failed', { clientId, error })
    }

    const deployment = await this.createDeploymentRecord(
      clientId,
      {
        ...config,
        generatedScript: outboundScript,
        bland_agent_id: blandAgentId
      },
      workflowResult?.workflowId
    )

    if (blandAgentId) {
      await prisma.agentDeployment.update({
        where: { id: deployment.id },
        data: { blandAgentId }
      })
    }

    logger.info('Voice Outbound Agent deployed', { clientId, deploymentId: deployment.id })

    return {
      id: deployment.id,
      n8nWorkflowId: workflowResult?.workflowId
    }
  }
}
