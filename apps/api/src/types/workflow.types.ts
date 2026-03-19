export interface WorkflowDeployConfig {
  clientId: string
  locationId?: string
  agentPrompt?: string
  webhookUrl?: string
  phoneNumber?: string
  calendarId?: string
  pipelineId?: string
  apiKey?: string
  businessName?: string
  icpDescription?: string
  platforms?: string
  bufferToken?: string
  metaAdAccountId?: string
  metaAccessToken?: string
  metaPageId?: string
  metaDefaultAdsetId?: string
  googleRefreshToken?: string
  googleAdsCustomerId?: string
  adLinkUrl?: string
  paymentLink?: string
  contractLink?: string
  retellAgentId?: string
  [key: string]: unknown
}

export interface WorkflowDeployResult {
  workflowId: string
  active: boolean
  webhookUrl: string
  testResult?: {
    success: boolean
    executionId?: string
    status?: string
    error?: string
  }
}

export interface WorkflowStatus {
  id: string
  name: string
  active: boolean
  lastExecution?: {
    id: string
    status: string
    startedAt: string
    finishedAt: string
  }
}
