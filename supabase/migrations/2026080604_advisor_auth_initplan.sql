-- Advisor remediation: auth RLS initialization plan (Supabase performance lint 0003).
--
-- Each of the 29 policies below called auth.uid(), auth.jwt(), or auth.role()
-- directly, so Postgres re-evaluated the call once per candidate row. Wrapping
-- the call in a scalar subquery, (select auth.uid()), lets the planner hoist it
-- into an InitPlan that runs once per statement. The wrapped expression returns
-- the same value, so the access decision is unchanged.
--
-- Every statement below was generated from the live catalog: the DROP/CREATE
-- pair reproduces pg_policies.permissive, cmd, roles, qual, and with_check
-- verbatim, with the initplan wrapping as the only edit. Nothing else was
-- reworded, reordered, or simplified. Verified read-only on 2026-08-06 for
-- project klwkajukicsoiwpsgftt: all 29 rendered statements match a catalog
-- generated reference byte for byte (md5 compared, 29 matched, 0 mismatched).
--
-- Notes on faithful reproduction:
--   - TO public is emitted where pg_policies.roles is {public}. That is what the
--     catalog stores for a policy written without a TO clause, so the recreated
--     policy is identical.
--   - UPDATE policies whose with_check is null are recreated with USING only.
--     Postgres applies USING as the check in that case, so omitting WITH CHECK
--     preserves the original behaviour (public.carts and public.profiles rely on
--     this).
--   - is_admin_or_artist() is left unwrapped. It is not an auth.<function>()
--     call, the advisor does not flag it, and changing it is out of scope for
--     this migration.
--
-- DROP POLICY IF EXISTS is used so the migration is safe to re-run.

DROP POLICY IF EXISTS "Users can delete own addresses" ON public.addresses;
CREATE POLICY "Users can delete own addresses" ON public.addresses
  AS PERMISSIVE
  FOR DELETE
  TO authenticated
  USING (((select auth.uid()) = profile_id));

DROP POLICY IF EXISTS "Users can insert own addresses" ON public.addresses;
CREATE POLICY "Users can insert own addresses" ON public.addresses
  AS PERMISSIVE
  FOR INSERT
  TO authenticated
  WITH CHECK (((select auth.uid()) = profile_id));

DROP POLICY IF EXISTS "Users can read own addresses" ON public.addresses;
CREATE POLICY "Users can read own addresses" ON public.addresses
  AS PERMISSIVE
  FOR SELECT
  TO authenticated
  USING (((select auth.uid()) = profile_id));

DROP POLICY IF EXISTS "Users can update own addresses" ON public.addresses;
CREATE POLICY "Users can update own addresses" ON public.addresses
  AS PERMISSIVE
  FOR UPDATE
  TO authenticated
  USING (((select auth.uid()) = profile_id))
  WITH CHECK (((select auth.uid()) = profile_id));

DROP POLICY IF EXISTS "Users can read own cart" ON public.carts;
CREATE POLICY "Users can read own cart" ON public.carts
  AS PERMISSIVE
  FOR SELECT
  TO public
  USING (((select auth.uid()) = profile_id));

DROP POLICY IF EXISTS "Users can update own cart" ON public.carts;
CREATE POLICY "Users can update own cart" ON public.carts
  AS PERMISSIVE
  FOR UPDATE
  TO public
  USING (((select auth.uid()) = profile_id));

DROP POLICY IF EXISTS "Users can create change requests" ON public.change_requests;
CREATE POLICY "Users can create change requests" ON public.change_requests
  AS PERMISSIVE
  FOR INSERT
  TO public
  WITH CHECK (((select auth.uid()) = requester_id));

DROP POLICY IF EXISTS "Users can read own change requests" ON public.change_requests;
CREATE POLICY "Users can read own change requests" ON public.change_requests
  AS PERMISSIVE
  FOR SELECT
  TO public
  USING (((select auth.uid()) = requester_id));

DROP POLICY IF EXISTS "Users can read own commission messages" ON public.commission_messages;
CREATE POLICY "Users can read own commission messages" ON public.commission_messages
  AS PERMISSIVE
  FOR SELECT
  TO public
  USING ((commission_id IN ( SELECT commissions.id
   FROM commissions
  WHERE (commissions.profile_id = (select auth.uid())))));

DROP POLICY IF EXISTS "Authenticated can read email_automation_steps" ON public.email_automation_steps;
CREATE POLICY "Authenticated can read email_automation_steps" ON public.email_automation_steps
  AS PERMISSIVE
  FOR SELECT
  TO public
  USING (((select auth.role()) = 'authenticated'::text));

DROP POLICY IF EXISTS "Authenticated can read email_automations" ON public.email_automations;
CREATE POLICY "Authenticated can read email_automations" ON public.email_automations
  AS PERMISSIVE
  FOR SELECT
  TO public
  USING (((select auth.role()) = 'authenticated'::text));

DROP POLICY IF EXISTS "Authenticated can read email_campaigns" ON public.email_campaigns;
CREATE POLICY "Authenticated can read email_campaigns" ON public.email_campaigns
  AS PERMISSIVE
  FOR SELECT
  TO public
  USING (((select auth.role()) = 'authenticated'::text));

DROP POLICY IF EXISTS "Authenticated can read email_sends" ON public.email_sends;
CREATE POLICY "Authenticated can read email_sends" ON public.email_sends
  AS PERMISSIVE
  FOR SELECT
  TO public
  USING (((select auth.role()) = 'authenticated'::text));

DROP POLICY IF EXISTS "Authenticated can read email_templates" ON public.email_templates;
CREATE POLICY "Authenticated can read email_templates" ON public.email_templates
  AS PERMISSIVE
  FOR SELECT
  TO public
  USING (((select auth.role()) = 'authenticated'::text));

DROP POLICY IF EXISTS "Users can read own enrollments" ON public.enrollments;
CREATE POLICY "Users can read own enrollments" ON public.enrollments
  AS PERMISSIVE
  FOR SELECT
  TO public
  USING (((select auth.uid()) = profile_id));

DROP POLICY IF EXISTS "Users can create lesson comments" ON public.lesson_comments;
CREATE POLICY "Users can create lesson comments" ON public.lesson_comments
  AS PERMISSIVE
  FOR INSERT
  TO public
  WITH CHECK (((select auth.uid()) = profile_id));

DROP POLICY IF EXISTS "Users can insert own progress" ON public.lesson_progress;
CREATE POLICY "Users can insert own progress" ON public.lesson_progress
  AS PERMISSIVE
  FOR INSERT
  TO public
  WITH CHECK ((enrollment_id IN ( SELECT enrollments.id
   FROM enrollments
  WHERE (enrollments.profile_id = (select auth.uid())))));

DROP POLICY IF EXISTS "Users can read own progress" ON public.lesson_progress;
CREATE POLICY "Users can read own progress" ON public.lesson_progress
  AS PERMISSIVE
  FOR SELECT
  TO public
  USING ((enrollment_id IN ( SELECT enrollments.id
   FROM enrollments
  WHERE (enrollments.profile_id = (select auth.uid())))));

DROP POLICY IF EXISTS "Users can update own progress" ON public.lesson_progress;
CREATE POLICY "Users can update own progress" ON public.lesson_progress
  AS PERMISSIVE
  FOR UPDATE
  TO public
  USING ((enrollment_id IN ( SELECT enrollments.id
   FROM enrollments
  WHERE (enrollments.profile_id = (select auth.uid())))));

DROP POLICY IF EXISTS "Users can read own order items" ON public.order_items;
CREATE POLICY "Users can read own order items" ON public.order_items
  AS PERMISSIVE
  FOR SELECT
  TO public
  USING ((order_id IN ( SELECT orders.id
   FROM orders
  WHERE (orders.profile_id = (select auth.uid())))));

DROP POLICY IF EXISTS "Users can read own orders" ON public.orders;
CREATE POLICY "Users can read own orders" ON public.orders
  AS PERMISSIVE
  FOR SELECT
  TO public
  USING (((select auth.uid()) = profile_id));

DROP POLICY IF EXISTS "Users can read own profile" ON public.profiles;
CREATE POLICY "Users can read own profile" ON public.profiles
  AS PERMISSIVE
  FOR SELECT
  TO public
  USING (((select auth.uid()) = id));

DROP POLICY IF EXISTS "Users can update own profile" ON public.profiles;
CREATE POLICY "Users can update own profile" ON public.profiles
  AS PERMISSIVE
  FOR UPDATE
  TO public
  USING (((select auth.uid()) = id));

DROP POLICY IF EXISTS shared_files_insert_admins ON public.shared_files;
CREATE POLICY shared_files_insert_admins ON public.shared_files
  AS PERMISSIVE
  FOR INSERT
  TO public
  WITH CHECK ((is_admin_or_artist() AND (uploaded_by = (select auth.uid()))));

DROP POLICY IF EXISTS site_settings_write ON public.site_settings;
CREATE POLICY site_settings_write ON public.site_settings
  AS PERMISSIVE
  FOR ALL
  TO public
  USING (((select auth.role()) = 'service_role'::text))
  WITH CHECK (((select auth.role()) = 'service_role'::text));

DROP POLICY IF EXISTS "Admin manage social_posts" ON public.social_posts;
CREATE POLICY "Admin manage social_posts" ON public.social_posts
  AS PERMISSIVE
  FOR ALL
  TO public
  USING ((is_admin_or_artist() AND ((select auth.uid()) IS NOT NULL)))
  WITH CHECK ((is_admin_or_artist() AND ((select auth.uid()) IS NOT NULL)));

DROP POLICY IF EXISTS "Users can delete own wishlist" ON public.wishlist_items;
CREATE POLICY "Users can delete own wishlist" ON public.wishlist_items
  AS PERMISSIVE
  FOR DELETE
  TO authenticated
  USING (((select auth.uid()) = profile_id));

DROP POLICY IF EXISTS "Users can insert own wishlist" ON public.wishlist_items;
CREATE POLICY "Users can insert own wishlist" ON public.wishlist_items
  AS PERMISSIVE
  FOR INSERT
  TO authenticated
  WITH CHECK (((select auth.uid()) = profile_id));

DROP POLICY IF EXISTS "Users can read own wishlist" ON public.wishlist_items;
CREATE POLICY "Users can read own wishlist" ON public.wishlist_items
  AS PERMISSIVE
  FOR SELECT
  TO authenticated
  USING (((select auth.uid()) = profile_id));
