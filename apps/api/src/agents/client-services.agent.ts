import { BaseAgent } from './base.agent'
import { AgentType } from '../../../packages/shared/types/agent.types'
import { n8nService } from '../services/n8n.service'
import { logger } from '../utils/logger'

export interface ClientServicesConfig {
  welcome_sequence: Array<{ day: number; message: string }>
  onboarding_checklist: string[]
  nps_schedule: string
  health_score_weights: Record<string, number>
  upsell_triggers: string[]
  locationId: string
  businessName: string
}

export class ClientServicesAgent extends BaseAgent {
  agentType = AgentType.CLIENT_SERVICES

  generatePrompt(config: Partial<ClientServicesConfig>, contactData?: Record<string, unknown>): string {
    const client = contactData || {}
    const requestType = client.requestType as string || 'general'

    return `You are a dedicated client success manager for ${config.businessName || 'our business'}.

Your mission: Ensure every client achieves maximum value, stays long-term, and refers others.

Client information:
${JSON.stringify(client, null, 2)}

Request type: ${requestType}

Your responsibilities based on request type:

WELCOME (new client):
- Send warm, personalised welcome
- Set expectations for the onboarding process
- Schedule kickoff call
- Provide quick-win first steps

SUPPORT (client has issue):
- Acknowledge the issue with empathy
- Provide a clear solution or escalation path
- Set a timeline for resolution
- Follow up proactively

CHECK_IN (regular touchpoint):
- Celebrate wins and progress
- Identify any friction or concerns
- Suggest optimisations or new features
- Gauge satisfaction (NPS prompt if scheduled)

UPSELL (usage threshold hit):
- Reference specific value they've already received
- Present upgrade naturally as a solution to their growth
- Make it about their success, not the sale

CHURN_RISK (health score declining):
- Acknowledge any issues proactively
- Understand root cause with curiosity, not defensiveness
- Offer concrete solutions or adjustments
- Escalate to senior team if needed

Upsell triggers to watch: ${(config.upsell_triggers || []).join(', ')}
NPS schedule: ${config.nps_schedule || 'monthly'}

Always be warm, proactive, and solutions-focused. You genuinely care about client success.`
  }

  async deploy(clientId: string, config: ClientServicesConfig): Promise<{ id: string; n8nWorkflowId?: string }> {
    logger.info('Deploying Client Services Agent', { clientId })

    const clientSuccessPrompt = await this.callClaude(
      `Create a comprehensive client success playbook for ${config.businessName}.

       Design:
       1. Welcome sequence for new clients (${config.welcome_sequence.length} touchpoints)
       2. Onboarding checklist follow-up cadence
       3. Monthly check-in framework
       4. Health score calculation based on: ${JSON.stringify(config.health_score_weights)}
       5. Churn risk intervention script
       6. Upsell conversation framework triggered by: ${config.upsell_triggers.join(', ')}
       7. NPS survey follow-up based on score ranges

       Create specific message templates for each scenario.
       Make all communication warm, human, and focused on client success.
       Return as structured JSON with message templates.`,
      'You are a world-class client success strategist. Create retention and growth systems.'
    )

    let workflowResult: { workflowId: string } | undefined

    try {
      workflowResult = await n8nService.deployWorkflow('client-services', {
        clientId,
        locationId: config.locationId,
        agentPrompt: clientSuccessPrompt,
        webhookUrl: `${process.env.N8N_BASE_URL}/webhook/client-services-${clientId}`,
        businessName: config.businessName
      })
    } catch (error) {
      logger.warn('N8N workflow deployment failed', { clientId, error })
    }

    const deployment = await this.createDeploymentRecord(
      clientId,
      {
        ...config,
        generatedPlaybook: clientSuccessPrompt
      },
      workflowResult?.workflowId
    )

    logger.info('Client Services Agent deployed', { clientId, deploymentId: deployment.id })

    return {
      id: deployment.id,
      n8nWorkflowId: workflowResult?.workflowId
    }
  }
}
