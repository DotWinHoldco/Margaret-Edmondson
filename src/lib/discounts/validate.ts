// Validate a promo code via the validate_promo_code_public RPC. The RPC
// is SECURITY DEFINER and EXECUTE-able only by service_role (revoked
// from anon/authenticated), so this helper invokes it with the
// service-role client. The route handler (cart / checkout) is the
// rate-limited trust boundary; promo_codes is never readable or the
// validator callable directly via PostgREST by an untrusted role.

import { createServiceClient } from '@/lib/supabase/server'
import type { Database } from '@/lib/types/database'

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

interface RpcRow {
  ok: boolean
  reason: string
  code: string | null
  discount_type: 'percentage' | 'fixed' | null
  discount_value: number | null
  amount_off_cents: number | null
}

export async function validateDiscountCode(
  rawCode: string,
  opts: ValidateOptions
): Promise<ValidateResult> {
  const code = (rawCode || '').toUpperCase().trim()
  if (!code) return { ok: false, reason: 'empty' }

  const supabase = await createServiceClient()

  const { data, error } = await supabase.rpc('validate_promo_code_public', {
    p_code: code,
    p_email: opts.email ?? null,
    p_cart_id: opts.cartId ?? null,
    p_cart_subtotal: opts.cartSubtotal,
  })

  if (error) {
    console.error('validate_promo_code_public RPC failed', error)
    return { ok: false, reason: 'lookup_failed' }
  }

  const row = (Array.isArray(data) ? data[0] : data) as RpcRow | null
  if (!row) return { ok: false, reason: 'lookup_failed' }
  if (!row.ok) return { ok: false, reason: row.reason }

  // For Stripe coupon creation the checkout route still needs the
  // full promo_codes row; read it with the same service-role client
  // (promo_codes is otherwise admin-only).
  const { data: full } = await supabase
    .from('promo_codes')
    .select('id, code, discount_type, discount_value, min_order_amount, usage_limit, usage_count, valid_from, valid_until, is_active, kind, audience_list_id, cart_id, contact_id, single_use_per_contact, description, created_by, stripe_coupon_id, created_at, updated_at')
    .eq('code', row.code as string)
    .maybeSingle()

  // Defensive: if the full row read returns null, build a minimal row
  // from the RPC response.
  const minimalRow: PromoCodeRow = (full as PromoCodeRow) ?? ({
    id: '',
    code: row.code as string,
    discount_type: row.discount_type,
    discount_value: row.discount_value ?? 0,
    min_order_amount: null,
    usage_limit: null,
    usage_count: 0,
    valid_from: null,
    valid_until: null,
    is_active: true,
    kind: 'manual',
    audience_list_id: null,
    cart_id: opts.cartId ?? null,
    contact_id: opts.contactId ?? null,
    single_use_per_contact: false,
    description: null,
    created_by: null,
    stripe_coupon_id: null,
    created_at: new Date().toISOString(),
    updated_at: new Date().toISOString(),
  } as PromoCodeRow)

  const amountOffCents = row.amount_off_cents ?? 0
  const stripeCoupon: { percent_off?: number; amount_off?: number; currency?: string; duration: 'once' } = { duration: 'once' }
  if (row.discount_type === 'percentage') {
    stripeCoupon.percent_off = row.discount_value ?? 0
  } else {
    stripeCoupon.amount_off = amountOffCents
    stripeCoupon.currency = 'usd'
  }

  return { ok: true, code: minimalRow, amountOffCents, stripeCoupon }
}
