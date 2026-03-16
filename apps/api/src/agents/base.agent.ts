import Anthropic from '@anthropic-ai/sdk'
import { PrismaClient, Prisma } from '@prisma/client'
import { AgentType, AgentStatus } from '../../../packages/shared/types/agent.types'
import { n8nService } from '../services/n8n.service'
import { logger } from '../utils/logger'

const prisma = new PrismaClient()
const anthropic = new Anthropic({ apiKey: process.env['ANTHROPIC_API_KEY'] })

export abstract class BaseAgent {
  abstract agentType: AgentType

  abstract generatePrompt(config: Record<string, unknown>, contactData?: Record<string, unknown>): string

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  abstract deploy(clientId: string, config: any): Promise<{
    id: string
    n8nWorkflowId?: string
  }>

  async teardown(deploymentId: string): Promise<void> {
    const deployment = await prisma.agentDeployment.findUnique({
      where: { id: deploymentId }
    })

    if (!deployment) {
      throw new Error(`Deployment not found: ${deploymentId}`)
    }

    if (deployment.n8nWorkflowId) {
      try {
        await n8nService.pauseWorkflow(deployment.n8nWorkflowId)
        logger.info('N8N workflow paused', { deploymentId, workflowId: deployment.n8nWorkflowId })
      } catch (error) {
        logger.error('Failed to pause N8N workflow', { deploymentId, error })
      }
    }

    await prisma.agentDeployment.update({
      where: { id: deploymentId },
      data: { status: AgentStatus.INACTIVE }
    })

    logger.info('Agent torn down', { deploymentId, agentType: deployment.agentType })
  }

  async callClaude(prompt: string, systemPrompt?: string): Promise<string> {
    const messages: Anthropic.MessageParam[] = [
      { role: 'user', content: prompt }
    ]

    const response = await anthropic.messages.create({
      model: 'claude-sonnet-4-20250514',
      max_tokens: 2048,
      system: systemPrompt || 'You are an expert AI business automation assistant. Generate professional, human-sounding content.',
      messages
    })

    const content = response.content[0]
    if (content.type !== 'text') {
      throw new Error('Unexpected response type from Claude')
    }

    return content.text
  }

  async updateMetrics(deploymentId: string, metrics: Record<string, unknown>): Promise<void> {
    const deployment = await prisma.agentDeployment.findUnique({
      where: { id: deploymentId }
    })

    if (!deployment) {
      throw new Error(`Deployment not found: ${deploymentId}`)
    }

    const existingMetrics = (deployment.metrics || {}) as Record<string, unknown>

    await prisma.agentDeployment.update({
      where: { id: deploymentId },
      data: {
        metrics: {
          ...existingMetrics,
          ...metrics,
          lastUpdatedAt: new Date().toISOString()
        } as Prisma.InputJsonValue
      }
    })

    logger.debug('Agent metrics updated', { deploymentId, metrics })
  }

  protected async createDeploymentRecord(
    clientId: string,
    config: Record<string, unknown>,
    n8nWorkflowId?: string
  ): Promise<{ id: string }> {
    const deployment = await prisma.agentDeployment.create({
      data: {
        clientId,
        agentType: this.agentType,
        status: AgentStatus.ACTIVE,
        n8nWorkflowId,
        config: config as Prisma.InputJsonValue,
        metrics: {
          totalLeads: 0,
          callsMade: 0,
          appointmentsBooked: 0,
          emailsSent: 0,
          errors: 0,
          createdAt: new Date().toISOString()
        } as Prisma.InputJsonValue
      }
    })

    return { id: deployment.id }
  }
}
