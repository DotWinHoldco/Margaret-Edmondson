import { requireAdminPage } from '@/lib/auth/admin-page-guard'
import { festivePaintings } from '@/sites/margaret-edmondson/festive-class'
import { registrationPayload } from '@/lib/classes/festive/model'
import { z } from 'zod'

export const dynamic = 'force-dynamic'
/** Authored by DotWin. Staff-only live-paid roster and canvas preparation totals. Test orders are excluded. */
export default async function MargaretClassRoster() {
  const { supabase: db } = await requireAdminPage()
  // Paginate all paid orders so PostgREST's response limit never caps class attendance.
  const orders: { id: string; payload: ReturnType<typeof registrationPayload.parse>; total: number }[] = []
  for (let start = 0; ; start += 500) {
    const { data, error } = await db.from('festive_registrations').select('id,payload,total').eq('class_slug', 'festive-paint-at-the-market').eq('mode', 'live').eq('status', 'paid').order('created_at').order('id').range(start, start + 499)
    if (error) throw new Error('The class roster could not be loaded. Please try again.')
    orders.push(...z.array(z.object({ id: z.string().uuid(), payload: registrationPayload, total: z.number().int() })).parse(data))
    if (data.length < 500) break
  }
  const painters = orders.flatMap(order => order.payload.painters)
  return <section className="space-y-6">
    <div><h1 className="text-2xl font-semibold">Festive Paint at the Market</h1><p>November 21 · 9 AM–12:30 PM · {painters.length} paid painters · {orders.length} group registrations</p><p>Live paid registrations only. No attendance limit.</p></div>
    <div className="grid grid-cols-2 gap-4 md:grid-cols-4">{festivePaintings.map(painting => <div className="border border-border p-4" key={painting.id}><strong>{painting.name}</strong><p>{painters.filter(painter => painter.painting === painting.id).length} canvases</p></div>)}</div>
    {orders.length === 0 ? <p>No paid registrations yet.</p> : <div className="overflow-x-auto"><table className="w-full text-left text-sm"><thead><tr><th className="p-3">Contact</th><th className="p-3">Painters & projects</th><th className="p-3">Paid</th></tr></thead><tbody>{orders.map(order => <tr key={order.id} className="border-t border-border"><td className="p-3">{order.payload.name}<br />{order.payload.email}<br />{order.payload.phone}</td><td className="p-3">{order.payload.painters.map((painter, index) => <div key={index}>{painter.name || `Painter ${index + 1}`} · {festivePaintings.find(item => item.id === painter.painting)?.name}</div>)}</td><td className="p-3">${(order.total / 100).toFixed(2)}</td></tr>)}</tbody></table></div>}
  </section>
}
