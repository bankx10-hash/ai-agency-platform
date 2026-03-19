import { BaseAgent } from './base.agent'
import { AgentType } from '../types/agent.types'
import { n8nService } from '../services/n8n.service'
import { socialService } from '../services/social.service'
import { imageService } from '../services/image.service'
import { logger } from '../utils/logger'

export type SupportedPlatform = 'instagram' | 'facebook' | 'tiktok' | 'linkedin' | 'twitter'

export interface SocialMediaAgentConfig {
  business_description: string
  tone: string
  posting_frequency: string           // e.g. "2x per day", "daily"
  platforms: SupportedPlatform[]
  content_pillars: string[]           // e.g. ["education", "social proof", "behind the scenes"]
  businessName: string
  locationId: string

  // Buffer — schedules LinkedIn, Facebook, Instagram, Twitter/X
  buffer_token: string

  // Meta Graph API — direct Facebook page + Instagram Business posting
  meta_page_id?: string
  meta_access_token?: string
  instagram_user_id?: string         // Instagram Business account ID (from Meta)

  // TikTok Content Posting API
  tiktok_access_token?: string
  tiktok_open_id?: string            // TikTok user open_id from OAuth

  api_key?: string
}

// Virality frameworks per platform
const PLATFORM_PROMPTS: Record<SupportedPlatform, string> = {
  instagram: `
PLATFORM: Instagram
FORMAT RULES:
- Line 1 must be a scroll-stopping hook (question, bold claim, or controversy) — this is the only line visible before "more"
- Body: 3-5 short punchy paragraphs (2-3 lines each) with line breaks between each
- Use storytelling structure: hook → problem → insight → proof → CTA
- End with a direct single-sentence CTA ("Save this post", "Tag someone who needs this", "Comment YES if you agree")
- Hashtags: 20-25 relevant hashtags on a new line at the end (mix broad, niche, and branded)
- Use emojis sparingly as visual bullet points, not decoration
VIRALITY LEVERS: Save-worthy lists, relatable pain points, "share with someone who..." CTAs`,

  facebook: `
PLATFORM: Facebook
FORMAT RULES:
- Line 1: emotional hook or controversial statement (drives comments)
- Keep to 100-200 words — Facebook rewards engagement over length
- Use "This is for you if..." framing to create identity resonance
- Ask a direct question at the end to drive comments (algorithm rewards comments heavily)
- One CTA maximum — never multiple asks
- Avoid links in the post body (add to first comment instead)
VIRALITY LEVERS: Debate-starting questions, relatable life moments, "agree or disagree?" prompts`,

  tiktok: `
PLATFORM: TikTok (video script)
FORMAT RULES:
- Output a VIDEO SCRIPT, not a caption
- Structure: Hook (0-3s) → Value delivery (3-45s) → CTA (last 3s)
- Hook must create pattern interrupt: start mid-sentence, use "POV:", "Story time:", or a bold claim
- Speak in second person ("you", "your") throughout
- Use the Rule of 3: give exactly 3 tips, 3 reasons, or 3 steps — TikTok users remember lists
- Include [B-ROLL SUGGESTION] notes for visual variety
- End CTA: "Follow for more [topic]" or "Comment [word] and I'll send you..."
- Caption (separate from script): 100 chars max + 3-5 hashtags only
VIRALITY LEVERS: "Things nobody tells you about...", "I tried X for 30 days", POV formats, comment bait`,

  linkedin: `
PLATFORM: LinkedIn
FORMAT RULES:
- Line 1 hook: bold professional insight, surprising stat, or contrarian take (no "I'm excited to announce")
- Use a proven structure: Hook → Personal story or observation → Actionable insight → Invite discussion
- Short paragraphs: 1-2 sentences max, with blank lines between each (mobile reading)
- 150-300 words
- End with an open question that professionals will want to answer
- 3-5 hashtags maximum — place at very end
- Never use "Excited to share" or corporate filler phrases
VIRALITY LEVERS: Contrarian career takes, salary transparency, "unpopular opinion:", behind-the-scenes business numbers`,

  twitter: `
PLATFORM: Twitter/X
FORMAT RULES:
- Option A (single tweet): Under 280 characters, punchy, no fluff
- Option B (thread): 5-8 tweets, each self-contained; Tweet 1 = hook promise ("Here's X things about Y (thread 🧵)")
- Use numbers: "7 lessons", "3 mistakes", "1 thing"
- Each tweet must be able to stand alone and be retweetable
- No hashtags (they reduce reach on X in 2024) — exception: 1 trending tag if highly relevant
- End tweet or thread: direct ask to repost ("RT if this helped someone you know")
VIRALITY LEVERS: Threads with numbered insights, "hot takes", question tweets, quote-tweet bait`
}

export class SocialMediaAgent extends BaseAgent {
  agentType = AgentType.SOCIAL_MEDIA

  generatePrompt(config: Partial<SocialMediaAgentConfig>, contactData?: Record<string, unknown>): string {
    const topic = (contactData?.topic as string) || 'a key insight about our business'
    const platform = ((contactData?.platform as SupportedPlatform) || 'instagram')
    const pillar = (contactData?.content_pillar as string) || (config.content_pillars?.[0] || 'education')

    const platformGuide = PLATFORM_PROMPTS[platform] || PLATFORM_PROMPTS.instagram

    return `You are an elite social media content strategist for ${config.businessName || 'a business'}.
Your job is to create content that stops the scroll, drives engagement, and gets shared.

BUSINESS CONTEXT:
${config.business_description || ''}

BRAND TONE: ${config.tone || 'authentic, direct, and value-driven'}

CONTENT PILLAR: ${pillar}
(Rotate pillars to avoid being salesy: education → social proof → behind-the-scenes → entertainment → offer)

TOPIC FOR THIS POST: ${topic}

${platformGuide}

VIRALITY PRINCIPLES (apply to every post):
1. Every post must deliver ONE clear, specific insight — not a vague overview
2. Write like a person, not a brand — use "I" or "we", share real moments
3. The hook is 80% of the work — spend most creative energy on line 1
4. Specificity beats generality: "$47K in 30 days" beats "made money"
5. Never end with "DM us" as the only CTA — it's weak and overused

OUTPUT FORMAT:
Return a JSON object with:
{
  "platform": "${platform}",
  "hook_score": <1-10 rating of your own hook>,
  "content": "<the full post text, ready to copy-paste>",
  "caption": "<short caption if platform separates caption from script, else null>",
  "hashtags": ["<tag1>", "<tag2>", ...],
  "image_prompt": "<detailed prompt for an AI image generator that would pair perfectly with this post>",
  "best_posting_time": "<optimal day and time for this platform>",
  "predicted_engagement": "low|medium|high|viral"
}`
  }

  async generateContentCalendar(config: SocialMediaAgentConfig): Promise<string> {
    return this.callClaude(
      `Create a 4-week social media content calendar for: ${config.business_description}
Tone: ${config.tone}
Platforms: ${config.platforms.join(', ')}
Content pillars: ${config.content_pillars.join(', ')}
Posting frequency: ${config.posting_frequency}

For each post include: platform, content_pillar, topic, hook_idea, best_time.
Return valid JSON: { "week_1": [...], "week_2": [...], "week_3": [...], "week_4": [...] }
Each week is an array of post objects. Plan ${config.posting_frequency} per day.`,
      'You are a social media strategist who creates content calendars that drive viral growth. Be specific with topics — no vague filler.'
    )
  }

  // Generates and immediately posts/schedules content for a specific platform
  async generateAndPost(
    config: SocialMediaAgentConfig,
    platform: SupportedPlatform,
    topic: string,
    contentPillar: string,
    scheduleAt?: Date
  ): Promise<{ platform: string; content: string; postId?: string; scheduled?: boolean; imageUrl?: string }> {
    // 1. Generate content
    const raw = await this.callClaude(
      this.generatePrompt(config, { platform, topic, content_pillar: contentPillar }),
      'You are an elite social media content creator. Return only valid JSON.'
    )

    let parsed: { content: string; hashtags?: string[]; image_prompt?: string } = { content: raw }
    try {
      parsed = JSON.parse(raw.replace(/```json\n?|\n?```/g, '').trim())
    } catch {
      // If Claude returns plain text instead of JSON, use it as-is
    }

    const postText = parsed.content
    const hashtags = parsed.hashtags || []
    const fullText = hashtags.length
      ? `${postText}\n\n${hashtags.map(h => h.startsWith('#') ? h : `#${h}`).join(' ')}`
      : postText

    // 2. Generate image from the AI-produced image_prompt (non-blocking — null if FAL_API_KEY not set)
    const imageUrl = parsed.image_prompt
      ? await imageService.generateImage(parsed.image_prompt, platform) ?? undefined
      : undefined

    const postAt = scheduleAt || new Date()

    // 3. Route to the correct posting method
    switch (platform) {
      case 'instagram':
        if (config.instagram_user_id && config.meta_access_token) {
          const igResult = await socialService.postToInstagram({
            igUserId: config.instagram_user_id,
            accessToken: config.meta_access_token,
            caption: fullText,
            imageUrl,
            scheduledTime: scheduleAt
          })
          return { platform, content: fullText, postId: igResult.id, imageUrl }
        }
        break

      case 'facebook':
        if (config.meta_page_id && config.meta_access_token) {
          const fbResult = await socialService.postToMeta({
            pageId: config.meta_page_id,
            message: fullText,
            accessToken: config.meta_access_token,
            imageUrl,
            scheduledTime: scheduleAt
          })
          return { platform, content: fullText, postId: fbResult.id, imageUrl }
        }
        break

      case 'tiktok':
        if (config.tiktok_access_token && config.tiktok_open_id) {
          const ttResult = await socialService.postToTikTok({
            openId: config.tiktok_open_id,
            accessToken: config.tiktok_access_token,
            title: postText.substring(0, 150),
            videoScript: parsed.content
          })
          return { platform, content: fullText, postId: ttResult.share_id }
        }
        break
    }

    // Fallback: schedule via Buffer (covers LinkedIn, Twitter, Facebook, Instagram)
    if (config.buffer_token) {
      const results = await socialService.schedulePost({
        content: fullText,
        platforms: [platform],
        scheduledTime: postAt,
        bufferToken: config.buffer_token,
        imageUrl
      })
      return {
        platform,
        content: fullText,
        postId: results[0]?.id,
        scheduled: true,
        imageUrl
      }
    }

    return { platform, content: fullText, imageUrl }
  }

  async deploy(clientId: string, config: SocialMediaAgentConfig): Promise<{ id: string; n8nWorkflowId?: string }> {
    logger.info('Deploying Social Media Agent', { clientId })

    const contentCalendar = await this.generateContentCalendar(config)

    let workflowResult: { workflowId: string } | undefined
    try {
      workflowResult = await n8nService.deployWorkflow('social-media', {
        clientId,
        locationId: config.locationId,
        agentPrompt: contentCalendar,
        webhookUrl: `${process.env['API_BASE_URL']}/webhooks/social/${clientId}`,
        businessName: config.businessName,
        platforms: config.platforms.join(','),
        apiKey: config.api_key as string || ''
      })
    } catch (error) {
      logger.warn('N8N workflow deployment failed, agent will run via direct API calls', { clientId, error: String(error) })
    }

    const deployment = await this.createDeploymentRecord(
      clientId,
      { ...config, generatedContentCalendar: contentCalendar },
      workflowResult?.workflowId
    )

    logger.info('Social Media Agent deployed', { clientId, deploymentId: deployment.id })
    return { id: deployment.id, n8nWorkflowId: workflowResult?.workflowId }
  }
}
