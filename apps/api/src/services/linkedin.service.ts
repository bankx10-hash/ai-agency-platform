import axios, { AxiosInstance } from 'axios'
import { logger } from '../utils/logger'

interface LinkedInProspect {
  profileUrl: string
  firstName: string
  lastName: string
  headline?: string
  company?: string
  location?: string
}

export interface ProspectSearchParams {
  titleKeywords?: string[]
  location?: string
  limit?: number
}

export class LinkedInService {
  private apollo: AxiosInstance
  private phantombuster: AxiosInstance

  private readonly autoConnectPhantomId = process.env['PHANTOMBUSTER_AUTOCONNECT_ID'] || '2659791000101055'
  private readonly messageSenderPhantomId = process.env['PHANTOMBUSTER_MESSAGESENDER_ID'] || '8760957881537511'

  constructor() {
    const apolloKey = process.env['APOLLO_API_KEY']
    if (!apolloKey) logger.warn('APOLLO_API_KEY not set — LinkedIn prospect search will be unavailable')

    const phantombusterKey = process.env['PHANTOMBUSTER_API_KEY']
    if (!phantombusterKey) logger.warn('PHANTOMBUSTER_API_KEY not set — LinkedIn automation will be unavailable')

    this.apollo = axios.create({
      baseURL: 'https://api.apollo.io/v1',
      headers: {
        'X-Api-Key': apolloKey || 'not-configured',
        'Content-Type': 'application/json'
      }
    })

    this.apollo.interceptors.response.use(
      (response) => response,
      (error) => {
        logger.error('Apollo API error', { status: error.response?.status, data: error.response?.data })
        throw error
      }
    )

    this.phantombuster = axios.create({
      baseURL: 'https://api.phantombuster.com/api/v2',
      headers: {
        'X-Phantombuster-Key': phantombusterKey || 'not-configured',
        'Content-Type': 'application/json'
      }
    })

    this.phantombuster.interceptors.response.use(
      (response) => response,
      (error) => {
        logger.error('Phantombuster API error', { status: error.response?.status, data: error.response?.data })
        throw error
      }
    )
  }

  async searchProspects(params: ProspectSearchParams): Promise<LinkedInProspect[]> {
    const limit = params.limit ?? 20
    const titles = params.titleKeywords || ['CEO', 'Business Owner', 'Director', 'Marketing Director']

    const response = await this.apollo.post('/mixed_people/search', {
      person_titles: titles,
      person_locations: params.location ? [params.location] : ['Australia'],
      per_page: limit,
      page: 1
    })

    const people = response.data.people || []
    logger.info('Apollo prospect search completed', { count: people.length })

    return people.map((p: Record<string, unknown> & { organization?: Record<string, string> }) => ({
      profileUrl: p.linkedin_url as string || '',
      firstName: p.first_name as string || '',
      lastName: p.last_name as string || '',
      headline: p.headline as string,
      company: p.organization?.name,
      location: p.city as string
    })).filter((p: LinkedInProspect) => p.profileUrl)
  }

  async sendConnectionRequests(
    sessionCookie: string,
    profileUrls: string[],
    message: string
  ): Promise<{ containerId: string }> {
    const response = await this.phantombuster.post(`/agents/${this.autoConnectPhantomId}/launch`, {
      argument: {
        sessionCookie,
        spreadsheetUrl: profileUrls.join('\n'),
        message,
        numberOfAddsPerLaunch: Math.min(profileUrls.length, 20)
      }
    })

    logger.info('LinkedIn Auto Connect launched', { count: profileUrls.length })
    return { containerId: response.data.containerId }
  }

  async sendFollowUpMessages(
    sessionCookie: string,
    profileUrls: string[],
    message: string
  ): Promise<{ containerId: string }> {
    const response = await this.phantombuster.post(`/agents/${this.messageSenderPhantomId}/launch`, {
      argument: {
        sessionCookie,
        spreadsheetUrl: profileUrls.join('\n'),
        message,
        numberOfLinesPerLaunch: Math.min(profileUrls.length, 20)
      }
    })

    logger.info('LinkedIn Message Sender launched', { count: profileUrls.length })
    return { containerId: response.data.containerId }
  }

  async getPhantomOutput(phantomId: string, containerId: string): Promise<unknown> {
    const response = await this.phantombuster.get(`/agents/${phantomId}/fetch-output`, {
      params: { containerId }
    })
    return response.data
  }
}

export const linkedInService = new LinkedInService()
