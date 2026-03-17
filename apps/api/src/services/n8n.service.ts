import axios, { AxiosInstance } from 'axios'
import fs from 'fs'
import path from 'path'
import { logger } from '../utils/logger'
import { WorkflowDeployConfig, WorkflowDeployResult, WorkflowStatus } from '../types/workflow.types'

export class N8NService {
  private client: AxiosInstance

  constructor() {
    const baseURL = process.env['N8N_BASE_URL'] || 'http://localhost:5678'
    const apiKey = process.env['N8N_API_KEY']

    if (!apiKey) {
      logger.warn('N8N_API_KEY not set — workflow automation features will be unavailable')
    }

    this.client = axios.create({
      baseURL: `${baseURL}/api/v1`,
      headers: {
        'X-N8N-API-KEY': apiKey || 'not-configured',
        'Content-Type': 'application/json'
      }
    })

    this.client.interceptors.response.use(
      (response) => response,
      (error) => {
        logger.error('N8N API error', {
          status: error.response?.status,
          data: error.response?.data,
          url: error.config?.url
        })
        throw error
      }
    )
  }

  private loadWorkflowTemplate(templateName: string): Record<string, unknown> {
    const templatePath = path.join(__dirname, '..', 'workflows', `${templateName}.workflow.json`)

    if (!fs.existsSync(templatePath)) {
      throw new Error(`Workflow template not found: ${templateName}`)
    }

    const content = fs.readFileSync(templatePath, 'utf-8')
    return JSON.parse(content)
  }

  private injectVariables(
    workflow: Record<string, unknown>,
    config: WorkflowDeployConfig
  ): Record<string, unknown> {
    let workflowStr = JSON.stringify(workflow)

    const replacements: Record<string, string> = {
      '{{CLIENT_ID}}': config.clientId,
      '{{LOCATION_ID}}': config.locationId || '',
      '{{AGENT_PROMPT}}': (config.agentPrompt || '').replace(/\\/g, '\\\\').replace(/"/g, '\\"'),
      '{{WEBHOOK_URL}}': config.webhookUrl || '',
      '{{PHONE_NUMBER}}': config.phoneNumber || '',
      '{{CALENDAR_ID}}': config.calendarId || '',
      '{{PIPELINE_ID}}': config.pipelineId || '',
      '{{API_KEY}}': config.apiKey || '',
      '{{BUSINESS_NAME}}': config.businessName || '',
      '{{ICP_DESCRIPTION}}': config.icpDescription?.replace(/\\/g, '\\\\').replace(/"/g, '\\"') || ''
    }

    for (const [placeholder, value] of Object.entries(replacements)) {
      workflowStr = workflowStr.replaceAll(placeholder, value)
    }

    return JSON.parse(workflowStr)
  }

  async deployWorkflow(
    templateName: string,
    clientConfig: WorkflowDeployConfig
  ): Promise<WorkflowDeployResult> {
    const template = this.loadWorkflowTemplate(templateName)
    const workflow = this.injectVariables(template, clientConfig)

    const workflowName = `[${clientConfig.clientId}] ${(workflow as { name?: string }).name || templateName}`
    const deployPayload = {
      ...workflow,
      name: workflowName,
      active: false,
      tags: [clientConfig.clientId, templateName]
    }

    const createResponse = await this.client.post('/workflows', deployPayload)
    const workflowId = createResponse.data.id

    await this.client.patch(`/workflows/${workflowId}/activate`)

    logger.info('N8N workflow deployed', { workflowId, templateName, clientId: clientConfig.clientId })

    return {
      workflowId,
      active: true,
      webhookUrl: `${process.env['N8N_BASE_URL']}/webhook/${workflowId}`
    }
  }

  async pauseWorkflow(workflowId: string): Promise<void> {
    await this.client.patch(`/workflows/${workflowId}/deactivate`)
    logger.info('N8N workflow paused', { workflowId })
  }

  async resumeWorkflow(workflowId: string): Promise<void> {
    await this.client.patch(`/workflows/${workflowId}/activate`)
    logger.info('N8N workflow resumed', { workflowId })
  }

  async deleteWorkflow(workflowId: string): Promise<void> {
    await this.client.delete(`/workflows/${workflowId}`)
    logger.info('N8N workflow deleted', { workflowId })
  }

  async getWorkflowStatus(workflowId: string): Promise<WorkflowStatus> {
    const workflowResponse = await this.client.get(`/workflows/${workflowId}`)
    const executionsResponse = await this.client.get('/executions', {
      params: {
        workflowId,
        limit: 1
      }
    }).catch(() => ({ data: { data: [] } }))

    const lastExecution = executionsResponse.data.data?.[0]

    return {
      id: workflowResponse.data.id,
      name: workflowResponse.data.name,
      active: workflowResponse.data.active,
      lastExecution: lastExecution ? {
        id: lastExecution.id,
        status: lastExecution.status,
        startedAt: lastExecution.startedAt,
        finishedAt: lastExecution.stoppedAt
      } : undefined
    }
  }

  async triggerWorkflow(workflowId: string, payload: Record<string, unknown>): Promise<void> {
    await this.client.post(`/workflows/${workflowId}/execute`, {
      data: payload
    })
    logger.info('N8N workflow triggered', { workflowId })
  }

  async listClientWorkflows(clientId: string): Promise<Array<{ id: string; name: string; active: boolean }>> {
    const response = await this.client.get('/workflows', {
      params: {
        tags: clientId
      }
    })

    return (response.data.data || []).filter(
      (w: { name: string }) => w.name.includes(`[${clientId}]`)
    )
  }
}

export const n8nService = new N8NService()
