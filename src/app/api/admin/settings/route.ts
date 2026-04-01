import { createClient } from '@/lib/supabase/server'
import { NextRequest } from 'next/server'

const INTEGRATION_KEYS = [
  { key: 'STRIPE_SECRET_KEY', label: 'Stripe' },
  { key: 'LUMAPRINTS_API_KEY', label: 'Lumaprints' },
  { key: 'PRINTFUL_ACCESS_TOKEN', label: 'Printful' },
  { key: 'SHIPSTATION_API_KEY', label: 'ShipStation' },
  { key: 'RESEND_API_KEY', label: 'Resend' },
  { key: 'NEXT_PUBLIC_META_PIXEL_ID', label: 'Meta Pixel' },
]

export async function GET() {
  try {
    const integrations = INTEGRATION_KEYS.map(({ key, label }) => ({
      label,
      configured: !!process.env[key],
    }))

    const supabase = await createClient()
    const { data: globalContent } = await supabase
      .from('site_content')
      .select('*')
      .eq('page', 'global')
      .maybeSingle()

    return Response.json({
      integrations,
      siteName: process.env.NEXT_PUBLIC_SITE_NAME || 'ArtByMe',
      siteUrl: process.env.NEXT_PUBLIC_SITE_URL || '',
      globalSettings: globalContent || null,
    })
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
    const { seo_title, seo_description } = body

    const supabase = await createClient()

    // Upsert global site_content row
    const { data: existing } = await supabase
      .from('site_content')
      .select('id')
      .eq('page', 'global')
      .maybeSingle()

    const contentData = {
      page: 'global',
      section: 'seo',
      content: {
        seo_title: seo_title || '',
        seo_description: seo_description || '',
      },
      updated_at: new Date().toISOString(),
    }

    if (existing) {
      const { error } = await supabase
        .from('site_content')
        .update(contentData)
        .eq('id', existing.id)

      if (error) {
        return Response.json({ error: error.message }, { status: 500 })
      }
    } else {
      const { error } = await supabase
        .from('site_content')
        .insert(contentData)

      if (error) {
        return Response.json({ error: error.message }, { status: 500 })
      }
    }

    return Response.json({ success: true })
  } catch {
    return Response.json(
      { error: 'Internal server error.' },
      { status: 500 }
    )
  }
}
