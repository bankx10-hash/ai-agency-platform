import { BaseAgent } from './base.agent'
import { AgentType } from '../../../packages/shared/types/agent.types'
import { n8nService } from '../services/n8n.service'
import { logger } from '../utils/logger'

export interface LeadGenerationConfig {
  icp_description: string
  lead_sources: string[]
  scoring_prompt: string
  pipeline_id: string
  high_score_threshold: number
  locationId: string
  businessName: string
}

export class LeadGenerationAgent extends BaseAgent {
  agentType = AgentType.LEAD_GENERATION

  generatePrompt(config: Partial<LeadGenerationConfig>, contactData?: Record<string, unknown>): string {
    const contact = contactData || {}

    return `You are a lead qualification specialist for ${config.businessName || 'our business'}.

Your ideal customer profile (ICP):
${config.icp_description || 'Business owners looking to grow their revenue'}

Your task is to:
1. Analyse the incoming lead data
2. Score the lead from 0-100 based on ICP fit
3. Provide a brief qualification summary
4. Recommend the next action (follow up, schedule call, disqualify)

Lead data to analyse:
${JSON.stringify(contact, null, 2)}

Scoring criteria:
- Company size and revenue (0-30 points)
- Industry fit (0-25 points)
- Intent signals (0-25 points)
- Contact quality (0-20 points)

Respond with a JSON object containing:
{
  "score": <number 0-100>,
  "summary": "<brief qualification summary>",
  "nextAction": "<recommended action>",
  "tags": ["<relevant tags>"]
}

${config.scoring_prompt || ''}`
  }

  async deploy(clientId: string, config: LeadGenerationConfig): Promise<{ id: string; n8nWorkflowId?: string }> {
    logger.info('Deploying Lead Generation Agent', { clientId })

    const agentPrompt = await this.callClaude(
      `Generate a detailed lead scoring system prompt for a business with this ICP: ${config.icp_description}.
       Make it specific, actionable, and effective for qualifying leads automatically.`,
      'You are an expert at creating AI agent prompts for sales automation.'
    )

    let workflowResult: { workflowId: string } | undefined

    try {
      workflowResult = await n8nService.deployWorkflow('lead-generation', {
        clientId,
        locationId: config.locationId,
        agentPrompt,
        webhookUrl: `${process.env['N8N_BASE_URL']}/webhook/lead-gen-${clientId}`,
        pipelineId: config.pipeline_id,
        businessName: config.businessName,
        icpDescription: config.icp_description
      })
    } catch (error) {
      logger.warn('N8N workflow deployment failed, creating record without workflow', { clientId, error })
    }

    const deployment = await this.createDeploymentRecord(
      clientId,
      {
        ...config,
        generatedPrompt: agentPrompt
      },
      workflowResult?.workflowId
    )

    logger.info('Lead Generation Agent deployed', { clientId, deploymentId: deployment.id })

    return {
      id: deployment.id,
      n8nWorkflowId: workflowResult?.workflowId
    }
  }
}
