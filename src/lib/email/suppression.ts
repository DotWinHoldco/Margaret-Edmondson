import { createServiceClient } from '@/lib/supabase/server'
import type { SupabaseClient } from '@supabase/supabase-js'

/**
 * COM-2: central unsubscribe-suppression gate for marketing and automated mail.
 *
 * A contact whose crm_contacts.status is 'unsubscribed' must not receive
 * marketing or automated sends on ANY path (campaigns, automations,
 * abandoned-cart, nurture, welcome, post-purchase note). Previously only the
 * campaign and automation crons checked status, so abandoned-cart and the
 * trigger sends mailed unsubscribed contacts.
 *
 * Transactional mail (order receipts, shipping updates, magic links, studio
 * owner notifications) does NOT call this and is unaffected — those must always
 * deliver.
 *
 * Resolution: a contact is suppressed only when an explicit 'unsubscribed'
 * status is found. A not-yet-known contact (no row) is NOT suppressed, so first
 * sends (e.g. welcome) still go out. On a lookup error this fails OPEN (returns
 * false) and logs, so a transient DB blip never mass-drops mail; the real
 * unsubscribe signal (status = 'unsubscribed') is still honored whenever it is
 * readable.
 */
export async function isSuppressed(
  target: { email?: string | null; contactId?: string | null },
  supabase?: SupabaseClient,
): Promise<boolean> {
  const email = (target.email || '').toLowerCase().trim()
  const contactId = target.contactId || null
  if (!email && !contactId) return false

  try {
    const db = supabase ?? (await createServiceClient())
    const base = db.from('crm_contacts').select('status')
    const { data, error } = await (contactId
      ? base.eq('id', contactId)
      : base.eq('email', email)
    ).maybeSingle()

    if (error) {
      console.error('isSuppressed lookup failed (allowing send):', error.message)
      return false
    }
    return data?.status === 'unsubscribed'
  } catch (err) {
    console.error('isSuppressed threw (allowing send):', err)
    return false
  }
}
