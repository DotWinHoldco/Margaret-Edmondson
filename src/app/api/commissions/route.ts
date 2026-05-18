import { createClient } from '@/lib/supabase/server'
import { sendEmail } from '@/lib/email/send'
import { rateLimit, rateLimitResponse } from '@/lib/api/rate-limit'

export async function POST(request: Request) {
  const rl = rateLimit(request, { limit: 5, windowMs: 60_000, keyPrefix: 'commissions' })
  if (!rl.ok) return rateLimitResponse(rl)

  const body = await request.json()
  const { client_name, client_email, client_phone, description, preferred_medium, preferred_size, budget_range, timeline } = body

  if (!client_name || !client_email || !description) {
    return Response.json({ error: 'Name, email, and description are required' }, { status: 400 })
  }

  const supabase = await createClient()

  // No .select() here — RLS only allows admins to SELECT commissions,
  // and the public submitter doesn't need to read back the inserted row.
  const { error } = await supabase
    .from('commissions')
    .insert({
      client_name,
      client_email,
      client_phone,
      description,
      preferred_medium,
      preferred_size,
      budget_range,
      timeline,
      status: 'inquiry',
    })

  if (error) {
    console.error('Commission insert error:', error)
    return Response.json({ error: error.message || 'Failed to submit commission' }, { status: 500 })
  }

  // Send notification email to Margaret
  await sendEmail({
    to: 'hello@artbyme.studio',
    subject: `New Commission Request from ${client_name}`,
    html: `<h2>New Commission Request</h2><p><strong>Name:</strong> ${client_name}</p><p><strong>Email:</strong> ${client_email}</p><p><strong>Phone:</strong> ${client_phone || 'Not provided'}</p><p><strong>Medium:</strong> ${preferred_medium || 'Not specified'}</p><p><strong>Size:</strong> ${preferred_size || 'Not specified'}</p><p><strong>Budget:</strong> ${budget_range || 'Not specified'}</p><p><strong>Timeline:</strong> ${timeline || 'Not specified'}</p><p><strong>Description:</strong></p><p>${description}</p>`,
    replyTo: client_email,
  })

  return Response.json({ success: true })
}
