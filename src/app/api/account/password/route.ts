import { z } from 'zod'
import { createClient } from '@/lib/supabase/server'
import { apiError, apiOk, parseBody } from '@/lib/api/respond'
import { rateLimit, rateLimitResponse } from '@/lib/api/rate-limit'

const Body = z.object({
  current_password: z.string().min(1, 'Current password is required').max(200),
  new_password: z.string().min(8, 'New password must be at least 8 characters').max(200),
})

// POST /api/account/password — change the signed-in user's password.
// Re-verifies the current password (signInWithPassword) before updating so a
// hijacked session can't silently rotate credentials.
export async function POST(request: Request) {
  const rl = rateLimit(request, { limit: 5, windowMs: 60_000, keyPrefix: 'account-password' })
  if (!rl.ok) return rateLimitResponse(rl)

  const supabase = await createClient()
  const {
    data: { user },
  } = await supabase.auth.getUser()
  if (!user || !user.email) {
    return apiError('Authentication required', 401, 'UNAUTHORIZED')
  }

  const parsed = await parseBody(request, Body)
  if (!parsed.ok) return parsed.response
  const { current_password, new_password } = parsed.data

  // Re-authenticate with the current password.
  const { error: signInError } = await supabase.auth.signInWithPassword({
    email: user.email,
    password: current_password,
  })
  if (signInError) {
    return apiError('Current password is incorrect', 400, 'BAD_PASSWORD')
  }

  const { error: updateError } = await supabase.auth.updateUser({ password: new_password })
  if (updateError) {
    // Supabase auth messages here are curated + actionable ("must differ from
    // the old password", leaked-password rejection), so surface them.
    console.error('account/password update:', updateError.message)
    return apiError(updateError.message, 400, 'UPDATE_FAILED')
  }

  return apiOk({ updated: true })
}
