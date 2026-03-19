import { BaseAgent } from './base.agent'
import { AgentType } from '../types/agent.types'
import { n8nService } from '../services/n8n.service'
import { logger } from '../utils/logger'

export interface AppointmentSetterConfig {
  followup_sequence: Array<{ day: number; message: string }>
  calendar_id: string
  objection_handlers: Record<string, string>
  booking_link: string
  sms_number: string
  locationId: string
  businessName: string
  api_key?: string
}

export class AppointmentSetterAgent extends BaseAgent {
  agentType = AgentType.APPOINTMENT_SETTER

  generatePrompt(config: Partial<AppointmentSetterConfig>, contactData?: Record<string, unknown>): string {
    const contact = contactData || {}
    const messageText = contact.message as string || ''

    return `You are a professional appointment setting assistant for ${config.businessName || 'our business'}.

Your goal is to classify incoming messages and determine the best response to book an appointment.

Prospect information:
${JSON.stringify(contact, null, 2)}

Their message: "${messageText}"

Message classification:
- INTERESTED: They want to book or learn more
- OBJECTION: They have a concern that needs addressing
- QUESTION: They need information answered
- NOT_INTERESTED: They clearly don't want to proceed
- NEUTRAL: Unclear intent

Available objection responses:
${JSON.stringify(config.objection_handlers || {}, null, 2)}

Booking link: ${config.booking_link || '[BOOKING_LINK]'}

Your task:
1. Classify the message
2. Generate a personalized, warm response
3. If INTERESTED: Include the booking link
4. If OBJECTION: Address it naturally, then redirect to booking
5. If QUESTION: Answer it, then offer to book a call to discuss further
6. Keep responses under 160 characters for SMS, 300 words for email

Respond with JSON:
{
  "classification": "<INTERESTED|OBJECTION|QUESTION|NOT_INTERESTED|NEUTRAL>",
  "response": "<your message>",
  "sendBookingLink": <true|false>,
  "nextFollowUpDays": <number or null>
}`
  }

  async deploy(clientId: string, config: AppointmentSetterConfig): Promise<{ id: string; n8nWorkflowId?: string }> {
    logger.info('Deploying Appointment Setter Agent', { clientId })

    const followUpSequencePrompt = await this.callClaude(
      `Create a 5-touch follow-up sequence for ${config.businessName} to convert leads into booked appointments.
       The sequence should include:
       - Day 0: Initial outreach (SMS + email)
       - Day 2: Follow-up if no response
       - Day 5: Value-add message
       - Day 10: Break-up message
       - Day 14: Final attempt

       Booking link placeholder: [BOOKING_LINK]
       Business name: ${config.businessName}

       Make each message conversational, personalized with {{firstName}}, and non-pushy.
       Return as JSON array with day, channel (sms|email), and message fields.`,
      'You are an expert at follow-up sequences that convert leads to booked calls.'
    )

    let workflowResult: { workflowId: string } | undefined

    try {
      workflowResult = await n8nService.deployWorkflow('appointment-setter', {
        clientId,
        locationId: config.locationId,
        agentPrompt: followUpSequencePrompt,
        webhookUrl: `${process.env['N8N_BASE_URL']}/webhook/appointments-${clientId}`,
        calendarId: config.calendar_id,
        businessName: config.businessName,
        apiKey: config.api_key as string || ''
      })
    } catch (error) {
      logger.warn('N8N workflow deployment failed', { clientId, error: String(error) })
    }

    const deployment = await this.createDeploymentRecord(
      clientId,
      {
        ...config,
        generatedSequence: followUpSequencePrompt
      },
      workflowResult?.workflowId
    )

    logger.info('Appointment Setter Agent deployed', { clientId, deploymentId: deployment.id })

    return {
      id: deployment.id,
      n8nWorkflowId: workflowResult?.workflowId
    }
  }
}
