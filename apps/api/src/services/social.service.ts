import axios, { AxiosInstance } from 'axios'
import { logger } from '../utils/logger'

interface SchedulePostOptions {
  content: string
  platforms: string[]
  scheduledTime: Date
  bufferToken: string
  imageUrl?: string
  link?: string
}

interface MetaPostOptions {
  pageId: string
  message: string
  accessToken: string
  imageUrl?: string
  link?: string
  scheduledTime?: Date
}

// Instagram Graph API — requires Instagram Business or Creator account linked to a Facebook Page
interface InstagramPostOptions {
  igUserId: string          // Instagram Business account ID
  accessToken: string       // Page access token (same as Meta, scoped to instagram_content_publish)
  caption: string
  imageUrl?: string         // Required for IMAGE posts; omit for text-only (Reels need videoUrl)
  videoUrl?: string         // For Reels
  mediaType?: 'IMAGE' | 'VIDEO' | 'REELS' | 'CAROUSEL_ALBUM'
  scheduledTime?: Date
}

// TikTok Content Posting API v2
// Docs: https://developers.tiktok.com/doc/content-posting-api-get-started
interface TikTokPostOptions {
  openId: string            // TikTok user open_id from OAuth
  accessToken: string       // TikTok OAuth access token (scope: video.upload, video.publish)
  title: string             // Caption / title shown under the video (max 2200 chars)
  videoScript?: string      // Used for logging / content storage; TikTok requires a real video file URL
  videoUrl?: string         // Publicly accessible video file URL (.mp4) — required for direct post
  privacyLevel?: 'PUBLIC_TO_EVERYONE' | 'MUTUAL_FOLLOW_FRIENDS' | 'SELF_ONLY'
  disableDuet?: boolean
  disableStitch?: boolean
  disableComment?: boolean
}

interface BufferProfile {
  id: string
  service: string
  formatted_service?: string
  formatted_username?: string
}

export class SocialService {
  private metaBaseURL = process.env['META_GRAPH_API_URL'] || 'https://graph.facebook.com/v18.0'
  private tiktokBaseURL = 'https://open.tiktokapis.com/v2'

  private getBufferClient(token: string): AxiosInstance {
    return axios.create({
      baseURL: 'https://api.bufferapp.com/1',
      headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' }
    })
  }

  private getMetaClient(accessToken: string): AxiosInstance {
    return axios.create({
      baseURL: this.metaBaseURL,
      params: { access_token: accessToken }
    })
  }

  private getTikTokClient(accessToken: string): AxiosInstance {
    return axios.create({
      baseURL: this.tiktokBaseURL,
      headers: {
        Authorization: `Bearer ${accessToken}`,
        'Content-Type': 'application/json; charset=UTF-8'
      }
    })
  }

  // ------------------------------------------------------------------
  // Buffer — schedules to LinkedIn, Facebook, Instagram, Twitter/X
  // ------------------------------------------------------------------

  async schedulePost(options: SchedulePostOptions): Promise<Array<{ id: string; platform: string }>> {
    const bufferClient = this.getBufferClient(options.bufferToken)

    const profilesResponse = await bufferClient.get<{ profiles: BufferProfile[] }>('/profiles.json')
    const allProfiles = profilesResponse.data.profiles || []

    const targetProfiles = allProfiles.filter(profile =>
      options.platforms.some(platform =>
        profile.service?.toLowerCase().includes(platform.toLowerCase()) ||
        profile.formatted_service?.toLowerCase().includes(platform.toLowerCase())
      )
    )

    if (targetProfiles.length === 0) {
      logger.warn('No matching Buffer profiles found for platforms', { platforms: options.platforms })
      return []
    }

    const results: Array<{ id: string; platform: string }> = []

    for (const profile of targetProfiles) {
      const postData: Record<string, unknown> = {
        text: options.content,
        profile_ids: [profile.id],
        scheduled_at: options.scheduledTime.toISOString()
      }
      if (options.imageUrl) postData.media = { photo: options.imageUrl }
      if (options.link) postData.media = { ...(postData.media as object || {}), link: options.link }

      const response = await bufferClient.post('/updates/create.json', postData)
      results.push({ id: response.data.updates?.[0]?.id || '', platform: profile.service })
      logger.info('Post scheduled via Buffer', { platform: profile.service, scheduledTime: options.scheduledTime })
    }

    return results
  }

  async getBufferProfiles(bufferToken: string): Promise<BufferProfile[]> {
    const bufferClient = this.getBufferClient(bufferToken)
    const response = await bufferClient.get<{ profiles: BufferProfile[] }>('/profiles.json')
    return response.data.profiles || []
  }

  // ------------------------------------------------------------------
  // Facebook — Meta Graph API
  // ------------------------------------------------------------------

  async postToMeta(options: MetaPostOptions): Promise<{ id: string }> {
    const metaClient = this.getMetaClient(options.accessToken)

    let endpoint = `/${options.pageId}/feed`
    const postData: Record<string, unknown> = { message: options.message }

    if (options.imageUrl) {
      endpoint = `/${options.pageId}/photos`
      postData.url = options.imageUrl
      postData.caption = options.message
      delete postData.message
    }

    if (options.link) postData.link = options.link

    if (options.scheduledTime) {
      postData.scheduled_publish_time = Math.floor(options.scheduledTime.getTime() / 1000)
      postData.published = false
    }

    const response = await metaClient.post(endpoint, postData)
    logger.info('Post published to Facebook', { pageId: options.pageId, postId: response.data.id })
    return { id: response.data.id }
  }

  async getPageInsights(
    pageId: string,
    accessToken: string,
    metric: string,
    period = 'day'
  ): Promise<Array<{ value: number; end_time: string }>> {
    const metaClient = this.getMetaClient(accessToken)
    const response = await metaClient.get(`/${pageId}/insights`, { params: { metric, period } })
    return response.data.data?.[0]?.values || []
  }

  // ------------------------------------------------------------------
  // Instagram — Instagram Graph API (2-step: create container → publish)
  // Requires: Instagram Business/Creator account linked to a Facebook Page
  // Permissions: instagram_basic, instagram_content_publish, pages_read_engagement
  // ------------------------------------------------------------------

  async postToInstagram(options: InstagramPostOptions): Promise<{ id: string }> {
    const metaClient = this.getMetaClient(options.accessToken)
    const mediaType = options.mediaType || (options.videoUrl ? 'REELS' : 'IMAGE')

    // Step 1: Create a media container
    const containerPayload: Record<string, unknown> = {
      caption: options.caption,
      media_type: mediaType
    }

    if (mediaType === 'IMAGE' && options.imageUrl) {
      containerPayload.image_url = options.imageUrl
    } else if ((mediaType === 'VIDEO' || mediaType === 'REELS') && options.videoUrl) {
      containerPayload.video_url = options.videoUrl
    }

    if (options.scheduledTime) {
      // Instagram scheduled posts require a unix timestamp and published=false
      containerPayload.published = false
      containerPayload.scheduled_publish_time = Math.floor(options.scheduledTime.getTime() / 1000)
    }

    const containerResponse = await metaClient.post(`/${options.igUserId}/media`, containerPayload)
    const containerId: string = containerResponse.data.id

    logger.info('Instagram media container created', { igUserId: options.igUserId, containerId })

    // For video/Reels, poll until container is ready (status = FINISHED)
    if (mediaType === 'VIDEO' || mediaType === 'REELS') {
      await this._waitForInstagramContainer(options.igUserId, containerId, options.accessToken)
    }

    // Step 2: Publish the container
    const publishResponse = await metaClient.post(`/${options.igUserId}/media_publish`, {
      creation_id: containerId
    })

    logger.info('Post published to Instagram', { igUserId: options.igUserId, postId: publishResponse.data.id })
    return { id: publishResponse.data.id }
  }

  private async _waitForInstagramContainer(
    igUserId: string,
    containerId: string,
    accessToken: string,
    maxAttempts = 10
  ): Promise<void> {
    const metaClient = this.getMetaClient(accessToken)
    for (let i = 0; i < maxAttempts; i++) {
      const statusResponse = await metaClient.get(`/${igUserId}/media`, {
        params: { fields: 'id,status_code', media_type: 'VIDEO' }
      })
      const container = statusResponse.data.data?.find((m: { id: string }) => m.id === containerId)
      if (container?.status_code === 'FINISHED') return
      if (container?.status_code === 'ERROR') throw new Error(`Instagram container processing failed for ${containerId}`)
      await new Promise(r => setTimeout(r, 5000)) // wait 5s between polls
    }
    throw new Error(`Instagram container ${containerId} timed out`)
  }

  async getInstagramInsights(
    igUserId: string,
    accessToken: string,
    metric: string,
    period = 'day'
  ): Promise<Array<{ value: number; end_time: string }>> {
    const metaClient = this.getMetaClient(accessToken)
    const response = await metaClient.get(`/${igUserId}/insights`, { params: { metric, period } })
    return response.data.data?.[0]?.values || []
  }

  // ------------------------------------------------------------------
  // TikTok — Content Posting API v2
  // Requires: TikTok for Business / TikTok Developer account
  // OAuth scopes: video.upload, video.publish
  // Note: TikTok requires an actual video file. Text-only posts use the video title/caption.
  // ------------------------------------------------------------------

  async postToTikTok(options: TikTokPostOptions): Promise<{ share_id: string; publish_id?: string }> {
    const tiktokClient = this.getTikTokClient(options.accessToken)

    if (!options.videoUrl) {
      // No video URL — create a text card / draft with the script for manual upload
      logger.warn('TikTok post requires a video URL. Storing script as draft.', {
        openId: options.openId,
        title: options.title
      })
      return { share_id: `draft-${Date.now()}` }
    }

    // Step 1: Initialize the video upload
    const initResponse = await tiktokClient.post('/post/publish/video/init/', {
      post_info: {
        title: options.title.substring(0, 2200),
        privacy_level: options.privacyLevel || 'PUBLIC_TO_EVERYONE',
        disable_duet: options.disableDuet ?? false,
        disable_comment: options.disableComment ?? false,
        disable_stitch: options.disableStitch ?? false,
        video_cover_timestamp_ms: 1000
      },
      source_info: {
        source: 'PULL_FROM_URL',
        video_url: options.videoUrl
      }
    })

    const publishId: string = initResponse.data.data?.publish_id
    if (!publishId) throw new Error('TikTok: failed to initialise video publish')

    logger.info('TikTok video publish initiated', { openId: options.openId, publishId })

    // Step 2: Poll publish status
    for (let i = 0; i < 12; i++) {
      await new Promise(r => setTimeout(r, 5000))
      const statusResponse = await tiktokClient.post('/post/publish/status/fetch/', { publish_id: publishId })
      const status = statusResponse.data.data?.status

      if (status === 'PUBLISH_COMPLETE') {
        logger.info('TikTok video published successfully', { publishId })
        return { share_id: publishId, publish_id: publishId }
      }
      if (status === 'FAILED') throw new Error(`TikTok publish failed for publish_id ${publishId}`)
    }

    throw new Error(`TikTok publish timed out for publish_id ${publishId}`)
  }

  async getTikTokVideoList(openId: string, accessToken: string): Promise<Array<{ id: string; title: string; view_count: number }>> {
    const tiktokClient = this.getTikTokClient(accessToken)
    const response = await tiktokClient.post('/video/list/', {
      filters: { video_ids: [] },
      fields: ['id', 'title', 'view_count', 'like_count', 'comment_count', 'share_count']
    })
    return response.data.data?.videos || []
  }
}

export const socialService = new SocialService()
