import { requireAdmin } from '@/lib/auth/require-admin'

const PROVIDERS = ['instagram', 'facebook', 'twitter', 'tiktok', 'pinterest', 'linkedin'] as const
type Provider = (typeof PROVIDERS)[number]

// Never leak tokens to the client. This is the safe column projection used
// for every list/read response.
const SAFE_COLUMNS =
  'id, provider, handle, display_name, avatar_url, connected, page_id, token_expires_at, extra, created_at, updated_at'

// GET /api/admin/social/accounts — list connected/saved accounts
export async function GET() {
  try {
    const auth = await requireAdmin()
    if (!auth.ok) return auth.response
    const { supabase } = auth

    const { data, error } = await supabase
      .from('social_accounts')
      .select(SAFE_COLUMNS)
      .order('created_at', { ascending: true })

    if (error) return Response.json({ error: error.message }, { status: 500 })
    return Response.json({ accounts: data || [] })
  } catch {
    return Response.json({ error: 'Internal server error.' }, { status: 500 })
  }
}

// POST /api/admin/social/accounts — connect / save an account
export async function POST(request: Request) {
  try {
    const body = await request.json()
    const provider = body.provider as Provider | undefined
    const handle = typeof body.handle === 'string' ? body.handle.trim() : ''

    if (!provider || !PROVIDERS.includes(provider)) {
      return Response.json({ error: 'A valid provider is required.' }, { status: 400 })
    }
    if (!handle) {
      return Response.json({ error: 'Handle is required.' }, { status: 400 })
    }

    const auth = await requireAdmin()
    if (!auth.ok) return auth.response
    const { supabase } = auth

    const insertData: Record<string, unknown> = {
      provider,
      handle,
      display_name: body.display_name || null,
      avatar_url: body.avatar_url || null,
      page_id: body.page_id || null,
      connected: body.connected === true,
      // Tokens are accepted but stored plaintext for Phase 1 (see migration GOTCHA).
      access_token: body.access_token || null,
      refresh_token: body.refresh_token || null,
      token_expires_at: body.token_expires_at || null,
      extra: body.extra ?? null,
    }

    const { data, error } = await supabase
      .from('social_accounts')
      .insert(insertData)
      .select(SAFE_COLUMNS)
      .single()

    if (error) return Response.json({ error: error.message }, { status: 500 })
    return Response.json({ account: data }, { status: 201 })
  } catch {
    return Response.json({ error: 'Internal server error.' }, { status: 500 })
  }
}
