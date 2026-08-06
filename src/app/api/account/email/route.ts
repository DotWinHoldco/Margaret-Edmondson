import { z } from 'zod'
import { createClient } from '@/lib/supabase/server'
import { apiError, apiOk, parseBody } from '@/lib/api/respond'
import { rateLimit, rateLimitResponse } from '@/lib/api/rate-limit'

const Body = z.object({
  new_email: z.string().trim().email('Enter a valid email address').max(320),
  current_password: z.string().min(1, 'Current password is required').max(200),
})

// POST /api/account/email — start an email change for the signed-in user.
// Supabase sends a confirmation link to the new address; the email only
// changes once that link is clicked. We re-verify the current password first.
export async function POST(request: Request) {
  const rl = await rateLimit(request, { limit: 5, windowMs: 60_000, keyPrefix: 'account-email' })
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
  const { new_email, current_password } = parsed.data

  if (new_email.toLowerCase() === user.email.toLowerCase()) {
    return apiError('That is already your email address', 400, 'NO_CHANGE')
  }

  // Re-authenticate with the current password before allowing the change.
  const { error: signInError } = await supabase.auth.signInWithPassword({
    email: user.email,
    password: current_password,
  })
  if (signInError) {
    return apiError('Current password is incorrect', 400, 'BAD_PASSWORD')
  }

  const { error: updateError } = await supabase.auth.updateUser({ email: new_email })
  if (updateError) {
    // Supabase auth messages here are curated, user-safe, and actionable
    // (e.g. "already registered"), so surface them rather than a generic string.
    console.error('account/email update:', updateError.message)
    return apiError(updateError.message, 400, 'UPDATE_FAILED')
  }

  return apiOk({
    pending: true,
    message: 'Check your new inbox to confirm the email change.',
  })
}
