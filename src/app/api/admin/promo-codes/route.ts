import { createClient } from '@/lib/supabase/server'
import { NextRequest } from 'next/server'

export async function GET() {
  try {
    const supabase = await createClient()
    const { data, error } = await supabase
      .from('promo_codes')
      .select('*')
      .order('created_at', { ascending: false })

    if (error) {
      return Response.json({ error: error.message }, { status: 500 })
    }

    return Response.json({ promoCodes: data })
  } catch {
    return Response.json(
      { error: 'Internal server error.' },
      { status: 500 }
    )
  }
}

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

    const supabase = await createClient()
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
      return Response.json({ error: error.message }, { status: 500 })
    }

    return Response.json({ promoCode: data }, { status: 201 })
  } catch {
    return Response.json(
      { error: 'Internal server error.' },
      { status: 500 }
    )
  }
}

export async function PATCH(request: NextRequest) {
  try {
    const body = await request.json()
    const { id, ...updates } = body

    if (!id) {
      return Response.json({ error: 'ID is required.' }, { status: 400 })
    }

    const supabase = await createClient()
    const { data, error } = await supabase
      .from('promo_codes')
      .update(updates)
      .eq('id', id)
      .select()
      .single()

    if (error) {
      return Response.json({ error: error.message }, { status: 500 })
    }

    return Response.json({ promoCode: data })
  } catch {
    return Response.json(
      { error: 'Internal server error.' },
      { status: 500 }
    )
  }
}
