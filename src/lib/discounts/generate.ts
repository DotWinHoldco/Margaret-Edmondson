// Dynamic discount-code generator. Hands back a freshly-inserted
// promo_codes row that can be embedded in an email and redeemed at
// checkout. Used by:
//   - newsletter signup (single-use, contact-scoped, 24h)
//   - cart abandon (single-use, cart-scoped, 72h)
//   - email campaigns (shared, audience-scoped, optional expiry)
//   - manual admin creation

import { createClient } from '@/lib/supabase/server'
import type { Database } from '@/lib/types/database'
import type { SupabaseClient } from '@supabase/supabase-js'
import crypto from 'node:crypto'

type PromoCodeKind = Database['public']['Tables']['promo_codes']['Row']['kind']

export interface GenerateOptions {
  kind: PromoCodeKind
  percentOff?: number
  fixedOffCents?: number
  prefix?: string
  expiresInHours?: number | null
  audienceListId?: string | null
  contactId?: string | null
  cartId?: string | null
  singleUsePerContact?: boolean
  minOrderAmount?: number | null
  usageLimit?: number | null
  description?: string | null
  createdBy?: string | null
}

export interface GeneratedCode {
  id: string
  code: string
  discount_type: 'percentage' | 'fixed'
  discount_value: number
  valid_until: string | null
  kind: PromoCodeKind
  contact_id: string | null
  cart_id: string | null
}

export async function generateDiscountCode(
  opts: GenerateOptions,
  supabaseClient?: SupabaseClient
): Promise<GeneratedCode> {
  if (!opts.percentOff && !opts.fixedOffCents) {
    throw new Error('generateDiscountCode requires percentOff or fixedOffCents')
  }

  const supabase = supabaseClient ?? (await createClient())
  const prefix = (opts.prefix || defaultPrefix(opts.kind)).toUpperCase().replace(/[^A-Z0-9]/g, '')
  const code = `${prefix}-${randomSuffix()}`
  const isPercent = !!opts.percentOff
  const discountType: 'percentage' | 'fixed' = isPercent ? 'percentage' : 'fixed'
  const discountValue = isPercent ? Number(opts.percentOff) : Number(opts.fixedOffCents) / 100

  const validUntil = opts.expiresInHours
    ? new Date(Date.now() + opts.expiresInHours * 3600 * 1000).toISOString()
    : null

  const insert: Database['public']['Tables']['promo_codes']['Insert'] = {
    code,
    discount_type: discountType,
    discount_value: discountValue,
    min_order_amount: opts.minOrderAmount ?? null,
    usage_limit: opts.usageLimit ?? (opts.singleUsePerContact ? 1 : null),
    usage_count: 0,
    valid_from: new Date().toISOString(),
    valid_until: validUntil,
    is_active: true,
    kind: opts.kind,
    audience_list_id: opts.audienceListId ?? null,
    contact_id: opts.contactId ?? null,
    cart_id: opts.cartId ?? null,
    single_use_per_contact: opts.singleUsePerContact ?? false,
    description: opts.description ?? null,
    created_by: opts.createdBy ?? null,
  }

  const { data, error } = await supabase
    .from('promo_codes')
    .insert(insert)
    .select('id, code, discount_type, discount_value, valid_until, kind, contact_id, cart_id')
    .single()

  if (error || !data) {
    throw new Error(`Failed to create promo code: ${error?.message ?? 'unknown error'}`)
  }

  return {
    id: data.id,
    code: data.code,
    discount_type: (data.discount_type ?? discountType) as 'percentage' | 'fixed',
    discount_value: data.discount_value,
    valid_until: data.valid_until,
    kind: data.kind,
    contact_id: data.contact_id,
    cart_id: data.cart_id,
  }
}

function randomSuffix(): string {
  const buf = crypto.randomBytes(4)
  return buf
    .toString('base64')
    .replace(/[^A-Z0-9]/gi, '')
    .toUpperCase()
    .slice(0, 6)
    .padEnd(6, 'X')
}

function defaultPrefix(kind: PromoCodeKind): string {
  switch (kind) {
    case 'newsletter_signup':
      return 'WELCOME'
    case 'cart_abandon':
      return 'SAVE10'
    case 'campaign':
      return 'CAMP'
    case 'automation':
      return 'AUTO'
    default:
      return 'CODE'
  }
}
