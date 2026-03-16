import axios from 'axios'
import { logger } from '../utils/logger'
import { SupportedPlatform } from '../agents/social-media.agent'

// Platform-aware image dimensions for fal.ai FLUX
const PLATFORM_IMAGE_SIZE: Record<SupportedPlatform, string> = {
  instagram: 'square_hd',      // 1024x1024  — standard IG feed
  facebook:  'landscape_4_3',  // 1024x768   — Facebook link/photo post
  tiktok:    'portrait_16_9',  // 576x1024   — vertical TikTok cover
  linkedin:  'landscape_4_3',  // 1024x768   — LinkedIn article / post image
  twitter:   'landscape_16_9'  // 1024x576   — Twitter card
}

export class ImageService {
  private readonly baseURL = 'https://fal.run/fal-ai/flux/schnell'

  async generateImage(prompt: string, platform: SupportedPlatform = 'instagram'): Promise<string | null> {
    const apiKey = process.env.FAL_API_KEY
    if (!apiKey) {
      logger.warn('FAL_API_KEY not set — skipping image generation')
      return null
    }

    try {
      const response = await axios.post(
        this.baseURL,
        {
          prompt,
          image_size: PLATFORM_IMAGE_SIZE[platform],
          num_images: 1,
          enable_safety_checker: true
        },
        {
          headers: {
            Authorization: `Key ${apiKey}`,
            'Content-Type': 'application/json'
          }
        }
      )

      const imageUrl: string | undefined = response.data.images?.[0]?.url
      if (!imageUrl) throw new Error('fal.ai returned no image URL')

      logger.info('Image generated', { platform, imageUrl })
      return imageUrl
    } catch (error: any) {
      logger.error('Image generation failed', {
        platform,
        status: error.response?.status,
        data: error.response?.data
      })
      return null
    }
  }
}

export const imageService = new ImageService()
