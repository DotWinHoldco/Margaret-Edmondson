import { z } from 'zod'
import { createClient } from '@/lib/supabase/server'
import { apiError, apiOk, dbFail, parseBody } from '@/lib/api/respond'
import { rateLimit, rateLimitResponse } from '@/lib/api/rate-limit'

const AddressBody = z.object({
  label: z.string().trim().min(1, 'Label is required').max(80),
  line1: z.string().trim().min(1, 'Address line 1 is required').max(200),
  line2: z.string().trim().max(200).optional().or(z.literal('')),
  city: z.string().trim().min(1, 'City is required').max(120),
  state: z.string().trim().min(1, 'State is required').max(120),
  postal_code: z.string().trim().min(1, 'Postal code is required').max(20),
  country: z.string().trim().min(2).max(2).optional(),
  is_default: z.boolean().optional(),
})

// GET /api/account/addresses — list the signed-in user's address book.
export async function GET() {
  const supabase = await createClient()
  const {
    data: { user },
  } = await supabase.auth.getUser()
  if (!user) return apiError('Authentication required', 401, 'UNAUTHORIZED')

  const { data, error } = await supabase
    .from('addresses')
    .select('id, profile_id, label, line1, line2, city, state, postal_code, country, is_default, created_at')
    .eq('profile_id', user.id)
    .order('is_default', { ascending: false })
    .order('created_at', { ascending: false })

  if (error) return dbFail(error, 'account/addresses GET')
  return apiOk(data ?? [])
}

// POST /api/account/addresses — add a new address. If flagged default, clears
// the default flag on the user's other addresses first.
export async function POST(request: Request) {
  const supabase = await createClient()
  const {
    data: { user },
  } = await supabase.auth.getUser()
  if (!user) return apiError('Authentication required', 401, 'UNAUTHORIZED')

  const rl = rateLimit(request, { limit: 30, windowMs: 60_000, keyPrefix: 'acct-address', key: user.id })
  if (!rl.ok) return rateLimitResponse(rl)

  const parsed = await parseBody(request, AddressBody)
  if (!parsed.ok) return parsed.response
  const body = parsed.data

  const makeDefault = body.is_default === true

  if (makeDefault) {
    const { error: clearError } = await supabase
      .from('addresses')
      .update({ is_default: false })
      .eq('profile_id', user.id)
      .eq('is_default', true)
    if (clearError) return dbFail(clearError, 'account/addresses POST clear default')
  }

  const { data: inserted, error: insertError } = await supabase
    .from('addresses')
    .insert({
      profile_id: user.id,
      label: body.label,
      line1: body.line1,
      line2: body.line2 || null,
      city: body.city,
      state: body.state,
      postal_code: body.postal_code,
      country: body.country || 'US',
      is_default: makeDefault,
    })
    .select('id, profile_id, label, line1, line2, city, state, postal_code, country, is_default, created_at')
    .single()

  if (insertError) return dbFail(insertError, 'account/addresses POST insert')
  return apiOk(inserted, 201)
}
