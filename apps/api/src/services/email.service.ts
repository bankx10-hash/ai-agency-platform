import nodemailer from 'nodemailer'
import { OAuth2Client } from 'google-auth-library'
import axios from 'axios'
import { logger } from '../utils/logger'

interface EmailCredentials {
  accessToken: string
  refreshToken: string
  email: string
}

interface SendEmailOptions {
  to: string
  subject: string
  body: string
  html?: string
}

export class EmailService {
  private getOAuth2Client(redirectUri?: string) {
    const clientId = process.env['GMAIL_CLIENT_ID']
    const clientSecret = process.env['GMAIL_CLIENT_SECRET']

    if (!clientId || !clientSecret) {
      throw new Error('Gmail OAuth2 credentials not configured')
    }

    return new OAuth2Client(
      clientId,
      clientSecret,
      redirectUri || 'https://developers.google.com/oauthplayground'
    )
  }

  async sendEmail(
    to: string,
    subject: string,
    body: string,
    credentials: EmailCredentials
  ): Promise<void> {
    const oauth2Client = this.getOAuth2Client()

    oauth2Client.setCredentials({
      access_token: credentials.accessToken,
      refresh_token: credentials.refreshToken
    })

    const { token } = await oauth2Client.getAccessToken()

    const transporter = nodemailer.createTransport({
      service: 'gmail',
      auth: {
        type: 'OAuth2',
        user: credentials.email,
        clientId: process.env['GMAIL_CLIENT_ID'],
        clientSecret: process.env['GMAIL_CLIENT_SECRET'],
        refreshToken: credentials.refreshToken,
        accessToken: token || ''
      }
    })

    await transporter.sendMail({
      from: credentials.email,
      to,
      subject,
      text: body,
      html: body
    })

    logger.info('Email sent via Gmail OAuth2', { to, subject })
  }

  async sendSystemEmail(to: string, subject: string, html: string): Promise<void> {
    const smtpUser = process.env['SMTP_USER']
    const smtpPass = process.env['SMTP_PASSWORD']
    const smtpHost = process.env['SMTP_HOST'] || 'smtp.gmail.com'
    const smtpPort = parseInt(process.env['SMTP_PORT'] || '587')

    if (!smtpUser || !smtpPass) {
      logger.warn('SMTP credentials not configured, skipping email', { to, subject })
      return
    }

    const transporter = nodemailer.createTransport({
      host: smtpHost,
      port: smtpPort,
      secure: smtpPort === 465,
      auth: {
        user: smtpUser,
        pass: smtpPass
      }
    })

    await transporter.sendMail({
      from: smtpUser,
      to,
      subject,
      html
    })

    logger.info('System email sent', { to, subject })
  }

  async sendWelcomeEmail(
    clientEmail: string,
    businessName: string,
    portalUrl: string
  ): Promise<void> {
    const html = `
      <!DOCTYPE html>
      <html>
        <head>
          <meta charset="utf-8">
          <title>Welcome to AI Agency Platform</title>
        </head>
        <body style="font-family: Arial, sans-serif; max-width: 600px; margin: 0 auto; padding: 20px;">
          <div style="background: linear-gradient(135deg, #667eea 0%, #764ba2 100%); padding: 30px; border-radius: 10px; text-align: center; margin-bottom: 30px;">
            <h1 style="color: white; margin: 0;">Welcome to AI Agency Platform!</h1>
          </div>

          <p style="font-size: 16px; color: #333;">Hi ${businessName} team,</p>

          <p style="font-size: 16px; color: #333;">
            Your AI agents are now being deployed and configured. Within the next few minutes, your automated workforce will be ready to start generating leads, booking appointments, and growing your business.
          </p>

          <h2 style="color: #667eea;">What's happening right now:</h2>
          <ul style="font-size: 16px; color: #333; line-height: 1.8;">
            <li>Creating your dedicated CRM workspace</li>
            <li>Deploying your AI agents</li>
            <li>Configuring your communication channels</li>
            <li>Running initial system checks</li>
          </ul>

          <div style="text-align: center; margin: 30px 0;">
            <a href="${portalUrl}" style="background: linear-gradient(135deg, #667eea 0%, #764ba2 100%); color: white; padding: 15px 30px; text-decoration: none; border-radius: 8px; font-size: 16px; font-weight: bold;">
              Access Your Dashboard
            </a>
          </div>

          <p style="font-size: 14px; color: #666;">
            If you have any questions, our support team is here to help. Just reply to this email.
          </p>

          <p style="font-size: 14px; color: #666;">
            Best regards,<br>
            The AI Agency Platform Team
          </p>
        </body>
      </html>
    `

    await this.sendSystemEmail(
      clientEmail,
      `Welcome to AI Agency Platform — Your agents are being deployed, ${businessName}!`,
      html
    )
  }

  getGmailAuthUrl(): string {
    const redirectUri = process.env['GMAIL_REDIRECT_URI'] || 'http://localhost:4000/onboarding/oauth/gmail/callback'
    const oauth2Client = this.getOAuth2Client(redirectUri)

    return oauth2Client.generateAuthUrl({
      access_type: 'offline',
      scope: [
        'https://www.googleapis.com/auth/gmail.send',
        'https://www.googleapis.com/auth/gmail.readonly',
        'https://www.googleapis.com/auth/userinfo.email'
      ],
      prompt: 'consent'
    })
  }

  async exchangeCodeForTokens(code: string): Promise<{
    accessToken: string
    refreshToken: string
    email: string
  }> {
    const redirectUri = process.env['GMAIL_REDIRECT_URI'] || 'http://localhost:4000/onboarding/oauth/gmail/callback'
    const oauth2Client = this.getOAuth2Client(redirectUri)

    const { tokens } = await oauth2Client.getToken(code)
    oauth2Client.setCredentials(tokens)

    const { token } = await oauth2Client.getAccessToken()
    const userInfoRes = await axios.get('https://www.googleapis.com/oauth2/v2/userinfo', {
      headers: { Authorization: `Bearer ${token}` }
    })

    return {
      accessToken: tokens.access_token || '',
      refreshToken: tokens.refresh_token || '',
      email: userInfoRes.data.email || ''
    }
  }
}

export const emailService = new EmailService()
