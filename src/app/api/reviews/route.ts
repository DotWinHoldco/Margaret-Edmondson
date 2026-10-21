import sharp from 'sharp'
import { createClient } from '@/lib/supabase/server'
import { requireAntiBotToken, requireSameOrigin } from '@/lib/api/anti-bot'
import { rateLimit, rateLimitResponse } from '@/lib/api/rate-limit'
import { apiError, apiFail, apiOk, dbFail } from '@/lib/api/respond'
import { MAX_REVIEW_PHOTO, reviewFormData, reviewInput } from '@/lib/reviews/input'

export const runtime = 'nodejs'

// POST /api/reviews — accept a bounded, consented review into the private approval queue.
// dotwin-allow:public-write — intentional review intake; anti-bot, rate limit,
// bounded validation, and RLS restrict submissions to unfeatured pending reviews.
export async function POST(request: Request) {
  const origin = requireSameOrigin(request)
  if (origin) return origin
  const rl = await rateLimit(request, { keyPrefix: 'public-review', limit: 3, windowMs: 3_600_000 })
  if (!rl.ok) return rateLimitResponse(rl)
  const bot = requireAntiBotToken(request)
  if (bot) return bot
  try {
    const form = await reviewFormData(request)
    if (form.get('website')) return apiOk({ submitted: true }, 201)
    const parsed = reviewInput.safeParse(Object.fromEntries(['name', 'quote', 'context', 'consent'].map(key => [key, form.get(key) ?? ''])))
    if (!parsed.success) return apiError(parsed.error.issues[0]?.message ?? 'Please check your review.', 400, 'VALIDATION_FAILED')
    const photo = form.get('photo')
    let image: string | null = null
    if (photo instanceof File && photo.size > 0) {
      if (photo.size > MAX_REVIEW_PHOTO) return apiError('Please choose a photo smaller than 4 MB.', 400, 'VALIDATION_FAILED')
      if (!['image/jpeg', 'image/png', 'image/webp'].includes(photo.type)) return apiError('Please choose a JPG, PNG, or WebP photo.', 400, 'VALIDATION_FAILED')
      try {
        // A small, metadata-free display photo stays on the moderated record itself.
        // No publicly accessible storage object is created before approval.
        const input = Buffer.from(await photo.arrayBuffer())
        let webp = await sharp(input, { limitInputPixels: 25_000_000 }).rotate().resize({ width: 1200, height: 1200, fit: 'inside', withoutEnlargement: true }).webp({ quality: 75 }).toBuffer()
        if (webp.length > 250_000) webp = await sharp(webp).resize({ width: 800, height: 800, fit: 'inside' }).webp({ quality: 60 }).toBuffer()
        if (webp.length > 250_000) return apiError('Please choose a smaller photo.', 400, 'VALIDATION_FAILED')
        image = `data:image/webp;base64,${webp.toString('base64')}`
      } catch { return apiError('That photo could not be opened. Please try another JPG or PNG.', 400, 'VALIDATION_FAILED') }
    }
    const db = await createClient()
    const { error } = await db.from('testimonials').insert({
      name: parsed.data.name, quote: parsed.data.quote, event_context: parsed.data.context || null,
      source: 'Website review', status: 'pending', is_featured: false, sort_order: 0, image_url: image,
    })
    if (error) return dbFail(error, 'public review submission')
    return apiOk({ submitted: true }, 201)
  } catch (error) {
    if (error instanceof Error && error.message === 'REVIEW_TOO_LARGE') return apiError('Please choose a photo smaller than 4 MB.', 413, 'VALIDATION_FAILED')
    return apiFail(error, { context: 'public review submission', publicMessage: 'Your review could not be saved. Please try again.' })
  }
}
