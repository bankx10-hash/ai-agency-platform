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
  [key: string]: unknown
}

export interface WorkflowDeployResult {
  workflowId: string
  active: boolean
  webhookUrl: string
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
