import { NextRequest } from 'next/server'
import { z } from 'zod'
import { requireAdmin } from '@/lib/auth/require-admin'
import { apiError, apiOk, parseBody } from '@/lib/api/respond'

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

export async function POST(request: NextRequest) {
  const auth = await requireAdmin()
  if (!auth.ok) return auth.response
  const { supabase } = auth

  const parsed = await parseBody(request, Body)
  if (!parsed.ok) return parsed.response
  const body = parsed.data

  const slug = body.slug || slugify(body.title, body.starts_at)

  const { data, error } = await supabase
    .from('class_sessions')
    .insert({ ...body, slug })
    .select('id')
    .single()

  if (error) return apiError(error.message, 500, 'DB_ERROR')
  return apiOk({ id: data.id })
}
