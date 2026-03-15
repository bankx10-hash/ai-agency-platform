import { BaseAgent } from './base.agent'
import { AgentType } from '../../../packages/shared/types/agent.types'
import { n8nService } from '../services/n8n.service'
import { logger } from '../utils/logger'

export interface AdvertisingAgentConfig {
  meta_ad_account_id: string
  google_ads_customer_id: string
  target_roas: number
  daily_budget_limit: number
  alert_email: string
  locationId: string
  businessName: string
}

export class AdvertisingAgent extends BaseAgent {
  agentType = AgentType.ADVERTISING

  generatePrompt(config: Partial<AdvertisingAgentConfig>, contactData?: Record<string, unknown>): string {
    const adData = contactData || {}

    return `You are a paid advertising expert for ${config.businessName || 'our business'}.

Campaign performance data:
${JSON.stringify(adData, null, 2)}

Performance thresholds:
- Target ROAS: ${config.target_roas || 3.0}x
- Daily budget limit: $${config.daily_budget_limit || 100}

Your tasks:
1. Analyse the campaign performance metrics
2. Identify underperforming ad sets (CTR < 1% or ROAS < ${(config.target_roas || 3.0) * 0.7})
3. Generate 3 new ad copy variations for A/B testing
4. Provide optimisation recommendations
5. Flag any budget issues

For ad copy variations, create:
- Headlines (max 30 characters for Google, 40 for Meta)
- Descriptions (max 90 characters for Google, 125 for Meta)
- Call-to-action suggestions

Respond with a JSON object containing:
{
  "underperformingAdSets": [],
  "recommendations": [],
  "newAdVariants": [],
  "budgetAlerts": [],
  "weeklyReport": ""
}`
  }

  async deploy(clientId: string, config: AdvertisingAgentConfig): Promise<{ id: string; n8nWorkflowId?: string }> {
    logger.info('Deploying Advertising Agent', { clientId })

    const adStrategyPrompt = await this.callClaude(
      `Create a paid advertising strategy and monitoring framework for ${config.businessName}.
       Target ROAS: ${config.target_roas}x
       Daily budget: $${config.daily_budget_limit}
       Create a system for:
       1. Daily performance monitoring rules
       2. Ad copy generation templates
       3. Optimisation decision tree
       4. Alert thresholds
       Return as detailed JSON.`,
      'You are an expert paid media strategist with deep knowledge of Meta Ads and Google Ads.'
    )

    let workflowResult: { workflowId: string } | undefined

    try {
      workflowResult = await n8nService.deployWorkflow('advertising', {
        clientId,
        locationId: config.locationId,
        agentPrompt: adStrategyPrompt,
        webhookUrl: `${process.env.N8N_BASE_URL}/webhook/ads-${clientId}`,
        businessName: config.businessName
      })
    } catch (error) {
      logger.warn('N8N workflow deployment failed', { clientId, error })
    }

    const deployment = await this.createDeploymentRecord(
      clientId,
      {
        ...config,
        generatedStrategy: adStrategyPrompt
      },
      workflowResult?.workflowId
    )

    logger.info('Advertising Agent deployed', { clientId, deploymentId: deployment.id })

    return {
      id: deployment.id,
      n8nWorkflowId: workflowResult?.workflowId
    }
  }
}
