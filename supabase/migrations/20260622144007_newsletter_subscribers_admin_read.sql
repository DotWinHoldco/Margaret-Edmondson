-- DB-2 (P1): stop leaking the newsletter list to every logged-in customer.
--
-- The live SELECT policy "Authenticated can read newsletter_subscribers" used
-- USING (auth.role() = 'authenticated'), so ANY authenticated user could read
-- every subscriber email. Every other PII surface on this table is already
-- admin-scoped (insert/update/delete use is_admin_or_artist()). Replace the
-- SELECT policy to match.
--
-- This is a pure tightening, safe to apply ahead of any code (no app path
-- relies on a non-admin reading the full subscriber list).
--
-- Down (manual revert):
--   DROP POLICY IF EXISTS "Admins can read newsletter_subscribers" ON public.newsletter_subscribers;
--   CREATE POLICY "Authenticated can read newsletter_subscribers"
--     ON public.newsletter_subscribers FOR SELECT
--     USING (auth.role() = 'authenticated');

DROP POLICY IF EXISTS "Authenticated can read newsletter_subscribers"
  ON public.newsletter_subscribers;

CREATE POLICY "Admins can read newsletter_subscribers"
  ON public.newsletter_subscribers
  FOR SELECT
  USING (public.is_admin_or_artist());
