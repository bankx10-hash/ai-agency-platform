import axios, { AxiosInstance } from 'axios'
import { logger } from '../utils/logger'

interface PhantombusterAgent {
  id: string
  name: string
  status: string
}

interface LinkedInProspect {
  profileUrl: string
  firstName: string
  lastName: string
  headline?: string
  company?: string
  location?: string
  connectionDegree?: string
}

export interface ProspectSearchParams {
  titleKeyword?: string
  company?: string
  location?: string
  limit?: number
}

export class LinkedInService {
  private apollo: AxiosInstance
  private phantombuster: AxiosInstance

  constructor() {
    const apolloKey = process.env.APOLLO_API_KEY
    if (!apolloKey) {
      logger.warn('APOLLO_API_KEY not set — LinkedIn prospect search will be unavailable')
    }

    const phantombusterKey = process.env.PHANTOMBUSTER_API_KEY
    if (!phantombusterKey) {
      logger.warn('PHANTOMBUSTER_API_KEY not set — LinkedIn connection/messaging will be unavailable')
    }

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
        logger.error('Apollo API error', {
          status: error.response?.status,
          data: error.response?.data
        })
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
        logger.error('Phantombuster API error', {
          status: error.response?.status,
          data: error.response?.data
        })
        throw error
      }
    )
  }

  async searchProspects(params: ProspectSearchParams): Promise<LinkedInProspect[]> {
    const limit = params.limit ?? 50
    const collected: any[] = []
    let page = 1

    do {
      const response = await this.apollo.post('/mixed_people/search', {
        person_titles: params.titleKeyword ? [params.titleKeyword] : undefined,
        organization_names: params.company ? [params.company] : undefined,
        person_locations: params.location ? [params.location] : undefined,
        per_page: 25,
        page
      })

      const people: any[] = response.data.people || []
      collected.push(...people)
      page++

      if (people.length < 25) break
    } while (collected.length < limit)

    const prospects = collected.slice(0, limit)

    logger.info('Apollo LinkedIn search completed', { count: prospects.length })

    return prospects.map((p) => ({
      profileUrl: p.linkedin_url || '',
      firstName: p.first_name || '',
      lastName: p.last_name || '',
      headline: p.headline,
      company: p.organization?.name,
      location: p.city
    }))
  }

  async sendConnectionRequest(
    sessionCookie: string,
    profileUrl: string,
    message: string
  ): Promise<{ containerId: string }> {
    const agentsResponse = await this.phantombuster.get('/agents')
    const agents: PhantombusterAgent[] = agentsResponse.data.agents || []

    const connectionAgent = agents.find(a => a.name.includes('LinkedIn Auto Connect'))

    if (!connectionAgent) {
      throw new Error('LinkedIn Auto Connect agent not found in Phantombuster')
    }

    const launchResponse = await this.phantombuster.post(`/agents/${connectionAgent.id}/launch`, {
      argument: {
        sessionCookie,
        spreadsheetUrl: profileUrl,
        message,
        numberOfAddsPerLaunch: 1
      }
    })

    logger.info('LinkedIn connection request sent', { profileUrl })

    return { containerId: launchResponse.data.containerId }
  }

  async sendFollowUpMessage(
    sessionCookie: string,
    profileUrl: string,
    message: string,
    agentId: string
  ): Promise<void> {
    await this.phantombuster.post(`/agents/${agentId}/launch`, {
      argument: {
        sessionCookie,
        profileUrl,
        message
      }
    })

    logger.info('LinkedIn follow-up message sent', { profileUrl })
  }
}

export const linkedInService = new LinkedInService()
