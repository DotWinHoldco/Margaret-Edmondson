import { requireAdmin } from '@/lib/auth/require-admin'
import { apiError, dbFail } from '@/lib/api/respond'
import { escapeHtml as escape } from '@/lib/email/escape'

// Render printable purchased specifications; packing slips exclude internal production notes.
export async function GET(
  request: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  const auth = await requireAdmin()
  if (!auth.ok) return auth.response
  const { id } = await params
  const { data: order, error } = await auth.supabase
    .from('orders')
    .select(
      'id,order_number,email,shipping_address,created_at,order_items(id,quantity,purchase_spec,products(title),product_variants(name)),studio_jobs(order_item_id,status,due_at,assignee,notes,replacement_of)',
    )
    .eq('id', id)
    .single()
  if (error) return dbFail(error)
  if (!order) return apiError('Order not found.', 404, 'NOT_FOUND')
  const work = new URL(request.url).searchParams.get('kind') !== 'packing'
  const address = (order.shipping_address || {}) as Record<string, string>
  const addressLines = [
    address.name,
    address.line1,
    address.line2,
    [address.city, address.state, address.postal_code]
      .filter(Boolean)
      .join(', '),
    address.country,
  ]
    .filter(Boolean)
    .map((s) => escape(s))
    .join('<br>')
  const rows = order.order_items
    .map((i: Record<string, unknown>) => {
      const spec = (i.purchase_spec || {}) as Record<string, unknown>,
        details = (spec.details || {}) as Record<string, string>
      const jobs = (
        order.studio_jobs as Array<{
          order_item_id: string
          status: string
          due_at: string
          assignee: string
          notes: string
          replacement_of: string | null
        }>
      ).filter((j) => j.order_item_id === i.id)
      return `<section><h2>${escape(String(spec.title || (i.products as { title?: string })?.title || 'Artwork'))}</h2><p>${escape(String(spec.option_name || (i.product_variants as { name?: string })?.name || ''))} · Quantity ${Number(i.quantity)}</p><p>${escape(String(spec.medium || ''))} ${spec.width_in && spec.height_in ? `${Number(spec.width_in)} × ${Number(spec.height_in)} in` : escape(String(spec.size_label || ''))}</p>${Object.entries(
        details,
      )
        .filter(
          ([k, v]) => v && (work || !['source', 'instructions'].includes(k)),
        )
        .map(([k, v]) => `<p><b>${escape(k)}:</b> ${escape(v)}</p>`)
        .join(
          '',
        )}${work ? jobs.map((j) => `<p><b>${j.replacement_of ? 'Replacement work' : 'Production'}:</b> ${escape(j.status)} · ${escape(j.assignee)} · Ship by ${escape(j.due_at.slice(0, 10))}</p><p>${escape(j.notes)}</p><p>□ Print checked &nbsp; □ Frame checked &nbsp; □ Packed &nbsp; □ Address checked</p>`).join('') : ''}</section>`
    })
    .join('')
  const title = work ? 'Studio work tickets' : 'Packing slip'
  const html = `<!doctype html><html lang="en"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>${title} — ${escape(String(order.order_number || id.slice(0, 8)))}</title><style>body{font:15px/1.6 system-ui;color:#24312c;max-width:800px;margin:40px auto;padding:0 24px}h1,h2{font-family:Georgia,serif}section{border-top:1px solid #ccc;padding:18px 0;break-inside:avoid}p{margin:6px 0}.meta{display:flex;justify-content:space-between;gap:24px}@media print{body{margin:0}.print-hint{display:none}}</style></head><body><h1>ArtByME · ${title}</h1><p class="print-hint">Use your browser’s Print command to print or save as PDF.</p><div class="meta"><div>Order #${escape(String(order.order_number || id.slice(0, 8)))}<br>${escape(order.email)}</div><address>${addressLines}</address></div>${rows}<p>Thank you for supporting Margaret’s art.</p></body></html>`
  return new Response(html, {
    headers: {
      'Content-Type': 'text/html; charset=utf-8',
      'Cache-Control': 'private, no-store',
      'Content-Security-Policy':
        "default-src 'none'; style-src 'unsafe-inline'; base-uri 'none'; frame-ancestors 'self'",
    },
  })
}
