import axios, { AxiosInstance } from 'axios'
import { logger } from '../utils/logger'

interface PhantombusterAgent {
  id: string
  name: string
  status: string
}

interface SearchProspectsResult {
  containerId: string
  prospects: LinkedInProspect[]
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

interface ContainerResult {
  containerId: string
  status: string
  output: LinkedInProspect[]
  error?: string
}

export class LinkedInService {
  private client: AxiosInstance

  constructor() {
    const apiKey = process.env.PHANTOMBUSTER_API_KEY
    if (!apiKey) {
      logger.warn('PHANTOMBUSTER_API_KEY not set — LinkedIn automation features will be unavailable')
    }

    this.client = axios.create({
      baseURL: 'https://api.phantombuster.com/api/v2',
      headers: {
        'X-Phantombuster-Key': apiKey || 'not-configured',
        'Content-Type': 'application/json'
      }
    })

    this.client.interceptors.response.use(
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

  async searchProspects(
    agentId: string,
    searchUrl: string,
    limit: number = 50
  ): Promise<SearchProspectsResult> {
    const launchResponse = await this.client.post(`/agents/${agentId}/launch`, {
      argument: {
        searchUrl,
        numberOfProfiles: limit,
        scraperSettings: {
          maxResults: limit
        }
      }
    })

    const containerId = launchResponse.data.containerId

    logger.info('Phantombuster LinkedIn search launched', { agentId, containerId, searchUrl })

    const prospects = await this.pollForResults(containerId)

    return {
      containerId,
      prospects
    }
  }

  private async pollForResults(
    containerId: string,
    maxAttempts: number = 30
  ): Promise<LinkedInProspect[]> {
    for (let i = 0; i < maxAttempts; i++) {
      await new Promise(resolve => setTimeout(resolve, 10000))

      const result = await this.getResults(containerId)

      if (result.status === 'finished') {
        return result.output
      }

      if (result.status === 'error') {
        throw new Error(`Phantombuster container failed: ${result.error}`)
      }
    }

    logger.warn('Phantombuster container did not finish in time', { containerId })
    return []
  }

  async sendConnectionRequest(
    sessionCookie: string,
    profileUrl: string,
    message: string
  ): Promise<{ containerId: string }> {
    const agentsResponse = await this.client.get('/agents')
    const agents: PhantombusterAgent[] = agentsResponse.data.agents || []

    const connectionAgent = agents.find(a => a.name.includes('LinkedIn Auto Connect'))

    if (!connectionAgent) {
      throw new Error('LinkedIn Auto Connect agent not found in Phantombuster')
    }

    const launchResponse = await this.client.post(`/agents/${connectionAgent.id}/launch`, {
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

  async getResults(containerId: string): Promise<ContainerResult> {
    const response = await this.client.get(`/containers/${containerId}`, {
      params: {
        mode: 'most-recent'
      }
    })

    const container = response.data

    return {
      containerId,
      status: container.status,
      output: container.output ? JSON.parse(container.output) : [],
      error: container.error
    }
  }

  async sendFollowUpMessage(
    sessionCookie: string,
    profileUrl: string,
    message: string,
    agentId: string
  ): Promise<void> {
    await this.client.post(`/agents/${agentId}/launch`, {
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
