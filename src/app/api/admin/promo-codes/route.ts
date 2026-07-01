import { requireAdmin } from '@/lib/auth/require-admin'
import { apiError, apiFail, dbFail } from '@/lib/api/respond'
import { NextRequest } from 'next/server'

// A duplicate promo code trips the unique index on promo_codes.code.
const DUPLICATE_CODE_MESSAGE =
  'That promo code already exists. Please use a different code.'

// GET /api/admin/promo-codes — list all promo codes; admin only.
export async function GET() {
  try {
    const auth = await requireAdmin()
    if (!auth.ok) return auth.response
    const supabase = auth.supabase
    const { data, error } = await supabase
      .from('promo_codes')
      .select('id, code, discount_type, discount_value, min_order_amount, usage_limit, usage_count, valid_from, valid_until, is_active, kind, audience_list_id, cart_id, contact_id, single_use_per_contact, description, created_by, stripe_coupon_id, created_at, updated_at')
      .order('created_at', { ascending: false })

    if (error) {
      return dbFail(error, 'admin/promo-codes GET')
    }

    return Response.json({ promoCodes: data })
  } catch (err) {
    return apiFail(err, { context: 'admin/promo-codes GET' })
  }
}

// POST /api/admin/promo-codes — create a promo code; admin only.
export async function POST(request: NextRequest) {
  try {
    const body = await request.json()
    const {
      code,
      discount_type,
      discount_value,
      min_order_amount,
      usage_limit,
      valid_from,
      valid_until,
    } = body

    if (!code || !discount_type || discount_value === undefined) {
      return Response.json(
        { error: 'Code, discount type, and discount value are required.' },
        { status: 400 }
      )
    }

    const auth = await requireAdmin()
    if (!auth.ok) return auth.response
    const supabase = auth.supabase
    const { data, error } = await supabase
      .from('promo_codes')
      .insert({
        code: code.toUpperCase().trim(),
        discount_type,
        discount_value: parseFloat(discount_value),
        min_order_amount: min_order_amount ? parseFloat(min_order_amount) : null,
        usage_limit: usage_limit ? parseInt(usage_limit) : null,
        usage_count: 0,
        valid_from: valid_from || null,
        valid_until: valid_until || null,
        is_active: true,
      })
      .select()
      .single()

    if (error) {
      if (error.code === '23505') {
        return apiError(DUPLICATE_CODE_MESSAGE, 409, 'CONFLICT')
      }
      return dbFail(error, 'admin/promo-codes POST')
    }

    return Response.json({ promoCode: data }, { status: 201 })
  } catch (err) {
    return apiFail(err, { context: 'admin/promo-codes POST' })
  }
}

// PATCH /api/admin/promo-codes — update a promo code by id; admin only.
export async function PATCH(request: NextRequest) {
  try {
    const body = await request.json()
    const { id, ...updates } = body

    if (!id) {
      return Response.json({ error: 'ID is required.' }, { status: 400 })
    }

    const auth = await requireAdmin()
    if (!auth.ok) return auth.response
    const supabase = auth.supabase
    const { data, error } = await supabase
      .from('promo_codes')
      .update(updates)
      .eq('id', id)
      .select()
      .single()

    if (error) {
      if (error.code === '23505') {
        return apiError(DUPLICATE_CODE_MESSAGE, 409, 'CONFLICT')
      }
      return dbFail(error, 'admin/promo-codes PATCH')
    }

    return Response.json({ promoCode: data })
  } catch (err) {
    return apiFail(err, { context: 'admin/promo-codes PATCH' })
  }
}

// DELETE /api/admin/promo-codes — delete a promo code by id; admin only.
export async function DELETE(request: NextRequest) {
  try {
    const body = await request.json()
    const { id } = body

    if (!id) {
      return Response.json({ error: 'ID is required.' }, { status: 400 })
    }

    const auth = await requireAdmin()
    if (!auth.ok) return auth.response
    const supabase = auth.supabase
    const { error } = await supabase
      .from('promo_codes')
      .delete()
      .eq('id', id)

    if (error) {
      return dbFail(error, 'admin/promo-codes DELETE')
    }

    return Response.json({ success: true })
  } catch (err) {
    return apiFail(err, { context: 'admin/promo-codes DELETE' })
  }
}
