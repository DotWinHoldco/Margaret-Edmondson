// Authored by DotWin
import { requireAdmin } from '@/lib/auth/require-admin'
import { billingCommand } from '@/lib/billing/contracts'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'
const endpoint = 'https://entrepreneurs.win/api/client-billing/artbyme'
const privateHeaders = { 'Cache-Control': 'private, no-store, max-age=0', Vary: 'Cookie' }

/** Forward a validated ArtByME session to its fixed DotWin billing service without sharing merchant keys. */
async function forward(request: Request, method: 'GET' | 'POST') {
  const auth = await requireAdmin()
  if (!auth.ok) return auth.response
  try {
    let body: string | undefined
    if (method === 'POST') {
      const origin = request.headers.get('origin')
      if (!origin || origin !== new URL(request.url).origin || !request.headers.get('content-type')?.startsWith('application/json')) {
        return Response.json({ error: 'This request could not be verified. Refresh the page and try again.' }, { status: 403, headers: privateHeaders })
      }
      const raw = await request.text()
      if (raw.length > 4096) return Response.json({ error: 'Invalid request.' }, { status: 400, headers: privateHeaders })
      const parsed = billingCommand.safeParse(JSON.parse(raw))
      if (!parsed.success) return Response.json({ error: 'Invalid request.' }, { status: 400, headers: privateHeaders })
      body = JSON.stringify(parsed.data)
    }
    const { data: { session }, error } = await auth.supabase.auth.getSession()
    if (error || !session || session.user.id !== auth.user.id) return Response.json({ error: 'Please sign in again.' }, { status: 401, headers: privateHeaders })
    const bridgeKey = process.env.DOTWIN_BILLING_BRIDGE_KEY
    if (!bridgeKey) throw new Error('Billing connection unavailable')
    const url = new URL(endpoint)
    const invoice = method === 'GET' ? new URL(request.url).searchParams.get('invoice') : null
    if (invoice) {
      if (!/^in_[A-Za-z0-9]+$/.test(invoice)) return Response.json({ error: 'Invalid invoice.' }, { status: 400, headers: privateHeaders })
      url.searchParams.set('invoice', invoice)
    }
    const response = await fetch(url, { method, headers: { Authorization: `Bearer ${session.access_token}`, 'Content-Type': 'application/json', 'X-ArtByME-Billing-Bridge': bridgeKey },
      body, cache: 'no-store', redirect: 'error', signal: AbortSignal.timeout(30000) })
    if (!response.ok) {
      const status = [400, 401, 403, 404, 409, 429].includes(response.status) ? response.status : 503
      const message = status === 401 ? 'Please sign in again.' : status === 403 ? 'Your account cannot manage this subscription.'
        : status === 409 ? 'This subscription has ended. Please contact DotWin for help.' : 'Billing could not be updated. Please try again.'
      return Response.json({ error: message }, { status, headers: privateHeaders })
    }
    if (invoice) {
      if (!response.headers.get('content-type')?.includes('application/pdf')) throw new Error('Invalid invoice response')
      return new Response(await response.arrayBuffer(), { headers: { ...privateHeaders, 'Content-Type': 'application/pdf', 'Content-Disposition': `attachment; filename="invoice-${invoice}.pdf"` } })
    }
    return Response.json(await response.json(), { headers: privateHeaders })
  } catch (error: unknown) {
    if (error instanceof SyntaxError) return Response.json({ error: 'Invalid request.' }, { status: 400, headers: privateHeaders })
    console.error('Subscription billing unavailable', { kind: error instanceof SyntaxError ? 'invalid_request' : 'upstream_failure' })
    return Response.json({ error: 'Billing is temporarily unavailable. Please try again.' }, { status: 503, headers: privateHeaders })
  }
}

/** Read the signed-in site's subscription, payment history, or an owned invoice download. */
export async function GET(request: Request) { return forward(request, 'GET') }

/** Validate same-origin billing commands and keep every card or renewal action in ArtByME. */
export async function POST(request: Request) { return forward(request, 'POST') }
