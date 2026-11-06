// Authored by DotWin
import type { Database } from '@/lib/supabase/database.types'

type Profile = Pick<Database['public']['Tables']['profiles']['Row'], 'id' | 'email' | 'full_name' | 'role' | 'created_at'>
type Order = Pick<Database['public']['Tables']['orders']['Row'], 'email' | 'total' | 'status' | 'stripe_mode' | 'shipping_address' | 'created_at'>

export type Customer = {
  id: string; email: string; name: string; role: string; since: string
  orderCount: number; paidTotal: number
}

export function normalizeCustomerEmail(email: string) { return email.trim().toLowerCase() }

/** ILIKE without wildcard matching: an email containing _ or % is still literal. */
export function customerEmailPattern(email: string) {
  return normalizeCustomerEmail(email).replace(/[\\%_]/g, '\\$&')
}

export function customerOrdersHref(email: string) {
  return `/admin/orders?${new URLSearchParams({ customer: normalizeCustomerEmail(email) })}`
}

/** Include guest buyers even if they have not registered; test payments never add revenue. */
export function customerDirectory(profiles: Profile[], orders: Order[], search = ''): Customer[] {
  const customers = new Map<string, Customer>()
  for (const profile of profiles) {
    const email = normalizeCustomerEmail(profile.email || '')
    customers.set(email || profile.id, {
      id: profile.id, email, name: profile.full_name || '', role: profile.role || 'customer',
      since: profile.created_at || '', orderCount: 0, paidTotal: 0,
    })
  }
  for (const order of orders) {
    if (order.stripe_mode === 'test') continue
    const email = normalizeCustomerEmail(order.email || '')
    if (!email) continue
    const address = order.shipping_address
    const name = address && typeof address === 'object' && !Array.isArray(address) && typeof address.name === 'string' ? address.name : ''
    const customer = customers.get(email) || {
      id: `guest:${email}`, email, name, role: 'guest', since: order.created_at || '', orderCount: 0, paidTotal: 0,
    }
    customer.name ||= name
    customer.orderCount += 1
    if (['processing', 'shipped', 'delivered'].includes(order.status || '')) customer.paidTotal += order.total || 0
    if (order.created_at && (!customer.since || order.created_at < customer.since)) customer.since = order.created_at
    customers.set(email, customer)
  }
  const term = search.trim().toLowerCase()
  return [...customers.values()]
    .filter(customer => !term || `${customer.name}\n${customer.email}`.toLowerCase().includes(term))
    .sort((a, b) => b.since.localeCompare(a.since))
}
