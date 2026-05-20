// CRM contact helpers. Every public-facing entry point that captures
// an email (newsletter signup, contact form, commissions, class
// signup, cart sync, Stripe webhook) routes through the
// upsert_contact_to_list SECURITY DEFINER RPC so anon callers can
// write to crm_contacts + contact_list_members without needing
// direct grants — and so admins call the exact same atomic path.

import { createClient } from '@/lib/supabase/server'
import type { Database } from '@/lib/types/database'
import type { SupabaseClient } from '@supabase/supabase-js'

type ContactRow = Database['public']['Tables']['crm_contacts']['Row']

export interface UpsertContactInput {
  email: string
  firstName?: string | null
  lastName?: string | null
  phone?: string | null
  source?: string | null
  tags?: string[]
  /** Optional list to join in the same RPC call. */
  listSlug?: string | null
}

export interface UpsertContactResult {
  id: string
}

/** Returns the contact id (creates the row if not already present). */
export async function upsertContact(
  input: UpsertContactInput,
  supabaseClient?: SupabaseClient
): Promise<UpsertContactResult | null> {
  const email = (input.email || '').toLowerCase().trim()
  if (!email || !email.includes('@')) return null

  const supabase = supabaseClient ?? (await createClient())
  const { data, error } = await supabase.rpc('upsert_contact_to_list', {
    p_email: email,
    p_list_slug: input.listSlug ?? null,
    p_first_name: input.firstName ?? null,
    p_last_name: input.lastName ?? null,
    p_phone: input.phone ?? null,
    p_source: input.source ?? 'unknown',
    p_tags: input.tags ?? [],
  })
  if (error || !data) {
    console.error('upsertContact RPC failed', error)
    return null
  }
  return { id: data as string }
}

/** Convenience: upsert contact and join a list in one call. */
export async function upsertAndJoinList(
  email: string,
  listSlug: string,
  extra?: Omit<UpsertContactInput, 'email' | 'listSlug'>,
  supabaseClient?: SupabaseClient
): Promise<string | null> {
  const r = await upsertContact({ email, listSlug, ...(extra ?? {}) }, supabaseClient)
  return r?.id ?? null
}

/** Standalone join (when the contact id is already known). */
export async function addToList(
  contactIdOrEmail: string,
  listSlug: string,
  source?: string | null,
  supabaseClient?: SupabaseClient
): Promise<boolean> {
  // The caller may pass either the contact id (uuid) or the email.
  // We always route through the RPC so RLS is consistent.
  if (contactIdOrEmail.includes('@')) {
    const r = await upsertAndJoinList(contactIdOrEmail, listSlug, { source }, supabaseClient)
    return r !== null
  }
  // If we got a uuid, we need the email to call the RPC. Look it up
  // through a fresh anon-readable channel — but anon can't SELECT
  // crm_contacts. In practice this branch is only hit from
  // admin-authenticated code paths where SELECT works.
  const supabase = supabaseClient ?? (await createClient())
  const { data: row } = await supabase
    .from('crm_contacts')
    .select('email')
    .eq('id', contactIdOrEmail)
    .maybeSingle()
  if (!row?.email) return false
  const r = await upsertAndJoinList(row.email, listSlug, { source }, supabase)
  return r !== null
}

/** Stripe webhook: attribute the order to the contact + bump totals. */
export async function recordOrder(
  email: string,
  orderTotal: number,
  options: { promoCodeId?: string | null; amountOffCents?: number; orderId?: string | null } = {},
  supabaseClient?: SupabaseClient
): Promise<string | null> {
  const supabase = supabaseClient ?? (await createClient())
  const { data, error } = await supabase.rpc('record_order_for_contact', {
    p_email: email,
    p_order_total: orderTotal,
    p_promo_code_id: options.promoCodeId ?? null,
    p_amount_off_cents: options.amountOffCents ?? 0,
    p_order_id: options.orderId ?? null,
  })
  if (error) {
    console.error('recordOrder RPC failed', error)
    return null
  }
  return (data as string) ?? null
}

export async function markUnsubscribed(
  contactId: string,
  listId: string | null | undefined,
  reason: string | null,
  source: string | null,
  meta: { ip?: string | null; userAgent?: string | null; email?: string },
  supabaseClient?: SupabaseClient
): Promise<void> {
  const supabase = supabaseClient ?? (await createClient())
  const { error } = await supabase.rpc('mark_contact_unsubscribed', {
    p_contact_id: contactId,
    p_list_id: listId ?? null,
    p_reason: reason,
    p_source: source,
    p_ip: meta.ip ?? null,
    p_user_agent: meta.userAgent ?? null,
  })
  if (error) {
    console.error('markUnsubscribed RPC failed', error)
  }
}

// Re-export the ContactRow type for consumers who want it.
export type { ContactRow }
