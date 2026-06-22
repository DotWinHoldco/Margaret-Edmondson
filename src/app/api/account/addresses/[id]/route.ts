import { z } from 'zod'
import { createClient } from '@/lib/supabase/server'
import { apiError, apiOk, parseBody } from '@/lib/api/respond'

const PatchBody = z.object({
  label: z.string().trim().min(1).max(80).optional(),
  line1: z.string().trim().min(1).max(200).optional(),
  line2: z.string().trim().max(200).optional().or(z.literal('')),
  city: z.string().trim().min(1).max(120).optional(),
  state: z.string().trim().min(1).max(120).optional(),
  postal_code: z.string().trim().min(1).max(20).optional(),
  country: z.string().trim().min(2).max(2).optional(),
  is_default: z.boolean().optional(),
})

// PATCH /api/account/addresses/[id] — update an address the user owns. Setting
// is_default true clears the flag on the user's other addresses.
export async function PATCH(
  request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id } = await params

  const supabase = await createClient()
  const {
    data: { user },
  } = await supabase.auth.getUser()
  if (!user) return apiError('Authentication required', 401, 'UNAUTHORIZED')

  const parsed = await parseBody(request, PatchBody)
  if (!parsed.ok) return parsed.response
  const body = parsed.data

  // Confirm ownership before touching defaults (RLS also guards, but this
  // returns a clean 404 instead of an empty update).
  const { data: owned, error: ownErr } = await supabase
    .from('addresses')
    .select('id')
    .eq('id', id)
    .eq('profile_id', user.id)
    .maybeSingle()
  if (ownErr) return apiError(ownErr.message, 500, 'DB_ERROR')
  if (!owned) return apiError('Address not found', 404, 'NOT_FOUND')

  const updates: Record<string, unknown> = {}
  if (body.label !== undefined) updates.label = body.label
  if (body.line1 !== undefined) updates.line1 = body.line1
  if (body.line2 !== undefined) updates.line2 = body.line2 || null
  if (body.city !== undefined) updates.city = body.city
  if (body.state !== undefined) updates.state = body.state
  if (body.postal_code !== undefined) updates.postal_code = body.postal_code
  if (body.country !== undefined) updates.country = body.country
  if (body.is_default !== undefined) updates.is_default = body.is_default

  if (Object.keys(updates).length === 0) {
    return apiError('No fields to update', 400, 'NO_FIELDS')
  }

  if (body.is_default === true) {
    const { error: clearError } = await supabase
      .from('addresses')
      .update({ is_default: false })
      .eq('profile_id', user.id)
      .eq('is_default', true)
      .neq('id', id)
    if (clearError) return apiError(clearError.message, 500, 'DB_ERROR')
  }

  const { data: updated, error: updateError } = await supabase
    .from('addresses')
    .update(updates)
    .eq('id', id)
    .eq('profile_id', user.id)
    .select('id, profile_id, label, line1, line2, city, state, postal_code, country, is_default, created_at')
    .single()

  if (updateError) return apiError(updateError.message, 500, 'DB_ERROR')
  return apiOk(updated)
}

// DELETE /api/account/addresses/[id] — remove an address the user owns.
export async function DELETE(
  _request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id } = await params

  const supabase = await createClient()
  const {
    data: { user },
  } = await supabase.auth.getUser()
  if (!user) return apiError('Authentication required', 401, 'UNAUTHORIZED')

  const { data, error } = await supabase
    .from('addresses')
    .delete()
    .eq('id', id)
    .eq('profile_id', user.id)
    .select('id')

  if (error) return apiError(error.message, 500, 'DB_ERROR')
  if (!data || data.length === 0) {
    return apiError('Address not found', 404, 'NOT_FOUND')
  }

  return apiOk({ deleted: true })
}
