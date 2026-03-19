import { BaseAgent } from './base.agent'
import { AgentType } from '../types/agent.types'
import { n8nService } from '../services/n8n.service'
import { logger } from '../utils/logger'

export interface LinkedInAgentConfig {
  search_keywords: string
  connection_message_template: string
  followup_sequences: Array<{ day: number; message: string }>
  daily_limit: number
  linkedin_cookie: string
  locationId: string
  businessName: string
  api_key?: string
}

export class LinkedInAgent extends BaseAgent {
  agentType = AgentType.LINKEDIN_OUTREACH

  generatePrompt(config: Partial<LinkedInAgentConfig>, contactData?: Record<string, unknown>): string {
    const contact = contactData || {}

    return `You are a LinkedIn outreach specialist for ${config.businessName || 'our business'}.

Your goal is to write personalized, human-sounding LinkedIn messages that get responses.

Contact information:
- Name: ${contact.firstName || ''} ${contact.lastName || ''}
- Headline: ${contact.headline || ''}
- Company: ${contact.company || ''}
- Location: ${contact.location || ''}

Message type: ${contact.messageType || 'connection request'}
Template to personalize: ${config.connection_message_template || ''}

Rules:
1. Keep connection requests under 300 characters
2. Reference something specific about their profile
3. Be warm, not salesy
4. Do not mention money or services directly in first message
5. Sound like a genuine human reaching out

Generate only the message text, nothing else.`
  }

  async deploy(clientId: string, config: LinkedInAgentConfig): Promise<{ id: string; n8nWorkflowId?: string }> {
    logger.info('Deploying LinkedIn Outreach Agent', { clientId })

    const connectionPrompt = await this.callClaude(
      `Create 3 variations of a LinkedIn connection request for ${config.businessName}.
       Each should be under 300 characters, personalized, and human-sounding.
       Return as a JSON array of strings.`,
      'You are an expert LinkedIn marketer. Write in a genuine, human way.'
    )

    let workflowResult: { workflowId: string } | undefined

    try {
      workflowResult = await n8nService.deployWorkflow('linkedin-outreach', {
        clientId,
        locationId: config.locationId,
        agentPrompt: connectionPrompt,
        searchKeywords: config.search_keywords,
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
        generatedPrompt: connectionPrompt,
        linkedin_cookie: config.linkedin_cookie
      },
      workflowResult?.workflowId
    )

    logger.info('LinkedIn Outreach Agent deployed', { clientId, deploymentId: deployment.id })

    return {
      id: deployment.id,
      n8nWorkflowId: workflowResult?.workflowId
    }
  }
}
