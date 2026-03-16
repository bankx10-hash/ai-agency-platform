import axios from 'axios'
import { logger } from '../utils/logger'

export interface AdsetInsight {
  id: string
  name: string
  spend: number
  impressions: number
  clicks: number
  ctr: number
  cpc: number
  roas: number
  conversions: number
}

export interface GoogleCampaignInsight {
  campaignId: string
  campaignName: string
  clicks: number
  impressions: number
  ctr: number
  conversions: number
  costMicros: number
  roas: number
}

export interface AdVariant {
  headline: string
  description: string
  cta: string
}

export class AdsService {
  private readonly metaBase = 'https://graph.facebook.com/v18.0'
  private readonly googleAdsBase = 'https://googleads.googleapis.com/v17'

  // ----------------------------------------------------------------
  // Meta Ads
  // ----------------------------------------------------------------

  async getMetaInsights(adAccountId: string, accessToken: string): Promise<AdsetInsight[]> {
    const response = await axios.get(`${this.metaBase}/act_${adAccountId}/insights`, {
      params: {
        fields: 'adset_id,adset_name,spend,impressions,clicks,ctr,cpc,purchase_roas,conversions',
        date_preset: 'yesterday',
        level: 'adset',
        access_token: accessToken
      }
    })

    return (response.data.data || []).map((row: any) => ({
      id: row.adset_id,
      name: row.adset_name,
      spend: parseFloat(row.spend || 0),
      impressions: parseInt(row.impressions || 0),
      clicks: parseInt(row.clicks || 0),
      ctr: parseFloat(row.ctr || 0),
      cpc: parseFloat(row.cpc || 0),
      roas: parseFloat(row.purchase_roas?.[0]?.value || 0),
      conversions: parseFloat(row.conversions?.[0]?.value || 0)
    }))
  }

  async pauseMetaAdset(adsetId: string, accessToken: string): Promise<void> {
    await axios.post(`${this.metaBase}/${adsetId}`, null, {
      params: { status: 'PAUSED', access_token: accessToken }
    })
    logger.info('Meta adset paused', { adsetId })
  }

  async createMetaAd(params: {
    adAccountId: string
    adsetId: string
    pageId: string
    accessToken: string
    name: string
    message: string
    headline: string
    description: string
    cta: string
    linkUrl: string
    imageUrl?: string
  }): Promise<{ adId: string; creativeId: string }> {
    // Step 1: create ad creative
    const creativeResponse = await axios.post(`${this.metaBase}/act_${params.adAccountId}/adcreatives`, {
      name: `${params.name} Creative`,
      object_story_spec: {
        page_id: params.pageId,
        link_data: {
          link: params.linkUrl,
          message: params.message,
          name: params.headline,
          description: params.description,
          call_to_action: { type: params.cta || 'LEARN_MORE' },
          ...(params.imageUrl ? { picture: params.imageUrl } : {})
        }
      },
      access_token: params.accessToken
    })

    const creativeId: string = creativeResponse.data.id
    logger.info('Meta ad creative created', { creativeId })

    // Step 2: create ad in adset
    const adResponse = await axios.post(`${this.metaBase}/act_${params.adAccountId}/ads`, {
      name: params.name,
      adset_id: params.adsetId,
      creative: { creative_id: creativeId },
      status: 'ACTIVE',
      access_token: params.accessToken
    })

    const adId: string = adResponse.data.id
    logger.info('Meta ad created', { adId, adsetId: params.adsetId })

    return { adId, creativeId }
  }

  // ----------------------------------------------------------------
  // Google Ads
  // ----------------------------------------------------------------

  async refreshGoogleToken(refreshToken: string): Promise<string> {
    const response = await axios.post('https://oauth2.googleapis.com/token', {
      client_id: process.env.GOOGLE_ADS_CLIENT_ID,
      client_secret: process.env.GOOGLE_ADS_CLIENT_SECRET,
      refresh_token: refreshToken,
      grant_type: 'refresh_token'
    })
    return response.data.access_token
  }

  async getGoogleInsights(customerId: string, accessToken: string): Promise<GoogleCampaignInsight[]> {
    const response = await axios.post(
      `${this.googleAdsBase}/customers/${customerId}/googleAds:search`,
      {
        query: `
          SELECT
            campaign.id,
            campaign.name,
            metrics.clicks,
            metrics.impressions,
            metrics.ctr,
            metrics.conversions,
            metrics.cost_micros,
            metrics.all_conversions_value
          FROM campaign
          WHERE segments.date DURING YESTERDAY
            AND campaign.status = 'ENABLED'
        `
      },
      {
        headers: {
          Authorization: `Bearer ${accessToken}`,
          'developer-token': process.env.GOOGLE_ADS_DEVELOPER_TOKEN || '',
          'Content-Type': 'application/json'
        }
      }
    )

    return (response.data.results || []).map((row: any) => ({
      campaignId: row.campaign.id,
      campaignName: row.campaign.name,
      clicks: row.metrics.clicks || 0,
      impressions: row.metrics.impressions || 0,
      ctr: row.metrics.ctr || 0,
      conversions: row.metrics.conversions || 0,
      costMicros: row.metrics.costMicros || 0,
      roas: row.metrics.costMicros > 0
        ? (row.metrics.allConversionsValue / (row.metrics.costMicros / 1_000_000))
        : 0
    }))
  }

  async pauseGoogleCampaign(customerId: string, campaignId: string, accessToken: string): Promise<void> {
    await axios.post(
      `${this.googleAdsBase}/customers/${customerId}/campaigns:mutate`,
      {
        operations: [{
          update: {
            resourceName: `customers/${customerId}/campaigns/${campaignId}`,
            status: 'PAUSED'
          },
          updateMask: 'status'
        }]
      },
      {
        headers: {
          Authorization: `Bearer ${accessToken}`,
          'developer-token': process.env.GOOGLE_ADS_DEVELOPER_TOKEN || '',
          'Content-Type': 'application/json'
        }
      }
    )
    logger.info('Google campaign paused', { customerId, campaignId })
  }
}

export const adsService = new AdsService()
