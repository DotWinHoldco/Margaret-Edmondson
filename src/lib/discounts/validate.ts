// Validate a promo code against scope, expiry, usage, and contact
// constraints. Returns the canonical discount amount so callers can
// price-check before handing the code to Stripe.

import { createClient } from '@/lib/supabase/server'
import type { Database } from '@/lib/types/database'
import type { SupabaseClient } from '@supabase/supabase-js'

type PromoCodeRow = Database['public']['Tables']['promo_codes']['Row']

export interface ValidateOptions {
  contactId?: string | null
  email?: string | null
  cartId?: string | null
  cartSubtotal: number
}

export type ValidateResult =
  | {
      ok: true
      code: PromoCodeRow
      amountOffCents: number
      stripeCoupon: { percent_off?: number; amount_off?: number; currency?: string; duration: 'once' }
    }
  | { ok: false; reason: string }

export async function validateDiscountCode(
  rawCode: string,
  opts: ValidateOptions,
  supabaseClient?: SupabaseClient
): Promise<ValidateResult> {
  const code = (rawCode || '').toUpperCase().trim()
  if (!code) return { ok: false, reason: 'empty' }

  const supabase = supabaseClient ?? (await createClient())

  const { data: row, error } = await supabase
    .from('promo_codes')
    .select('*')
    .eq('code', code)
    .maybeSingle()

  if (error) {
    console.error('validateDiscountCode lookup failed', error)
    return { ok: false, reason: 'lookup_failed' }
  }
  if (!row) return { ok: false, reason: 'not_found' }
  if (!row.is_active) return { ok: false, reason: 'inactive' }

  const now = new Date()
  if (row.valid_from && new Date(row.valid_from) > now) return { ok: false, reason: 'not_yet_valid' }
  if (row.valid_until && new Date(row.valid_until) < now) return { ok: false, reason: 'expired' }

  if (row.min_order_amount != null && opts.cartSubtotal < row.min_order_amount) {
    return { ok: false, reason: 'min_order_not_met' }
  }

  if (row.usage_limit != null && row.usage_count >= row.usage_limit) {
    return { ok: false, reason: 'usage_exhausted' }
  }

  if (row.contact_id) {
    if (!opts.contactId || opts.contactId !== row.contact_id) {
      return { ok: false, reason: 'wrong_contact' }
    }
  }

  if (row.cart_id) {
    if (!opts.cartId || opts.cartId !== row.cart_id) {
      return { ok: false, reason: 'wrong_cart' }
    }
  }

  if (row.single_use_per_contact && opts.contactId) {
    const { count } = await supabase
      .from('promo_code_redemptions')
      .select('id', { count: 'exact', head: true })
      .eq('promo_code_id', row.id)
      .eq('contact_id', opts.contactId)
    if ((count ?? 0) > 0) return { ok: false, reason: 'already_redeemed' }
  }

  const subtotalCents = Math.round(opts.cartSubtotal * 100)
  let amountOffCents = 0
  const stripeCoupon: ValidateResult extends { ok: true } ? never : { percent_off?: number; amount_off?: number; currency?: string; duration: 'once' } = { duration: 'once' }

  if (row.discount_type === 'percentage') {
    amountOffCents = Math.floor((subtotalCents * row.discount_value) / 100)
    stripeCoupon.percent_off = row.discount_value
  } else {
    amountOffCents = Math.min(subtotalCents, Math.round(row.discount_value * 100))
    stripeCoupon.amount_off = amountOffCents
    stripeCoupon.currency = 'usd'
  }

  return { ok: true, code: row, amountOffCents, stripeCoupon }
}
