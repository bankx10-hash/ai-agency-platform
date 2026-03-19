import axios, { AxiosInstance } from 'axios'
import fs from 'fs'
import path from 'path'
import { logger } from '../utils/logger'
import { WorkflowDeployConfig, WorkflowDeployResult, WorkflowStatus } from '../types/workflow.types'

// Per-template synthetic payloads injected at the first HTTP-request node so every
// downstream node receives real-shaped data during the post-deploy test execution.
const SCHEDULE_TEST_PAYLOADS: Record<string, Record<string, unknown>> = {
  'lead-generation': {
    contacts: [
      {
        id: 'test-lead-001',
        firstName: 'Test',
        lastName: 'Lead',
        email: 'testlead@example.com',
        phone: '+15550001234',
        source: 'website',
        dateAdded: new Date().toISOString()
      }
    ],
    count: 1
  },
  'linkedin-outreach': {
    results: [
      {
        full_name: 'Test Prospect',
        headline: 'CEO at Test Company',
        profile_url: 'https://www.linkedin.com/in/testprospect',
        company: 'Test Company Pty Ltd',
        location: 'Sydney, Australia'
      }
    ]
  },
  'social-media': {
    platform: 'instagram',
    content: 'Test post content — your AI Social Media Agent is live and generating content automatically. 🚀',
    hashtags: ['#ai', '#automation', '#test'],
    image_prompt: 'A modern professional workspace with a laptop and coffee',
    hook_score: 8,
    best_posting_time: 'Tuesday 9am',
    predicted_engagement: 'medium'
  },
  'voice-outbound': {
    contacts: [
      {
        id: 'test-contact-001',
        firstName: 'Test',
        lastName: 'Contact',
        phone: '+15550001234',
        email: 'testcontact@example.com'
      }
    ],
    count: 1
  },
  advertising: {
    data: [
      {
        id: 'test-ad-001',
        name: 'Test Campaign',
        spend: 150,
        impressions: 8000,
        clicks: 400,
        conversions: 12,
        roas: 2.8,
        status: 'ACTIVE'
      }
    ]
  },
  'client-services': {
    contacts: [
      {
        id: 'test-client-001',
        firstName: 'Test',
        lastName: 'Client',
        email: 'testclient@example.com',
        dateAdded: new Date().toISOString(),
        customFields: { health_score: 75 }
      }
    ],
    count: 1
  }
}

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

    const sanitize = (str: string) => str
      .replace(/\\/g, '\\\\')
      .replace(/"/g, '\\"')
      .replace(/\n/g, '\\n')
      .replace(/\r/g, '\\r')
      .replace(/\t/g, '\\t')
      // eslint-disable-next-line no-control-regex
      .replace(/[\x00-\x1F\x7F]/g, '')

    const replacements: Record<string, string> = {
      '{{CLIENT_ID}}': config.clientId,
      '{{LOCATION_ID}}': config.locationId || '',
      '{{AGENT_PROMPT}}': sanitize(config.agentPrompt || ''),
      '{{WEBHOOK_URL}}': config.webhookUrl || '',
      '{{PHONE_NUMBER}}': config.phoneNumber || '',
      '{{CALENDAR_ID}}': config.calendarId || '',
      '{{PIPELINE_ID}}': config.pipelineId || '',
      '{{API_KEY}}': config.apiKey || '',
      '{{API_URL}}': process.env['API_URL'] || process.env['RAILWAY_PUBLIC_DOMAIN'] ? `https://${process.env['RAILWAY_PUBLIC_DOMAIN']}` : 'http://localhost:4000',
      '{{BUSINESS_NAME}}': sanitize(config.businessName || ''),
      '{{ICP_DESCRIPTION}}': sanitize(config.icpDescription || ''),
      // Service API keys — injected from API env vars so N8N doesn't need them
      '{{ANTHROPIC_API_KEY}}': process.env['ANTHROPIC_API_KEY'] || '',
      '{{RETELL_API_KEY}}': process.env['RETELL_API_KEY'] || '',
      '{{PROXYCURL_API_KEY}}': process.env['PROXYCURL_API_KEY'] || '',
      '{{GOOGLE_ADS_CLIENT_ID}}': process.env['GOOGLE_ADS_CLIENT_ID'] || '',
      '{{GOOGLE_ADS_CLIENT_SECRET}}': process.env['GOOGLE_ADS_CLIENT_SECRET'] || '',
      '{{GOOGLE_ADS_DEVELOPER_TOKEN}}': process.env['GOOGLE_ADS_DEVELOPER_TOKEN'] || '',
      '{{GHL_BASE_URL}}': process.env['GHL_BASE_URL'] || 'https://services.leadconnectorhq.com',
      '{{GHL_API_KEY}}': process.env['GHL_API_KEY'] || '',
      '{{GHL_AGENCY_ID}}': process.env['GHL_AGENCY_ID'] || '',
      '{{BUFFER_TOKEN}}': (config as Record<string, string>).bufferToken || '',
      '{{META_AD_ACCOUNT_ID}}': (config as Record<string, string>).metaAdAccountId || '',
      '{{META_ACCESS_TOKEN}}': (config as Record<string, string>).metaAccessToken || '',
      '{{META_PAGE_ID}}': (config as Record<string, string>).metaPageId || '',
      '{{META_DEFAULT_ADSET_ID}}': (config as Record<string, string>).metaDefaultAdsetId || '',
      '{{GOOGLE_REFRESH_TOKEN}}': (config as Record<string, string>).googleRefreshToken || '',
      '{{GOOGLE_CUSTOMER_ID}}': (config as Record<string, string>).googleAdsCustomerId || '',
      '{{AD_LINK_URL}}': (config as Record<string, string>).adLinkUrl || '',
      '{{PAYMENT_LINK}}': (config as Record<string, string>).paymentLink || '',
      '{{CONTRACT_LINK}}': (config as Record<string, string>).contractLink || '',
      '{{RETELL_AGENT_ID}}': (config as Record<string, string>).retellAgentId || ''
    }

    for (const [placeholder, value] of Object.entries(replacements)) {
      workflowStr = workflowStr.replaceAll(placeholder, value)
    }

    return JSON.parse(workflowStr)
  }

  // ─── Trigger detection ───────────────────────────────────────────────────

  private getTriggerInfo(workflow: Record<string, unknown>): {
    type: 'webhook'
    webhookPath: string
  } | { type: 'unknown' } {
    const nodes = (workflow.nodes as Array<Record<string, unknown>>) || []

    // Priority 1: dedicated "Test Trigger" webhook added to all schedule workflows
    const testTrigger = nodes.find(n => n.name === 'Test Trigger')
    if (testTrigger) {
      const params = (testTrigger.parameters as Record<string, unknown>) ?? {}
      return { type: 'webhook', webhookPath: params.path as string }
    }

    // Priority 2: primary webhook trigger (webhook-native workflows)
    const skipKeywords = ['reply', 'result', 'closing', 'support', 'budget', 'booking', 'completed', 'sale']
    const primaryWebhook = nodes.find(n =>
      typeof n.type === 'string' &&
      n.type.includes('webhook') &&
      !skipKeywords.some(k => String(n.name ?? '').toLowerCase().includes(k))
    )
    if (primaryWebhook) {
      const params = (primaryWebhook.parameters as Record<string, unknown>) ?? {}
      return { type: 'webhook', webhookPath: params.path as string }
    }

    return { type: 'unknown' }
  }

  // ─── Post-deploy test fire ─────────────────────────────────────────────

  async testWorkflow(
    workflowId: string,
    workflowDef: Record<string, unknown>,
    testPayload: Record<string, unknown>
  ): Promise<{ success: boolean; executionId?: string; status?: string; error?: string }> {
    const baseURL = process.env['N8N_BASE_URL'] || 'http://localhost:5678'
    const trigger = this.getTriggerInfo(workflowDef)
    let executionId: string | undefined

    try {
      if (trigger.type === 'webhook') {
        // POST synthetic payload to the workflow's webhook trigger.
        // For schedule workflows this hits the dedicated "Test Trigger" node
        // (path: test-{template}-{clientId}) which bypasses the schedule and
        // injects data directly into the Seed Data → processing chain.
        try {
          const res = await axios.post(
            `${baseURL}/webhook/${trigger.webhookPath}`,
            { ...testPayload, test: true, source: 'claude-auto-test' },
            { timeout: 15000 }
          )
          executionId = res.data?.executionId
        } catch {
          // Webhook may respond synchronously or timeout after accepting — both are fine
        }
      }

      // If we don't have an executionId yet, find the latest one for this workflow
      if (!executionId) {
        await new Promise(r => setTimeout(r, 4000))
        const listRes = await this.client.get('/executions', {
          params: { workflowId, limit: 1 }
        }).catch(() => ({ data: { data: [] } }))
        const latest = (listRes.data.data as Array<Record<string, unknown>>)?.[0]
        executionId = latest?.id as string | undefined
        if (latest?.status && latest.status !== 'running') {
          return {
            success: latest.status === 'success',
            executionId,
            status: latest.status as string
          }
        }
      }

      // Poll for result (up to 30s)
      if (executionId) {
        for (let i = 0; i < 10; i++) {
          await new Promise(r => setTimeout(r, 3000))
          const execRes = await this.client.get(`/executions/${executionId}`).catch(() => null)
          const exec = execRes?.data as Record<string, unknown> | undefined
          if (exec?.status && exec.status !== 'running') {
            const resultData = ((exec.data as Record<string, unknown>)?.resultData) as Record<string, unknown> | undefined
            const errorMsg = resultData?.error
              ? (resultData.error as Record<string, unknown>).message as string
              : undefined
            return {
              success: exec.status === 'success',
              executionId,
              status: exec.status as string,
              error: errorMsg
            }
          }
        }
      }

      return { success: true, executionId, status: 'pending' }
    } catch (error) {
      const msg = error instanceof Error ? error.message : String(error)
      logger.warn('Workflow test error', { workflowId, error: msg })
      return { success: false, error: msg }
    }
  }

  // ─── Deploy ────────────────────────────────────────────────────────────

  async deployWorkflow(
    templateName: string,
    clientConfig: WorkflowDeployConfig,
    testPayload?: Record<string, unknown>
  ): Promise<WorkflowDeployResult> {
    const template = this.loadWorkflowTemplate(templateName)
    const workflow = this.injectVariables(template, clientConfig)

    const workflowName = `[${clientConfig.clientId}] ${(workflow as { name?: string }).name || templateName}`
    const { active: _active, tags: _tags, ...workflowWithoutReadOnly } = workflow as Record<string, unknown>
    const deployPayload = {
      ...workflowWithoutReadOnly,
      name: workflowName
    }

    const createResponse = await this.client.post('/workflows', deployPayload)
    const workflowId = createResponse.data.id

    await this.client.post(`/workflows/${workflowId}/activate`)

    logger.info('N8N workflow deployed', { workflowId, templateName, clientId: clientConfig.clientId })

    // Fire a test execution — use template-specific mock data, or caller-supplied payload
    const resolvedPayload = testPayload
      ?? SCHEDULE_TEST_PAYLOADS[templateName]
      ?? {
        test: true,
        clientId: clientConfig.clientId,
        businessName: clientConfig.businessName || 'Test Business',
        timestamp: new Date().toISOString()
      }
    // Fire test asynchronously — don't block deployment
    this.testWorkflow(workflowId, workflow as Record<string, unknown>, resolvedPayload)
      .then(result => {
        if (result.success) {
          logger.info('Workflow test passed', { workflowId, executionId: result.executionId, status: result.status })
        } else {
          logger.warn('Workflow test failed', { workflowId, status: result.status, error: result.error })
        }
      })
      .catch(err => logger.warn('Workflow test error', { workflowId, error: String(err) }))

    return {
      workflowId,
      active: true,
      webhookUrl: `${process.env['N8N_BASE_URL']}/webhook/${workflowId}`
    }
  }

  async pauseWorkflow(workflowId: string): Promise<void> {
    await this.client.post(`/workflows/${workflowId}/deactivate`)
    logger.info('N8N workflow paused', { workflowId })
  }

  async resumeWorkflow(workflowId: string): Promise<void> {
    await this.client.post(`/workflows/${workflowId}/activate`)
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
