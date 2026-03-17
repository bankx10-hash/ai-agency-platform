import { BaseAgent } from './base.agent'
import { AgentType } from '../types/agent.types'
import { n8nService } from '../services/n8n.service'
import { adsService } from '../services/ads.service'
import { logger } from '../utils/logger'

export interface AdvertisingAgentConfig {
  meta_ad_account_id: string
  meta_access_token: string
  meta_page_id?: string              // required to create new ad creatives
  meta_default_adset_id?: string     // adset new ads get added into
  ad_link_url?: string               // landing page URL for new ads
  google_ads_customer_id?: string
  google_refresh_token?: string
  target_roas: number
  daily_budget_limit: number
  alert_email: string
  locationId: string
  businessName: string
}

interface AnalysisResult {
  underperformingAdSets: Array<{ id: string; name: string; reason: string }>
  underperformingCampaigns: Array<{ campaignId: string; campaignName: string; reason: string }>
  recommendations: string[]
  newAdVariants: Array<{ headline: string; description: string; cta: string }>
  budgetAlerts: string[]
  pausedMeta: number
  pausedGoogle: number
  adsCreated: number
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
1. Analyse both Meta and Google campaign performance metrics
2. Identify underperforming Meta ad sets (CTR < 1% or ROAS < ${((config.target_roas || 3.0) * 0.7).toFixed(1)})
3. Identify underperforming Google campaigns (CTR < 2% or ROAS < ${((config.target_roas || 3.0) * 0.7).toFixed(1)})
4. Generate 3 new ad copy variations for A/B testing
5. Provide optimisation recommendations
6. Flag any budget issues

For ad copy variations, create:
- Headlines (max 30 characters for Google, 40 for Meta)
- Descriptions (max 90 characters for Google, 125 for Meta)
- Call-to-action type (e.g. LEARN_MORE, SHOP_NOW, SIGN_UP, GET_QUOTE)

Respond with a JSON object:
{
  "underperformingAdSets": [{ "id": "", "name": "", "reason": "" }],
  "underperformingCampaigns": [{ "campaignId": "", "campaignName": "", "reason": "" }],
  "recommendations": [],
  "newAdVariants": [{ "headline": "", "description": "", "cta": "" }],
  "budgetAlerts": [],
  "weeklyReport": ""
}`
  }

  async analyseAndOptimise(config: AdvertisingAgentConfig): Promise<AnalysisResult> {
    // 1. Fetch Meta stats
    const metaInsights = await adsService.getMetaInsights(
      config.meta_ad_account_id,
      config.meta_access_token
    )

    // 2. Fetch Google stats (optional)
    let googleInsights: Awaited<ReturnType<typeof adsService.getGoogleInsights>> = []
    if (config.google_ads_customer_id && config.google_refresh_token) {
      const accessToken = await adsService.refreshGoogleToken(config.google_refresh_token)
      googleInsights = await adsService.getGoogleInsights(config.google_ads_customer_id, accessToken)
    }

    // 3. Ask Claude to analyse
    const raw = await this.callClaude(
      this.generatePrompt(config, { metaInsights, googleInsights }),
      'You are an expert paid media strategist. Return only valid JSON.'
    )

    let analysis: AnalysisResult = {
      underperformingAdSets: [],
      underperformingCampaigns: [],
      recommendations: [],
      newAdVariants: [],
      budgetAlerts: [],
      pausedMeta: 0,
      pausedGoogle: 0,
      adsCreated: 0
    }

    try {
      const parsed = JSON.parse(raw.replace(/```json\n?|\n?```/g, '').trim())
      analysis = { ...analysis, ...parsed }
    } catch {
      logger.warn('Failed to parse Claude advertising analysis', { raw })
    }

    // 4. Pause underperforming Meta adsets
    for (const adset of analysis.underperformingAdSets) {
      try {
        await adsService.pauseMetaAdset(adset.id, config.meta_access_token)
        analysis.pausedMeta++
      } catch (err) {
        logger.error('Failed to pause Meta adset', { adsetId: adset.id, err })
      }
    }

    // 5. Pause underperforming Google campaigns
    if (config.google_ads_customer_id && config.google_refresh_token) {
      const googleAccessToken = await adsService.refreshGoogleToken(config.google_refresh_token)
      for (const campaign of analysis.underperformingCampaigns) {
        try {
          await adsService.pauseGoogleCampaign(
            config.google_ads_customer_id,
            campaign.campaignId,
            googleAccessToken
          )
          analysis.pausedGoogle++
        } catch (err) {
          logger.error('Failed to pause Google campaign', { campaignId: campaign.campaignId, err })
        }
      }
    }

    // 6. Create new Meta ads from generated variants (requires page + adset config)
    if (
      config.meta_page_id &&
      config.meta_default_adset_id &&
      config.ad_link_url &&
      analysis.newAdVariants.length > 0
    ) {
      for (const variant of analysis.newAdVariants.slice(0, 3)) {
        try {
          await adsService.createMetaAd({
            adAccountId: config.meta_ad_account_id,
            adsetId: config.meta_default_adset_id,
            pageId: config.meta_page_id,
            accessToken: config.meta_access_token,
            name: `Auto-generated — ${variant.headline}`,
            message: variant.description,
            headline: variant.headline,
            description: variant.description,
            cta: variant.cta,
            linkUrl: config.ad_link_url
          })
          analysis.adsCreated++
        } catch (err) {
          logger.error('Failed to create Meta ad', { variant, err })
        }
      }
    }

    logger.info('Advertising analysis complete', {
      pausedMeta: analysis.pausedMeta,
      pausedGoogle: analysis.pausedGoogle,
      adsCreated: analysis.adsCreated
    })

    return analysis
  }

  async deploy(clientId: string, config: AdvertisingAgentConfig): Promise<{ id: string; n8nWorkflowId?: string }> {
    logger.info('Deploying Advertising Agent', { clientId })

    const adStrategyPrompt = await this.callClaude(
      `Create a paid advertising strategy and monitoring framework for ${config.businessName}.
       Target ROAS: ${config.target_roas}x
       Daily budget: $${config.daily_budget_limit}
       Platforms: Meta Ads${config.google_ads_customer_id ? ' + Google Ads' : ''}
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
        metaAdAccountId: config.meta_ad_account_id,
        metaAccessToken: config.meta_access_token,
        metaPageId: config.meta_page_id || '',
        metaDefaultAdsetId: config.meta_default_adset_id || '',
        adLinkUrl: config.ad_link_url || '',
        googleCustomerId: config.google_ads_customer_id || '',
        googleRefreshToken: config.google_refresh_token || '',
        targetRoas: config.target_roas.toString(),
        businessName: config.businessName
      })
    } catch (error) {
      logger.warn('N8N workflow deployment failed', { clientId, error })
    }

    const deployment = await this.createDeploymentRecord(
      clientId,
      { ...config, generatedStrategy: adStrategyPrompt },
      workflowResult?.workflowId
    )

    logger.info('Advertising Agent deployed', { clientId, deploymentId: deployment.id })

    return { id: deployment.id, n8nWorkflowId: workflowResult?.workflowId }
  }
}
