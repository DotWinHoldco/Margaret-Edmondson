import { createClient } from '@/lib/supabase/server'
import { sendWelcomeSubscriber } from '@/lib/email/send'
import { rateLimit, rateLimitResponse } from '@/lib/api/rate-limit'
import { upsertContact, addToList } from '@/lib/crm/contacts'
import { generateDiscountCode } from '@/lib/discounts/generate'
import { buildUnsubscribeUrl } from '@/lib/email/unsubscribe'

export async function POST(request: Request) {
  const rl = rateLimit(request, { limit: 3, windowMs: 60_000, keyPrefix: 'newsletter' })
  if (!rl.ok) return rateLimitResponse(rl)

  const body = await request.json().catch(() => ({}))
  const { email, source, first_name: firstName } = body as {
    email?: string
    source?: string
    first_name?: string
  }

  if (!email || !email.includes('@')) {
    return Response.json({ error: 'Valid email required' }, { status: 400 })
  }

  const normalizedEmail = email.toLowerCase().trim()
  const supabase = await createClient()

  // Legacy compatibility — keep the newsletter_subscribers row populated.
  const { error: legacyErr } = await supabase
    .from('newsletter_subscribers')
    .upsert(
      { email: normalizedEmail, first_name: firstName ?? null, source: source ?? null },
      { onConflict: 'email', ignoreDuplicates: true }
    )
  if (legacyErr) {
    console.error('Newsletter legacy upsert failed:', legacyErr)
  }

  // Upsert into the canonical CRM. Returns the contact row with id.
  const contact = await upsertContact(
    {
      email: normalizedEmail,
      firstName: firstName ?? null,
      source: source ?? 'newsletter',
    },
    supabase
  )

  if (!contact) {
    return Response.json({ error: 'Failed to record subscription' }, { status: 500 })
  }

  await addToList(contact.id, 'newsletter', source ?? 'newsletter', supabase)

  // Skip the welcome + code if the contact has unsubscribed in the past
  // and this is not an explicit resubscribe.
  if (contact.status === 'unsubscribed') {
    return Response.json({ success: true, alreadyUnsubscribed: true })
  }

  // Generate a single-use 10% off code valid for 24 hours. If the contact
  // already received a newsletter signup code in the last 24h, re-use it
  // rather than handing out a fresh one.
  let discountCode: string | null = null
  let discountValue = 10
  try {
    const { data: existingCode } = await supabase
      .from('promo_codes')
      .select('code, discount_value, valid_until')
      .eq('contact_id', contact.id)
      .eq('kind', 'newsletter_signup')
      .eq('is_active', true)
      .gte('valid_until', new Date().toISOString())
      .order('created_at', { ascending: false })
      .limit(1)
      .maybeSingle()

    if (existingCode) {
      discountCode = existingCode.code
      discountValue = existingCode.discount_value
    } else {
      const created = await generateDiscountCode(
        {
          kind: 'newsletter_signup',
          percentOff: 10,
          expiresInHours: 24,
          contactId: contact.id,
          singleUsePerContact: true,
          prefix: 'WELCOME',
          description: `Newsletter signup discount for ${normalizedEmail}`,
        },
        supabase
      )
      discountCode = created.code
      discountValue = created.discount_value
    }
  } catch (err) {
    console.error('Newsletter discount code generation failed:', err)
  }

  // Welcome email with the code, branded shell, unsubscribe link.
  try {
    await sendWelcomeSubscriber(normalizedEmail, firstName ?? undefined, {
      discountCode: discountCode ?? undefined,
      percentOff: discountValue,
      expiresLabel: 'Valid for 24 hours',
      unsubscribeUrl: buildUnsubscribeUrl(contact.id),
    })
  } catch (err) {
    console.error('Welcome email failed:', err)
  }

  return Response.json({
    success: true,
    discountCode,
    discountValue,
  })
}
