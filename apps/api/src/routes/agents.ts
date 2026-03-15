import { Router, Response } from 'express'
import { PrismaClient } from '@prisma/client'
import { authMiddleware, AuthRequest } from '../middleware/auth'
import { n8nService } from '../services/n8n.service'
import { voiceService } from '../services/voice.service'
import { createAgent } from '../agents'
import { AgentType, AgentStatus } from '../../../packages/shared/types/agent.types'
import { logger } from '../utils/logger'
import { z } from 'zod'

const router = Router()
const prisma = new PrismaClient()

const updateConfigSchema = z.object({
  config: z.record(z.unknown())
})

router.post('/:deploymentId/pause', authMiddleware, async (req: AuthRequest, res: Response): Promise<void> => {
  try {
    const { deploymentId } = req.params

    const deployment = await prisma.agentDeployment.findUnique({
      where: { id: deploymentId }
    })

    if (!deployment) {
      res.status(404).json({ error: 'Agent deployment not found' })
      return
    }

    if (deployment.clientId !== req.clientId) {
      res.status(403).json({ error: 'Forbidden' })
      return
    }

    if (deployment.n8nWorkflowId) {
      await n8nService.pauseWorkflow(deployment.n8nWorkflowId)
    }

    const updated = await prisma.agentDeployment.update({
      where: { id: deploymentId },
      data: { status: AgentStatus.PAUSED }
    })

    logger.info('Agent paused', { deploymentId, clientId: req.clientId })

    res.json({ agent: updated })
  } catch (error) {
    logger.error('Error pausing agent', { error, deploymentId: req.params.deploymentId })
    res.status(500).json({ error: 'Internal server error' })
  }
})

router.post('/:deploymentId/resume', authMiddleware, async (req: AuthRequest, res: Response): Promise<void> => {
  try {
    const { deploymentId } = req.params

    const deployment = await prisma.agentDeployment.findUnique({
      where: { id: deploymentId }
    })

    if (!deployment) {
      res.status(404).json({ error: 'Agent deployment not found' })
      return
    }

    if (deployment.clientId !== req.clientId) {
      res.status(403).json({ error: 'Forbidden' })
      return
    }

    if (deployment.n8nWorkflowId) {
      await n8nService.resumeWorkflow(deployment.n8nWorkflowId)
    }

    const updated = await prisma.agentDeployment.update({
      where: { id: deploymentId },
      data: { status: AgentStatus.ACTIVE }
    })

    logger.info('Agent resumed', { deploymentId, clientId: req.clientId })

    res.json({ agent: updated })
  } catch (error) {
    logger.error('Error resuming agent', { error, deploymentId: req.params.deploymentId })
    res.status(500).json({ error: 'Internal server error' })
  }
})

router.patch('/:deploymentId/config', authMiddleware, async (req: AuthRequest, res: Response): Promise<void> => {
  try {
    const { deploymentId } = req.params

    const parsed = updateConfigSchema.safeParse(req.body)
    if (!parsed.success) {
      res.status(400).json({ error: 'Invalid request body', details: parsed.error.errors })
      return
    }

    const deployment = await prisma.agentDeployment.findUnique({
      where: { id: deploymentId }
    })

    if (!deployment) {
      res.status(404).json({ error: 'Agent deployment not found' })
      return
    }

    if (deployment.clientId !== req.clientId) {
      res.status(403).json({ error: 'Forbidden' })
      return
    }

    const newConfig = {
      ...(deployment.config as Record<string, unknown>),
      ...parsed.data.config
    }

    const agent = createAgent(deployment.agentType as AgentType)
    const newPrompt = agent.generatePrompt(newConfig)

    if (deployment.blandAgentId) {
      try {
        await voiceService.updateAgentPrompt(deployment.blandAgentId, newPrompt)
        logger.info('Voice agent prompt updated', { deploymentId, blandAgentId: deployment.blandAgentId })
      } catch (error) {
        logger.warn('Failed to update voice agent prompt', { deploymentId, error })
      }
    }

    const updated = await prisma.agentDeployment.update({
      where: { id: deploymentId },
      data: {
        config: newConfig,
        updatedAt: new Date()
      }
    })

    logger.info('Agent config updated', { deploymentId, clientId: req.clientId })

    res.json({ agent: updated })
  } catch (error) {
    logger.error('Error updating agent config', { error, deploymentId: req.params.deploymentId })
    res.status(500).json({ error: 'Internal server error' })
  }
})

router.get('/:deploymentId/metrics', authMiddleware, async (req: AuthRequest, res: Response): Promise<void> => {
  try {
    const { deploymentId } = req.params

    const deployment = await prisma.agentDeployment.findUnique({
      where: { id: deploymentId }
    })

    if (!deployment) {
      res.status(404).json({ error: 'Agent deployment not found' })
      return
    }

    if (deployment.clientId !== req.clientId) {
      res.status(403).json({ error: 'Forbidden' })
      return
    }

    let n8nStatus = null
    if (deployment.n8nWorkflowId) {
      try {
        n8nStatus = await n8nService.getWorkflowStatus(deployment.n8nWorkflowId)
      } catch {
        logger.warn('Could not fetch N8N status', { deploymentId })
      }
    }

    res.json({
      metrics: deployment.metrics,
      status: deployment.status,
      n8nStatus,
      lastUpdated: deployment.updatedAt
    })
  } catch (error) {
    logger.error('Error fetching agent metrics', { error, deploymentId: req.params.deploymentId })
    res.status(500).json({ error: 'Internal server error' })
  }
})

export default router
