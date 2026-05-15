import { NextRequest } from 'next/server'
import { createClient } from '@/lib/supabase/server'

export async function GET() {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return Response.json({ error: 'Unauthorized' }, { status: 401 })

  const { data, error } = await supabase
    .from('site_settings')
    .select('default_margin_pct, shipping_quote_zips, updated_at')
    .eq('id', true)
    .single()

  if (error) return Response.json({ error: error.message }, { status: 500 })
  return Response.json({ data })
}

export async function PATCH(request: NextRequest) {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return Response.json({ error: 'Unauthorized' }, { status: 401 })

  const body = await request.json() as {
    default_margin_pct?: number
    shipping_quote_zips?: string[]
  }

  const updates: Record<string, unknown> = { updated_at: new Date().toISOString() }
  if (typeof body.default_margin_pct === 'number') {
    if (body.default_margin_pct < 0 || body.default_margin_pct >= 1) {
      return Response.json({ error: 'default_margin_pct must satisfy 0 <= margin < 1' }, { status: 400 })
    }
    updates.default_margin_pct = body.default_margin_pct
  }
  if (Array.isArray(body.shipping_quote_zips)) {
    updates.shipping_quote_zips = body.shipping_quote_zips.map((z) => String(z).trim()).filter(Boolean)
  }

  const { data, error } = await supabase
    .from('site_settings')
    .update(updates)
    .eq('id', true)
    .select('default_margin_pct, shipping_quote_zips, updated_at')
    .single()

  if (error) return Response.json({ error: error.message }, { status: 500 })
  return Response.json({ data })
}
