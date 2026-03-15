export interface N8NWorkflow {
  id?: string
  name: string
  active: boolean
  nodes: N8NNode[]
  connections: Record<string, N8NConnection>
  settings?: Record<string, unknown>
  staticData?: Record<string, unknown>
  tags?: string[]
}

export interface N8NNode {
  id: string
  name: string
  type: string
  typeVersion: number
  position: [number, number]
  parameters: Record<string, unknown>
  credentials?: Record<string, unknown>
  webhookId?: string
}

export interface N8NConnection {
  main: Array<Array<{ node: string; type: string; index: number }>>
}

export interface WorkflowVariable {
  name: string
  value: string
  placeholder: string
}

export interface WorkflowDeployConfig {
  clientId: string
  locationId: string
  agentPrompt: string
  webhookUrl?: string
  phoneNumber?: string
  calendarId?: string
  pipelineId?: string
  apiKey?: string
  businessName?: string
  icpDescription?: string
}

export interface WorkflowDeployResult {
  workflowId: string
  webhookUrl?: string
  active: boolean
}

export interface N8NApiResponse<T> {
  data: T
  nextCursor?: string
}

export interface WorkflowStatus {
  id: string
  name: string
  active: boolean
  lastExecution?: {
    id: string
    status: 'success' | 'error' | 'waiting'
    startedAt: string
    finishedAt?: string
  }
}
