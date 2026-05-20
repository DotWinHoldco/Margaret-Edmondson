// CRM contact helpers. Every entry point that captures an email (
// newsletter signup, contact form, cart sync, Stripe purchase webhook
// ) should route through these helpers so the canonical
// crm_contacts row and list memberships stay consistent.

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
  profileId?: string | null
}

export async function upsertContact(
  input: UpsertContactInput,
  supabaseClient?: SupabaseClient
): Promise<ContactRow | null> {
  const email = (input.email || '').toLowerCase().trim()
  if (!email || !email.includes('@')) return null

  const supabase = supabaseClient ?? (await createClient())

  const { data: existing } = await supabase
    .from('crm_contacts')
    .select('*')
    .eq('email', email)
    .maybeSingle()

  if (existing) {
    const patch: Database['public']['Tables']['crm_contacts']['Update'] = {
      last_active_at: new Date().toISOString(),
    }
    if (input.firstName && !existing.first_name) patch.first_name = input.firstName
    if (input.lastName && !existing.last_name) patch.last_name = input.lastName
    if (input.phone && !existing.phone) patch.phone = input.phone
    if (input.profileId && !existing.profile_id) patch.profile_id = input.profileId
    if (input.tags && input.tags.length) {
      const merged = Array.from(new Set([...(existing.tags || []), ...input.tags]))
      patch.tags = merged
    }
    if (existing.status === 'unsubscribed' && input.source !== 'resubscribe') {
      // Honor unsubscribe — never reactivate silently.
    }
    const { data, error } = await supabase
      .from('crm_contacts')
      .update(patch)
      .eq('id', existing.id)
      .select('*')
      .maybeSingle()
    if (error) {
      console.error('upsertContact update failed', error)
      return existing
    }
    return data
  }

  const insert: Database['public']['Tables']['crm_contacts']['Insert'] = {
    email,
    first_name: input.firstName ?? null,
    last_name: input.lastName ?? null,
    phone: input.phone ?? null,
    source: input.source ?? 'unknown',
    tags: input.tags ?? [],
    profile_id: input.profileId ?? null,
  }
  const { data, error } = await supabase
    .from('crm_contacts')
    .insert(insert)
    .select('*')
    .maybeSingle()
  if (error) {
    console.error('upsertContact insert failed', error)
    return null
  }
  return data
}

export async function addToList(
  contactId: string,
  listSlug: string,
  source?: string | null,
  supabaseClient?: SupabaseClient
): Promise<boolean> {
  const supabase = supabaseClient ?? (await createClient())
  const { data: list } = await supabase
    .from('contact_lists')
    .select('id')
    .eq('slug', listSlug)
    .maybeSingle()
  if (!list) {
    console.warn('addToList: list not found', listSlug)
    return false
  }
  const { error } = await supabase
    .from('contact_list_members')
    .upsert(
      { contact_id: contactId, list_id: list.id, source: source ?? null },
      { onConflict: 'contact_id,list_id', ignoreDuplicates: true }
    )
  if (error) {
    console.error('addToList failed', error)
    return false
  }
  return true
}

export async function removeFromList(
  contactId: string,
  listSlug: string,
  supabaseClient?: SupabaseClient
): Promise<boolean> {
  const supabase = supabaseClient ?? (await createClient())
  const { data: list } = await supabase
    .from('contact_lists')
    .select('id')
    .eq('slug', listSlug)
    .maybeSingle()
  if (!list) return false
  const { error } = await supabase
    .from('contact_list_members')
    .delete()
    .eq('contact_id', contactId)
    .eq('list_id', list.id)
  if (error) {
    console.error('removeFromList failed', error)
    return false
  }
  return true
}

export async function recordOrder(
  contactId: string,
  orderTotal: number,
  supabaseClient?: SupabaseClient
): Promise<void> {
  const supabase = supabaseClient ?? (await createClient())
  const { data: existing } = await supabase
    .from('crm_contacts')
    .select('total_orders, total_spent_cents')
    .eq('id', contactId)
    .maybeSingle()
  if (!existing) return

  const newTotals: Database['public']['Tables']['crm_contacts']['Update'] = {
    total_orders: (existing.total_orders ?? 0) + 1,
    total_spent_cents: (existing.total_spent_cents ?? 0) + Math.round(orderTotal * 100),
    last_purchase_at: new Date().toISOString(),
    last_active_at: new Date().toISOString(),
  }
  await supabase.from('crm_contacts').update(newTotals).eq('id', contactId)
  await addToList(contactId, 'buyers', 'order', supabase)
}

export async function markUnsubscribed(
  contactId: string,
  listId: string | null | undefined,
  reason: string | null,
  source: string | null,
  meta: { ip?: string | null; userAgent?: string | null; email: string },
  supabaseClient?: SupabaseClient
): Promise<void> {
  const supabase = supabaseClient ?? (await createClient())

  if (listId) {
    await supabase
      .from('contact_list_members')
      .delete()
      .eq('contact_id', contactId)
      .eq('list_id', listId)
  } else {
    await supabase
      .from('crm_contacts')
      .update({ status: 'unsubscribed' })
      .eq('id', contactId)
    await supabase
      .from('newsletter_subscribers')
      .update({ unsubscribed_at: new Date().toISOString() })
      .eq('email', meta.email)
  }

  await supabase.from('unsubscribe_events').insert({
    contact_id: contactId,
    list_id: listId ?? null,
    email: meta.email,
    reason,
    source,
    ip: meta.ip ?? null,
    user_agent: meta.userAgent ?? null,
  })
}
