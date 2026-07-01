import { NextRequest } from 'next/server'
import { z } from 'zod'
import { requireAdmin } from '@/lib/auth/require-admin'
import { apiError, apiOk, dbFail, parseBody } from '@/lib/api/respond'

const Body = z.object({
  audience: z.enum(['adult', 'teen', 'kids', 'family']),
  title: z.string().min(1),
  slug: z.string().min(1).optional(),
  starts_at: z.string().min(1),
  ends_at: z.string().min(1),
  price_cents: z.number().int().nonnegative(),
  capacity: z.number().int().positive(),
  location_name: z.string().min(1),
  location_address: z.string().min(1),
  description: z.string().nullable().optional(),
  status: z.enum(['draft', 'published', 'sold_out', 'completed', 'cancelled']).default('draft'),
})

function slugify(title: string, startsAt: string): string {
  const d = new Date(startsAt)
  const month = d.toLocaleString('en-US', { month: 'long', timeZone: 'America/Chicago' }).toLowerCase()
  const day = d.toLocaleString('en-US', { day: 'numeric', timeZone: 'America/Chicago' })
  const year = d.toLocaleString('en-US', { year: 'numeric', timeZone: 'America/Chicago' })
  const base = title
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-|-$/g, '')
    .slice(0, 40)
  return `${base}-${month}-${day}-${year}`
}

// POST /api/admin/class-sessions — create a class session; admin only.
export async function POST(request: NextRequest) {
  const auth = await requireAdmin()
  if (!auth.ok) return auth.response
  const { supabase } = auth

  const parsed = await parseBody(request, Body)
  if (!parsed.ok) return parsed.response
  const body = parsed.data

  // class_sessions.slug is UNIQUE. When the admin did not supply an explicit
  // slug, the auto slug is date-only, so two sessions on the same day (morning
  // and afternoon) collide. Dedupe the auto slug before insert; an explicit
  // slug that still clashes is reported as a friendly conflict below.
  let slug = body.slug || slugify(body.title, body.starts_at)
  if (!body.slug) {
    const { data: existing } = await supabase
      .from('class_sessions')
      .select('id')
      .eq('slug', slug)
      .maybeSingle()
    if (existing) {
      const start = new Date(body.starts_at)
      const time = start
        .toLocaleTimeString('en-US', { hour: '2-digit', minute: '2-digit', hour12: false, timeZone: 'America/Chicago' })
        .replace(/[^0-9]/g, '')
      slug = `${slug}-${time || Date.now()}`
    }
  }

  const { data, error } = await supabase
    .from('class_sessions')
    .insert({ ...body, slug })
    .select('id')
    .single()

  if (error) {
    if (error.code === '23505')
      return apiError('A session with that link already exists. Please use a different slug.', 409, 'CONFLICT')
    return dbFail(error, 'admin/class-sessions POST')
  }
  return apiOk({ id: data.id })
}
