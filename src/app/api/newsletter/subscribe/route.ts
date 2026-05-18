import { createClient } from '@/lib/supabase/server'
import { sendWelcomeSubscriber } from '@/lib/email/send'
import { rateLimit, rateLimitResponse } from '@/lib/api/rate-limit'

export async function POST(request: Request) {
  const rl = rateLimit(request, { limit: 3, windowMs: 60_000, keyPrefix: 'newsletter' })
  if (!rl.ok) return rateLimitResponse(rl)

  const { email, source, first_name } = await request.json()

  if (!email || !email.includes('@')) {
    return Response.json({ error: 'Valid email required' }, { status: 400 })
  }

  const supabase = await createClient()
  const normalizedEmail = email.toLowerCase().trim()

  // Anon users have INSERT but not SELECT/UPDATE on newsletter_subscribers.
  // ignoreDuplicates makes the upsert behave as ON CONFLICT DO NOTHING so
  // a re-subscribe is silently a no-op and we never trigger the UPDATE path
  // that RLS would block.
  const { error } = await supabase
    .from('newsletter_subscribers')
    .upsert(
      { email: normalizedEmail, first_name, source },
      { onConflict: 'email', ignoreDuplicates: true },
    )

  if (error) {
    console.error('Newsletter subscribe error:', error)
    return Response.json({ error: 'Failed to subscribe' }, { status: 500 })
  }

  // The welcome is best-effort; we accept the small cost of an occasional
  // duplicate welcome to a re-subscriber rather than risk failing the form.
  try {
    await sendWelcomeSubscriber(normalizedEmail, first_name)
  } catch (err) {
    console.error('Welcome email failed:', err)
  }

  return Response.json({ success: true })
}
