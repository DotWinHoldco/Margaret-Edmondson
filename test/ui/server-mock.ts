// Used only by the isolated Vite review, never by Next.js.
const job = {
  id: '44444444-4444-4444-8444-444444444444',
  order_id: '33333333-3333-4333-8333-333333333333',
  order_item_id: '22222222-2222-4222-8222-222222222222',
  replacement_of: null,
  quantity: 2,
  status: 'framing',
  due_at: '2026-09-21T18:00:00Z',
  assignee: 'Margaret',
  notes: '',
  hold_reason: null,
  revision: 1,
  is_overdue: false,
  item: {
    purchase_spec: {
      title: 'Morning light',
      option_name: '12 × 16 framed print',
      kind: 'print',
    },
    quantity: 2,
    unit_price: 95,
    fulfillment_status: 'submitted',
  },
  order: {
    id: '33333333-3333-4333-8333-333333333333',
    order_number: 1042,
    email: 'sample@example.com',
    status: 'processing',
  },
}
export async function createClient() {
  return {
    rpc: async () => ({ data: [{ job, total: 1 }], error: null }),
    from() {
      const chain = {
        select() {
          return chain
        },
        eq() {
          return chain
        },
        in() {
          return chain
        },
        not() {
          return chain
        },
        limit() {
          return Promise.resolve({ data: [], error: null })
        },
      }
      return chain
    },
  }
}
