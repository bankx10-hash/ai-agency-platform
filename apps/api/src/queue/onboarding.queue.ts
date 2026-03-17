import Bull from 'bull'
import { onboardingService } from '../services/onboarding.service'
import { logger } from '../utils/logger'

const REDIS_URL = process.env['REDIS_URL'] || 'redis://localhost:6379'

export const onboardingQueue = new Bull('onboarding', REDIS_URL, {
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

onboardingQueue.process(async (job) => {
  const { clientId } = job.data as { clientId: string }

  logger.info('Processing onboarding job', { clientId, jobId: job.id })

  try {
    await job.progress(10)

    await onboardingService.runOnboarding(clientId)

    await job.progress(100)

    logger.info('Onboarding job completed', { clientId, jobId: job.id })

    return { success: true, clientId }
  } catch (error) {
    logger.error('Onboarding job failed', {
      clientId,
      jobId: job.id,
      attempt: job.attemptsMade,
      error
    })
    throw error
  }
})

onboardingQueue.on('error', (err) => {
  logger.error('Onboarding queue error', { message: err.message })
})

onboardingQueue.on('completed', (job, result) => {
  logger.info('Onboarding job completed', { jobId: job.id, result })
})

onboardingQueue.on('failed', (job, error) => {
  logger.error('Onboarding job failed permanently', {
    jobId: job.id,
    clientId: job.data.clientId,
    attempts: job.attemptsMade,
    error: error.message
  })
})

onboardingQueue.on('stalled', (job) => {
  logger.warn('Onboarding job stalled', { jobId: job.id, clientId: job.data.clientId })
})

onboardingQueue.on('progress', (job, progress) => {
  logger.debug('Onboarding job progress', { jobId: job.id, progress })
})

export default onboardingQueue
