import Bull from 'bull'
import { PrismaClient } from '@prisma/client'
import { createAgent } from '../agents'
import { AgentType, AgentStatus } from '../../../packages/shared/types/agent.types'
import { logger } from '../utils/logger'

const prisma = new PrismaClient()
const REDIS_URL = process.env.REDIS_URL || 'redis://localhost:6379'

interface AgentDeployJobData {
  clientId: string
  agentType: AgentType
  config: Record<string, unknown>
  deploymentId?: string
}

export const agentDeployQueue = new Bull<AgentDeployJobData>('agent-deploy', REDIS_URL, {
  defaultJobOptions: {
    attempts: 3,
    backoff: {
      type: 'exponential',
      delay: 5000
    },
    removeOnComplete: 100,
    removeOnFail: 50
  }
})

agentDeployQueue.process(async (job) => {
  const { clientId, agentType, config, deploymentId } = job.data

  logger.info('Processing agent deploy job', { clientId, agentType, jobId: job.id })

  try {
    await job.progress(10)

    const agent = createAgent(agentType)

    await job.progress(30)

    const result = await agent.deploy(clientId, config)

    await job.progress(100)

    logger.info('Agent deploy job completed', {
      clientId,
      agentType,
      deploymentId: result.id,
      jobId: job.id
    })

    return { success: true, deploymentId: result.id, n8nWorkflowId: result.n8nWorkflowId }
  } catch (error) {
    logger.error('Agent deploy job failed', {
      clientId,
      agentType,
      deploymentId,
      jobId: job.id,
      attempt: job.attemptsMade,
      error
    })

    const isLastAttempt = job.attemptsMade >= (job.opts.attempts || 3) - 1

    if (isLastAttempt) {
      if (deploymentId) {
        await prisma.agentDeployment.update({
          where: { id: deploymentId },
          data: {
            status: AgentStatus.ERROR,
            config: {
              ...(config as object),
              deployError: error instanceof Error ? error.message : String(error),
              failedAt: new Date().toISOString()
            }
          }
        }).catch(dbError => {
          logger.error('Failed to update deployment status to ERROR', { deploymentId, dbError })
        })
      } else {
        await prisma.agentDeployment.create({
          data: {
            clientId,
            agentType,
            status: AgentStatus.ERROR,
            config: {
              ...config,
              deployError: error instanceof Error ? error.message : String(error),
              failedAt: new Date().toISOString()
            }
          }
        }).catch(dbError => {
          logger.error('Failed to create error deployment record', { clientId, agentType, dbError })
        })
      }
    }

    throw error
  }
})

agentDeployQueue.on('completed', (job, result) => {
  logger.info('Agent deploy job completed', { jobId: job.id, result })
})

agentDeployQueue.on('failed', (job, error) => {
  logger.error('Agent deploy job failed permanently', {
    jobId: job.id,
    clientId: job.data.clientId,
    agentType: job.data.agentType,
    attempts: job.attemptsMade,
    error: error.message
  })
})

agentDeployQueue.on('stalled', (job) => {
  logger.warn('Agent deploy job stalled', {
    jobId: job.id,
    clientId: job.data.clientId,
    agentType: job.data.agentType
  })
})

export default agentDeployQueue
