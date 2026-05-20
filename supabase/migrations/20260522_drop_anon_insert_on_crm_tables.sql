-- Tighten security: now that every anon write to crm_contacts and
-- contact_list_members goes through one of the SECURITY DEFINER
-- RPCs (subscribe_to_newsletter, upsert_contact_to_list,
-- record_order_for_contact, mark_contact_unsubscribed), drop the
-- broad anon INSERT/UPDATE policies so nothing can bypass the RPC
-- validation layer.
--
-- The RPCs still work because SECURITY DEFINER runs with the
-- function owner's privileges, not the caller's. Admins can still
-- read/write via the "Admins manage ..." policies.

drop policy if exists "Anon insert crm_contacts" on public.crm_contacts;
drop policy if exists "Anon insert contact_list_members" on public.contact_list_members;
drop policy if exists "Anon update own crm_contact" on public.crm_contacts;
