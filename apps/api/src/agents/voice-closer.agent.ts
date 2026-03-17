import { BaseAgent } from './base.agent'
import { AgentType } from '../types/agent.types'
import { n8nService } from '../services/n8n.service'
import { voiceService } from '../services/voice.service'
import { prisma } from '../lib/prisma'
import { logger } from '../utils/logger'

export interface VoiceCloserConfig {
  closing_script_template: string
  offer_details: string
  payment_link: string
  contract_link: string
  objection_scripts: Record<string, string>
  commission_tracking: boolean
  locationId: string
  businessName: string
}

export class VoiceCloserAgent extends BaseAgent {
  agentType = AgentType.VOICE_CLOSER

  generatePrompt(config: Partial<VoiceCloserConfig>, contactData?: Record<string, unknown>): string {
    const prospect = contactData || {}

    return `You are an expert sales closer for ${config.businessName || 'our business'}. You are on a closing call with a warm prospect right now.

Offer details:
${config.offer_details || 'Our premium business solution'}

Payment link: ${config.payment_link || '[PAYMENT_LINK]'}
Contract link: ${config.contract_link || '[CONTRACT_LINK]'}

Prospect information:
${JSON.stringify(prospect, null, 2)}

Closing script to guide you:
${config.closing_script_template || 'Follow up on our previous conversation and close the deal.'}

Objection handling:
${JSON.stringify(config.objection_scripts || {}, null, 2)}

Closing framework:
1. Warm opener - reference previous conversation or demo
2. Confirm their pain points are still relevant
3. Present the solution as the answer to those pains
4. Handle objections with empathy and facts
5. Ask for the commitment directly
6. If YES: Send payment/contract link via SMS immediately
7. If MAYBE: Set clear next steps with specific date/time
8. If NO: Find out why and address root concern

Price objection framework:
- Focus on ROI and value, not cost
- Use comparison to alternatives
- Offer payment plan if available

Remember: Closing is about helping them make a decision that's right for them. Be confident, not pushy.`
  }

  async deploy(clientId: string, config: VoiceCloserConfig): Promise<{ id: string; n8nWorkflowId?: string }> {
    logger.info('Deploying Voice Closer Agent', { clientId })

    const closingScript = await this.callClaude(
      `Create a complete sales closing call script for ${config.businessName}.

       Offer: ${config.offer_details}
       Payment link: ${config.payment_link}

       Create:
       1. Opening (reference previous interaction, build rapport)
       2. Pain point confirmation questions
       3. Value presentation framework
       4. Price reveal and framing
       5. Detailed objection handlers for:
          - "It's too expensive"
          - "I need to think about it"
          - "I need to talk to my partner/team"
          - "We're already using another solution"
          - "Not the right time"
       6. Verbal close script
       7. Post-close next steps (send links, set expectations)
       8. Call back script for "think about it" responses

       Make this sound like a world-class human closer, not a robot.
       Include psychological principles and emotional intelligence throughout.`,
      'You are an elite sales closer trainer. Create scripts that are authentic, ethical, and highly effective.'
    )

    let retellAgentId: string | undefined

    try {
      const voiceResult = await voiceService.createOutboundAgent({
        prompt: closingScript,
        voice: 'eleven_labs_english_male_adam',
        firstSentence: `Hi, this is calling from ${config.businessName}. I'm following up from our conversation — do you have a few minutes?`,
        clientId,
        businessName: config.businessName
      })

      retellAgentId = voiceResult.agentId
      logger.info('Retell closer agent created', { clientId, retellAgentId })
    } catch (error) {
      logger.warn('Failed to create Retell closer agent', { clientId, error })
    }

    let workflowResult: { workflowId: string } | undefined

    try {
      workflowResult = await n8nService.deployWorkflow('voice-closer', {
        clientId,
        locationId: config.locationId,
        agentPrompt: closingScript,
        webhookUrl: `${process.env['N8N_BASE_URL']}/webhook/voice-closer-${clientId}`,
        businessName: config.businessName
      })
    } catch (error) {
      logger.warn('N8N workflow deployment failed', { clientId, error })
    }

    const deployment = await this.createDeploymentRecord(
      clientId,
      {
        ...config,
        generatedScript: closingScript,
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

    logger.info('Voice Closer Agent deployed', { clientId, deploymentId: deployment.id })

    return {
      id: deployment.id,
      n8nWorkflowId: workflowResult?.workflowId
    }
  }
}
