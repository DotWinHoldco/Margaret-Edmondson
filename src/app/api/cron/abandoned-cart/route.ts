// Cart abandonment sequence. Runs every 15 minutes via vercel.json.
//
// Step 1 (1h): reminder only, no code.
// Step 2 (24h): generate a single-use 10% off code (72h expiry),
//               attach to cart.promo_code_id, embed in email.
// Step 3 (72h): re-use the same code from step 2.
// After step 3: set nurture_started_at — the email-automations cron
//               picks up these carts and sends a weekly nurture email
//               until purchase or unsubscribe.

import { createServiceClient } from '@/lib/supabase/server'
import { sendEmail } from '@/lib/email/send'
import { renderHtml } from '@/lib/email/render'
import { ctaButton, discountCallout } from '@/lib/email/shell'
import { generateDiscountCode } from '@/lib/discounts/generate'
import { buildUnsubscribeUrl } from '@/lib/email/unsubscribe'
import { upsertContact } from '@/lib/crm/contacts'
import type { Database } from '@/lib/types/database'

type CartRow = Database['public']['Tables']['carts']['Row']

const SITE_URL = process.env.NEXT_PUBLIC_SITE_URL || 'https://artbyme.studio'

export async function GET(request: Request) {
  const authHeader = request.headers.get('authorization')
  if (authHeader !== `Bearer ${process.env.CRON_SECRET}`) {
    return Response.json({ error: 'Unauthorized' }, { status: 401 })
  }

  const supabase = await createServiceClient()
  const now = new Date()
  const nowIso = now.toISOString()

  // Pull each step window.
  const oneHourAgo = new Date(now.getTime() - 60 * 60 * 1000).toISOString()
  const twentyFourAgo = new Date(now.getTime() - 24 * 60 * 60 * 1000).toISOString()
  const seventyTwoAgo = new Date(now.getTime() - 72 * 60 * 60 * 1000).toISOString()

  const { data: step1Carts } = await supabase
    .from('carts')
    .select('*')
    .not('email', 'is', null)
    .is('converted_order_id', null)
    .is('abandoned_email_1_sent_at', null)
    .lt('last_activity_at', oneHourAgo)

  const { data: step2Carts } = await supabase
    .from('carts')
    .select('*')
    .not('email', 'is', null)
    .is('converted_order_id', null)
    .not('abandoned_email_1_sent_at', 'is', null)
    .is('abandoned_email_2_sent_at', null)
    .lt('last_activity_at', twentyFourAgo)

  const { data: step3Carts } = await supabase
    .from('carts')
    .select('*')
    .not('email', 'is', null)
    .is('converted_order_id', null)
    .not('abandoned_email_2_sent_at', 'is', null)
    .is('abandoned_email_3_sent_at', null)
    .lt('last_activity_at', seventyTwoAgo)

  let sent = 0

  for (const cart of (step1Carts || []) as CartRow[]) {
    const ok = await sendStep1(cart, supabase)
    if (ok) {
      await supabase.from('carts').update({ abandoned_email_1_sent_at: nowIso }).eq('id', cart.id)
      sent++
    }
  }

  for (const cart of (step2Carts || []) as CartRow[]) {
    const ok = await sendStep2(cart, supabase)
    if (ok) {
      await supabase.from('carts').update({ abandoned_email_2_sent_at: nowIso }).eq('id', cart.id)
      sent++
    }
  }

  for (const cart of (step3Carts || []) as CartRow[]) {
    const ok = await sendStep3(cart, supabase)
    if (ok) {
      await supabase
        .from('carts')
        .update({
          abandoned_email_3_sent_at: nowIso,
          nurture_started_at: nowIso,
          status: 'nurture',
        })
        .eq('id', cart.id)
      sent++
    }
  }

  return Response.json({
    success: true,
    processed: {
      step1: step1Carts?.length || 0,
      step2: step2Carts?.length || 0,
      step3: step3Carts?.length || 0,
    },
    sent,
  })
}

async function ensureContact(cart: CartRow, supabase: Awaited<ReturnType<typeof createServiceClient>>): Promise<string | null> {
  if (cart.contact_id) return cart.contact_id
  if (!cart.email) return null
  const contact = await upsertContact(
    { email: cart.email, source: 'cart_abandon', listSlug: 'cart-abandoners' },
    supabase
  )
  if (!contact) return null
  await supabase.from('carts').update({ contact_id: contact.id }).eq('id', cart.id)
  return contact.id
}

async function sendStep1(cart: CartRow, supabase: Awaited<ReturnType<typeof createServiceClient>>): Promise<boolean> {
  if (!cart.email) return false
  const contactId = await ensureContact(cart, supabase)
  const unsubscribeUrl = contactId ? buildUnsubscribeUrl(contactId) : undefined

  const html = renderHtml(
    `<h2 style="font-size:20px;font-weight:400;text-align:center;margin-bottom:8px;">You left something behind</h2>
     <p style="text-align:center;color:#666;font-size:14px;line-height:1.6;">
       Your cart at ArtByME is waiting for you whenever you are ready.
     </p>
     ${ctaButton(`${SITE_URL}/cart`, 'Return to Your Cart')}`,
    { preheader: 'Your saved cart is waiting for you.', unsubscribeUrl }
  )

  const result = await sendEmail({
    to: cart.email,
    subject: 'You left something behind — ArtByME',
    html,
  })
  return result !== null || !process.env.RESEND_API_KEY
}

async function sendStep2(cart: CartRow, supabase: Awaited<ReturnType<typeof createServiceClient>>): Promise<boolean> {
  if (!cart.email) return false
  const contactId = await ensureContact(cart, supabase)

  // Generate or re-use the cart-abandon code.
  let code = ''
  let percentOff = 10
  if (cart.promo_code_id) {
    const { data: existing } = await supabase
      .from('promo_codes')
      .select('code, discount_value')
      .eq('id', cart.promo_code_id)
      .maybeSingle()
    if (existing) {
      code = existing.code
      percentOff = existing.discount_value
    }
  }
  if (!code) {
    try {
      const created = await generateDiscountCode(
        {
          kind: 'cart_abandon',
          percentOff: 10,
          expiresInHours: 72,
          contactId,
          cartId: cart.id,
          singleUsePerContact: true,
          prefix: 'SAVE10',
          description: `Cart abandon code for cart ${cart.id}`,
        },
        supabase
      )
      code = created.code
      percentOff = created.discount_value
      await supabase.from('carts').update({ promo_code_id: created.id }).eq('id', cart.id)
    } catch (err) {
      console.error('Cart abandon step2 code generation failed', err)
      return false
    }
  }

  const unsubscribeUrl = contactId ? buildUnsubscribeUrl(contactId) : undefined

  const html = renderHtml(
    `<h2 style="font-size:20px;font-weight:400;text-align:center;margin-bottom:8px;">Still thinking about it?</h2>
     <p style="text-align:center;color:#666;font-size:14px;line-height:1.6;">
       Here is 10% off your cart on us. The code is good for 72 hours.
     </p>
     ${discountCallout(code, percentOff, 'Valid for 72 hours')}
     ${ctaButton(`${SITE_URL}/cart`, 'Complete Your Purchase')}`,
    { preheader: `Use ${code} for ${percentOff}% off, good for 72 hours.`, unsubscribeUrl }
  )

  const result = await sendEmail({
    to: cart.email,
    subject: `Your 10% off code is ready — ${code}`,
    html,
  })
  return result !== null || !process.env.RESEND_API_KEY
}

async function sendStep3(cart: CartRow, supabase: Awaited<ReturnType<typeof createServiceClient>>): Promise<boolean> {
  if (!cart.email) return false
  const contactId = await ensureContact(cart, supabase)

  let code = ''
  let percentOff = 10
  if (cart.promo_code_id) {
    const { data: existing } = await supabase
      .from('promo_codes')
      .select('code, discount_value')
      .eq('id', cart.promo_code_id)
      .maybeSingle()
    if (existing) {
      code = existing.code
      percentOff = existing.discount_value
    }
  }

  // Defensive fallback: if for some reason the step2 code is missing,
  // mint a new one rather than send a code-less "last chance" email.
  if (!code) {
    try {
      const created = await generateDiscountCode(
        {
          kind: 'cart_abandon',
          percentOff: 10,
          expiresInHours: 48,
          contactId,
          cartId: cart.id,
          singleUsePerContact: true,
          prefix: 'LAST10',
        },
        supabase
      )
      code = created.code
      percentOff = created.discount_value
      await supabase.from('carts').update({ promo_code_id: created.id }).eq('id', cart.id)
    } catch (err) {
      console.error('Cart abandon step3 fallback code failed', err)
    }
  }

  const unsubscribeUrl = contactId ? buildUnsubscribeUrl(contactId) : undefined

  const body = code
    ? `<h2 style="font-size:20px;font-weight:400;text-align:center;margin-bottom:8px;">Last call on your cart</h2>
       <p style="text-align:center;color:#666;font-size:14px;line-height:1.6;">
         Your 10% off code is still good. This is the final reminder we will send about this cart.
       </p>
       ${discountCallout(code, percentOff, 'Final hours')}
       ${ctaButton(`${SITE_URL}/cart`, "Don't Miss Out", 'coral')}`
    : `<h2 style="font-size:20px;font-weight:400;text-align:center;margin-bottom:8px;">Last call on your cart</h2>
       <p style="text-align:center;color:#666;font-size:14px;line-height:1.6;">
         This is the final reminder we will send about this cart.
       </p>
       ${ctaButton(`${SITE_URL}/cart`, "Don't Miss Out", 'coral')}`

  const html = renderHtml(body, {
    preheader: code ? `Final hours on ${code} — your 10% off code.` : 'Final hours on your cart.',
    unsubscribeUrl,
  })

  const result = await sendEmail({
    to: cart.email,
    subject: 'Last chance — your cart is waiting',
    html,
  })
  return result !== null || !process.env.RESEND_API_KEY
}
