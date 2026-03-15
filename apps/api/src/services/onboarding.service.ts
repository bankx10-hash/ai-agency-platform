import { PrismaClient, Prisma } from '@prisma/client'
import { ghlService } from './ghl.service'
import { n8nService } from './n8n.service'
import { voiceService } from './voice.service'
import { emailService } from './email.service'
import { encryptJSON } from '../utils/encrypt'
import { logger } from '../utils/logger'
import { AgentType, AgentStatus, PLANS } from '../../../packages/shared/types/agent.types'
import { Plan } from '../../../packages/shared/types/client.types'
import { AGENT_REGISTRY } from '../agents'

const prisma = new PrismaClient()

export class OnboardingService {
  async runOnboarding(clientId: string): Promise<void> {
    logger.info('Starting onboarding', { clientId })

    const client = await prisma.client.findUnique({
      where: { id: clientId },
      include: { onboarding: true }
    })

    if (!client) {
      throw new Error(`Client not found: ${clientId}`)
    }

    await this.updateOnboardingStep(clientId, 1, { message: 'Creating GHL workspace' })

    const { locationId } = await this.createGHLSubAccount(client)

    await this.updateOnboardingStep(clientId, 2, { ghlCreated: true })

    await this.deployAgentsByPlan(clientId, client.plan as Plan, locationId, client)

    await this.updateOnboardingStep(clientId, 3, { agentsDeployed: true })

    await this.assignVoiceNumbers(clientId, locationId, client.businessName)

    await this.updateOnboardingStep(clientId, 4, { voiceAssigned: true })

    await this.sendWelcomeEmail(client.email, client.businessName)

    await this.markOnboardingComplete(clientId)

    logger.info('Onboarding completed', { clientId })
  }

  private async createGHLSubAccount(client: {
    id: string
    businessName: string
    email: string
    phone?: string | null
  }): Promise<{ locationId: string }> {
    try {
      const { locationId } = await ghlService.createSubAccount({
        name: client.businessName,
        email: client.email,
        phone: client.phone || undefined
      })

      await prisma.client.update({
        where: { id: client.id },
        data: {
          ghlLocationId: locationId,
          ghlSubAccountId: locationId
        }
      })

      logger.info('GHL sub-account created and saved', { clientId: client.id, locationId })

      return { locationId }
    } catch (error) {
      logger.error('Failed to create GHL sub-account', { clientId: client.id, error })
      throw error
    }
  }

  private async deployAgentsByPlan(
    clientId: string,
    plan: Plan,
    locationId: string,
    client: {
      id: string
      businessName: string
      email: string
    }
  ): Promise<void> {
    const planConfig = PLANS[plan]
    const agentTypes = planConfig.agents as AgentType[]

    logger.info('Deploying agents for plan', { clientId, plan, agentCount: agentTypes.length })

    for (const agentType of agentTypes) {
      try {
        const AgentClass = AGENT_REGISTRY[agentType]
        if (!AgentClass) {
          logger.warn('No agent class found for type', { agentType })
          continue
        }

        const agent = new AgentClass()
        const defaultConfig = this.getDefaultAgentConfig(agentType, locationId, client.businessName)

        await agent.deploy(clientId, defaultConfig)

        logger.info('Agent deployed', { clientId, agentType })
      } catch (error) {
        logger.error('Failed to deploy agent', { clientId, agentType, error })
        await prisma.agentDeployment.create({
          data: {
            clientId,
            agentType,
            status: AgentStatus.ERROR,
            config: { error: String(error) },
            n8nWorkflowId: undefined
          }
        })
      }
    }
  }

  private getDefaultAgentConfig(
    agentType: AgentType,
    locationId: string,
    businessName: string
  ): Record<string, unknown> {
    const baseConfig = {
      locationId,
      businessName
    }

    const configs: Record<AgentType, Record<string, unknown>> = {
      [AgentType.LEAD_GENERATION]: {
        ...baseConfig,
        icp_description: 'Business owners looking to grow their business',
        lead_sources: ['website', 'facebook'],
        scoring_prompt: 'Score this lead 0-100 based on how well they match our ICP',
        pipeline_id: '',
        high_score_threshold: 70
      },
      [AgentType.LINKEDIN_OUTREACH]: {
        ...baseConfig,
        search_url: '',
        connection_message_template: 'Hi {{firstName}}, I noticed your profile and thought we might be able to help each other out.',
        followup_sequences: [
          { day: 2, message: 'Thanks for connecting! I wanted to reach out about...' },
          { day: 5, message: 'Just following up on my previous message...' },
          { day: 10, message: 'One last message - would love to connect if timing is right...' }
        ],
        daily_limit: 20,
        linkedin_cookie: ''
      },
      [AgentType.SOCIAL_MEDIA]: {
        ...baseConfig,
        business_description: `${businessName} provides excellent products and services`,
        tone: 'professional',
        posting_frequency: 'daily',
        platforms: ['linkedin', 'facebook'],
        content_pillars: ['tips', 'case_studies', 'promotions'],
        buffer_token: ''
      },
      [AgentType.ADVERTISING]: {
        ...baseConfig,
        meta_ad_account_id: '',
        google_ads_customer_id: '',
        target_roas: 3.0,
        daily_budget_limit: 100,
        alert_email: ''
      },
      [AgentType.APPOINTMENT_SETTER]: {
        ...baseConfig,
        followup_sequence: [
          { day: 0, message: 'Hi {{firstName}}, I noticed you expressed interest. Would you like to book a quick call?' },
          { day: 2, message: 'Just following up! Are you available for a 15-minute call this week?' },
          { day: 5, message: 'Last attempt! Here is my calendar link if you would like to connect.' }
        ],
        calendar_id: '',
        objection_handlers: {
          'not interested': 'I completely understand. Would it be okay if I sent over some info for future reference?',
          'too expensive': 'I understand budget is a concern. We do have flexible options. Would you like to hear more?',
          'not ready': 'No problem at all. When would be a better time to revisit this?'
        },
        booking_link: '',
        sms_number: ''
      },
      [AgentType.VOICE_INBOUND]: {
        ...baseConfig,
        greeting_script: `Thank you for calling ${businessName}. How can I help you today?`,
        qualification_questions: [
          'What brings you in today?',
          'Have you worked with us before?',
          'What is your timeline for this?'
        ],
        faq_knowledge_base: `${businessName} FAQs`,
        escalation_number: '',
        voice_id: 'nat',
        calendar_id: ''
      },
      [AgentType.VOICE_OUTBOUND]: {
        ...baseConfig,
        call_script: `Hi, this is an AI assistant calling from ${businessName}. I am reaching out because you recently expressed interest in our services. Do you have a quick moment to chat?`,
        objection_handlers: {
          'not interested': 'I completely understand! Would it be okay if I sent you some information via text?',
          'busy': 'Of course! When would be a better time to call back?',
          'already have one': 'Great! Are you happy with your current solution?'
        },
        max_daily_calls: 50,
        call_window_hours: '9-17',
        retry_attempts: 3,
        ghl_pipeline_stage: ''
      },
      [AgentType.VOICE_CLOSER]: {
        ...baseConfig,
        closing_script_template: `Hi {{firstName}}, this is from ${businessName}. I am calling to follow up on our conversation about moving forward with our services.`,
        offer_details: `${businessName} subscription services`,
        payment_link: '',
        contract_link: '',
        objection_scripts: {
          'price': 'I understand the investment. Let me share what our clients typically see in return...',
          'timing': 'I understand timing is important. What would need to happen for the timing to work better?',
          'competitor': 'That is great that you are comparing options. What is most important to you in making this decision?'
        },
        commission_tracking: false
      },
      [AgentType.CLIENT_SERVICES]: {
        ...baseConfig,
        welcome_sequence: [
          { day: 1, message: `Welcome to ${businessName}! We are so excited to have you on board. Here is what to expect in your first week...` },
          { day: 3, message: 'How is everything going? We wanted to check in and make sure you are all set up.' },
          { day: 7, message: 'One week in! We wanted to share some tips to help you get the most out of your service...' }
        ],
        onboarding_checklist: [
          'Complete account setup',
          'Connect your CRM',
          'Schedule first strategy call',
          'Review agent configurations'
        ],
        nps_schedule: 'monthly',
        health_score_weights: {
          engagement: 0.3,
          nps: 0.3,
          support_tickets: 0.2,
          usage: 0.2
        },
        upsell_triggers: ['high_engagement', 'plan_limit_reached', '90_days_active']
      }
    }

    return configs[agentType] || baseConfig
  }

  private async assignVoiceNumbers(
    clientId: string,
    locationId: string,
    businessName: string
  ): Promise<void> {
    const voiceAgents = await prisma.agentDeployment.findMany({
      where: {
        clientId,
        agentType: {
          in: [AgentType.VOICE_INBOUND]
        },
        status: AgentStatus.ACTIVE
      }
    })

    for (const agent of voiceAgents) {
      try {
        const config = agent.config as Record<string, unknown>

        const { agentId, phoneNumber } = await voiceService.createInboundAgent({
          prompt: config.greeting_script as string || `Thank you for calling ${businessName}. How can I help?`,
          voice: config.voice_id as string || 'eleven_labs_english_male_adam',
          firstSentence: `Thank you for calling ${businessName}. How can I help you today?`,
          twilioPhoneNumber: config.twilio_phone_number as string,
          clientId,
          businessName,
          transferNumber: config.escalation_number as string || undefined
        })

        await prisma.agentDeployment.update({
          where: { id: agent.id },
          data: {
            retellAgentId: agentId,
            config: {
              ...config,
              phone_number: phoneNumber,
              retell_agent_id: agentId
            }
          }
        })

        const credential = encryptJSON({
          agentId,
          phoneNumber,
          locationId
        })

        await prisma.clientCredential.upsert({
          where: {
            id: `voice-inbound-${clientId}`
          },
          update: { credentials: credential },
          create: {
            id: `voice-inbound-${clientId}`,
            clientId,
            service: 'retell-inbound',
            credentials: credential
          }
        })

        logger.info('Voice number assigned', { clientId, phoneNumber, agentId })
      } catch (error) {
        logger.error('Failed to assign voice number', { clientId, agentId: agent.id, error })
      }
    }
  }

  private async sendWelcomeEmail(email: string, businessName: string): Promise<void> {
    const portalUrl = process.env.NEXTAUTH_URL || 'http://localhost:3000'

    try {
      await emailService.sendWelcomeEmail(email, businessName, portalUrl)
      logger.info('Welcome email sent', { email, businessName })
    } catch (error) {
      logger.error('Failed to send welcome email', { email, error })
    }
  }

  private async updateOnboardingStep(
    clientId: string,
    step: number,
    data: Record<string, unknown>
  ): Promise<void> {
    const existing = await prisma.onboarding.findUnique({ where: { clientId } })

    if (existing) {
      await prisma.onboarding.update({
        where: { clientId },
        data: {
          step,
          data: {
            ...(existing.data as Record<string, unknown>),
            ...data
          } as Prisma.InputJsonValue
        }
      })
    } else {
      await prisma.onboarding.create({
        data: {
          clientId,
          step,
          status: 'IN_PROGRESS',
          data: data as Prisma.InputJsonValue
        }
      })
    }
  }

  private async markOnboardingComplete(clientId: string): Promise<void> {
    await prisma.onboarding.update({
      where: { clientId },
      data: {
        status: 'COMPLETED',
        step: 5,
        completedAt: new Date()
      }
    })

    await prisma.client.update({
      where: { id: clientId },
      data: { status: 'ACTIVE' }
    })

    logger.info('Onboarding marked complete', { clientId })
  }
}

export const onboardingService = new OnboardingService()
