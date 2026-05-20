// Email automation engine. Runs every 30 minutes (vercel.json).
//
// Today this handles cart_abandon_nurture: a weekly send to carts that
// completed the 1h/24h/72h sequence without converting. The framework
// is in place to add welcome series and post-purchase later by adding
// branches per trigger_event.

import { createClient } from '@/lib/supabase/server'
import { renderAndSend } from '@/lib/email/render'
import { discountCallout } from '@/lib/email/shell'
import { generateDiscountCode } from '@/lib/discounts/generate'
import { buildUnsubscribeUrl } from '@/lib/email/unsubscribe'
import type { Database } from '@/lib/types/database'

type AutomationStep = Database['public']['Tables']['email_automation_steps']['Row']

export async function GET(request: Request) {
  const authHeader = request.headers.get('authorization')
  if (authHeader !== `Bearer ${process.env.CRON_SECRET}`) {
    return Response.json({ error: 'Unauthorized' }, { status: 401 })
  }

  const supabase = await createClient()
  let totalSent = 0

  // Cart abandon nurture: weekly email until they buy or unsubscribe.
  const sevenDaysAgo = new Date(Date.now() - 7 * 24 * 3600 * 1000).toISOString()

  const { data: nurtureCarts } = await supabase
    .from('carts')
    .select('*')
    .not('email', 'is', null)
    .is('converted_order_id', null)
    .not('nurture_started_at', 'is', null)
    .or(`nurture_last_sent_at.is.null,nurture_last_sent_at.lt.${sevenDaysAgo}`)
    .limit(100)

  const { data: automation } = await supabase
    .from('email_automations')
    .select('id, slug, is_active, email_automation_steps(*)')
    .eq('slug', 'cart-nurture-weekly')
    .maybeSingle()

  if (automation?.is_active && Array.isArray(automation.email_automation_steps)) {
    const steps = (automation.email_automation_steps as AutomationStep[]).sort((a, b) => a.step_order - b.step_order)
    const step = steps[0]
    if (step) {
      for (const cart of nurtureCarts || []) {
        if (!cart.email) continue
        // Honor unsubscribe at send time.
        if (cart.contact_id) {
          const { data: contact } = await supabase
            .from('crm_contacts')
            .select('status')
            .eq('id', cart.contact_id)
            .maybeSingle()
          if (contact?.status === 'unsubscribed') {
            await supabase.from('carts').update({ status: 'dead' }).eq('id', cart.id)
            continue
          }
        }

        // Generate (or re-use) a nurture-scoped code.
        let codeText = ''
        let percentOff = step.promo_percent_off || 10
        if (cart.promo_code_id) {
          const { data: existing } = await supabase
            .from('promo_codes')
            .select('code, discount_value, valid_until')
            .eq('id', cart.promo_code_id)
            .maybeSingle()
          if (existing && existing.valid_until && new Date(existing.valid_until) > new Date()) {
            codeText = existing.code
            percentOff = existing.discount_value
          }
        }
        if (!codeText) {
          try {
            const created = await generateDiscountCode(
              {
                kind: 'automation',
                percentOff,
                expiresInHours: step.promo_expires_in_hours || 168,
                contactId: cart.contact_id,
                cartId: cart.id,
                singleUsePerContact: true,
                prefix: 'COMEBACK',
                description: `Cart nurture code for cart ${cart.id}`,
              },
              supabase
            )
            codeText = created.code
            percentOff = created.discount_value
            await supabase.from('carts').update({ promo_code_id: created.id }).eq('id', cart.id)
          } catch (err) {
            console.error('nurture code generation failed', err)
            continue
          }
        }

        const unsubscribeUrl = cart.contact_id ? buildUnsubscribeUrl(cart.contact_id) : undefined
        const callout = discountCallout(
          codeText,
          percentOff,
          step.promo_expires_in_hours ? `Valid for ${Math.round(step.promo_expires_in_hours / 24)} days` : undefined
        )
        const body = `${step.content_html}\n${callout}`

        const result = await renderAndSend({
          to: cart.email,
          subject: step.subject,
          body,
          preheader: step.preheader || undefined,
          contactId: cart.contact_id || undefined,
          context: {
            discount_code: codeText,
            discount_value: percentOff,
          },
        }).catch((err) => {
          console.error('nurture send failed', err)
          return null
        })

        if (result !== null || !process.env.RESEND_API_KEY) {
          await supabase
            .from('carts')
            .update({ nurture_last_sent_at: new Date().toISOString() })
            .eq('id', cart.id)
          totalSent++
        }
        // unsubscribeUrl is consumed by renderAndSend via contactId.
        void unsubscribeUrl
      }
    }
  }

  return Response.json({
    ok: true,
    nurture_carts_considered: nurtureCarts?.length || 0,
    sent: totalSent,
  })
}
