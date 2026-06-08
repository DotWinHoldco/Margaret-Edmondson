-- A-14 / F-3: Add policies to the four RLS-enabled-but-policy-less tables.
-- Writes flow through the service client (webhooks/crons, fixed in Phase 1
-- code); these policies give admins read access (and full CRUD on
-- commission_milestones) so the audit trail, webhook log viewer, meta-event
-- viewer, and commission milestones features actually work.
-- Down (manual revert): DROP POLICY IF EXISTS each policy created below.

-- audit_log: admin read + admin insert (logChanges runs as the authed admin)
DROP POLICY IF EXISTS "Admins can read audit_log" ON public.audit_log;
CREATE POLICY "Admins can read audit_log" ON public.audit_log
  FOR SELECT TO authenticated USING (public.is_admin_or_artist());

DROP POLICY IF EXISTS "Admins can insert audit_log" ON public.audit_log;
CREATE POLICY "Admins can insert audit_log" ON public.audit_log
  FOR INSERT TO authenticated WITH CHECK (public.is_admin_or_artist());

-- commission_milestones: admin full access
DROP POLICY IF EXISTS "Admins manage commission_milestones" ON public.commission_milestones;
CREATE POLICY "Admins manage commission_milestones" ON public.commission_milestones
  FOR ALL TO authenticated USING (public.is_admin_or_artist()) WITH CHECK (public.is_admin_or_artist());

-- meta_events: admin read (writes via service_role from pixel route / cron)
DROP POLICY IF EXISTS "Admins can read meta_events" ON public.meta_events;
CREATE POLICY "Admins can read meta_events" ON public.meta_events
  FOR SELECT TO authenticated USING (public.is_admin_or_artist());

-- webhook_logs: admin read (writes via service_role from webhook routes)
DROP POLICY IF EXISTS "Admins can read webhook_logs" ON public.webhook_logs;
CREATE POLICY "Admins can read webhook_logs" ON public.webhook_logs
  FOR SELECT TO authenticated USING (public.is_admin_or_artist());
