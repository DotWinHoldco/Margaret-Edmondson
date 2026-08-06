-- PROPOSAL, NOT AN ACTIVE MIGRATION.
--
-- This file lives in docs/technical/ on purpose. It is a reviewed proposal for
-- the Supabase performance advisor's multiple_permissive_policies findings
-- (lint 0006). Move it into supabase/migrations/ only after review, and only
-- after 2026080604_advisor_auth_initplan.sql has been applied (see "Ordering"
-- below).
--
-- ============================================================================
-- Why consolidation is safe here
-- ============================================================================
--
-- Postgres combines permissive row level security policies with OR: a row is
-- visible (or a write is allowed) if ANY permissive policy that applies to the
-- current role and command passes. Every policy involved below is PERMISSIVE
-- (verified: pg_policies has zero RESTRICTIVE policies in the public schema of
-- project klwkajukicsoiwpsgftt as of 2026-08-06). So for a fixed table, command,
-- and role list, replacing N permissive policies with one policy whose
-- expression is the OR of the N original expressions produces exactly the same
-- truth value for every row. The advisor's complaint is purely about cost: each
-- policy is evaluated separately per row, so N policies mean N evaluations where
-- one OR expression means one.
--
-- The equivalence holds only when the group is fixed on all three axes. Every
-- group below satisfies all three:
--
--   1. Same command. All member policies have the same pg_policies.cmd as the
--      consolidated policy. No FOR ALL policy is folded into a command specific
--      one, because a FOR ALL policy also governs commands outside the group and
--      merging it would silently change those.
--   2. Same role list. Every group was checked with
--      count(distinct array_to_string(roles,',')) and returned 1, so no group
--      widens or narrows the set of roles a predicate applies to.
--   3. Same permissiveness. All members are PERMISSIVE, so OR is the correct
--      combining operator.
--
-- Tables where those conditions do not hold are not touched. They are listed
-- under "Skipped" below.
--
-- ============================================================================
-- Ordering and composition with 2026080604_advisor_auth_initplan.sql
-- ============================================================================
--
-- The merged expressions already carry the initplan wrapping, (select auth.uid())
-- and (select auth.role()), so this file composes with the initplan migration
-- rather than reverting it. Nine of the policies that 2026080604 recreates are
-- dropped and absorbed here:
--
--   change_requests."Users can read own change requests"
--   email_automation_steps."Authenticated can read email_automation_steps"
--   email_automations."Authenticated can read email_automations"
--   email_campaigns."Authenticated can read email_campaigns"
--   email_sends."Authenticated can read email_sends"
--   email_templates."Authenticated can read email_templates"
--   enrollments."Users can read own enrollments"
--   order_items."Users can read own order items"
--   orders."Users can read own orders"
--
-- Apply 2026080604 first, then this file. Running this file alone still produces
-- correct policies, because the merged text is generated from the live catalog
-- and does not depend on 2026080604 having run, but applying it first keeps the
-- two change sets consistent if only part of the set is shipped.
--
-- Within the file, statements are ordered alphabetically by table, and each
-- table's DROP statements precede its CREATE, so the file is executable top to
-- bottom.
--
-- ============================================================================
-- Scope
-- ============================================================================
--
--   31 consolidated policies replacing 64 existing policies, across 31 tables.
--   186 of the 209 multiple_permissive_policies advisor findings are resolved.
--   23 findings across 5 tables are skipped (see below).
--
-- ============================================================================
-- Skipped tables and why
-- ============================================================================
--
-- public.cv_entries (1 finding: authenticated / SELECT)
--   "Admins manage cv_entries" is FOR ALL TO authenticated; "Public can read
--   published cv_entries" is FOR SELECT TO public. The overlap exists only for
--   the authenticated role, and the two policies differ on both command scope
--   and role list. Merging would require splitting the FOR ALL policy into
--   separate INSERT, UPDATE, and DELETE policies and inlining its admin branch
--   into a TO public SELECT policy. That reshapes the write path and needs a
--   human decision, not a mechanical OR.
--
-- public.cv_settings (1 finding: authenticated / SELECT)
--   Same shape as cv_entries: "Admins manage cv_settings" FOR ALL TO
--   authenticated against "Public can read cv_settings" FOR SELECT TO public.
--
-- public.lumaprints_mediums (1 finding: authenticated / SELECT)
--   Same shape: "Admins manage lumaprints_mediums" FOR ALL TO authenticated
--   against "Public read lumaprints_mediums" FOR SELECT TO public.
--
-- public.lumaprints_pricing_cache (1 finding: authenticated / SELECT)
--   "Admins write lumaprints_pricing_cache" is FOR ALL TO authenticated and
--   "Admins read lumaprints_pricing_cache" is FOR SELECT TO authenticated. The
--   role lists match, but the command scopes do not: consolidating the SELECT
--   overlap means splitting the FOR ALL policy into INSERT, UPDATE, and DELETE
--   policies. Mechanically possible, but it changes the write path shape, so it
--   is left for review.
--
-- public.site_settings (19 findings: 1 SELECT, 6 INSERT, 6 UPDATE, 6 DELETE)
--   Six policies spanning three command scopes and two role lists, including two
--   FOR ALL policies: site_settings_write (FOR ALL TO public, gated on
--   auth.role() = 'service_role') and site_settings_admin_write (FOR ALL TO
--   authenticated). Deciding how the service_role path, the admin path, and the
--   command specific admin policies should combine is a security judgement about
--   this table's write model, so it is deferred rather than guessed.
--
-- ============================================================================
-- Review notes (deliberately NOT applied, to keep this a pure OR merge)
-- ============================================================================
--
-- The merged expressions reproduce the current predicates verbatim, so some
-- carry redundancy that was already present. These are worth cleaning up in a
-- separate, deliberate change:
--
--   - 10 tables have a public read predicate of literal (true), which makes the
--     OR'd admin branch unreachable: the whole USING clause reduces to true.
--     Affected: bio_credentials_block, categories, course_modules, lessons,
--     pages, product_categories, product_images, product_variants,
--     testimonial_media, testimonials. If those tables are meant to be fully
--     public for SELECT, the merged policy is correct as written and the admin
--     branch is simply dead weight. If any of them was meant to be gated, that
--     is a pre-existing exposure bug in the current policies, not something this
--     consolidation introduces.
--   - public.artwork_funnels has two byte identical published-read policies
--     ("Public can read published funnels" and "Public read published funnels"),
--     so the merged expression repeats (is_published = true).
--   - public.blog_posts likewise has two identical (status = 'published')
--     policies.
--   - public.feedback_audit_log and public.work_request_audit_log each have two
--     INSERT policies with the identical predicate is_admin_or_artist(), so the
--     merged WITH CHECK repeats it.
--
-- Duplicate disjuncts are harmless (x OR x is x) and were left in so this file
-- stays a provable pure merge of the live catalog text.
--
-- ============================================================================
-- Generation and verification
-- ============================================================================
--
-- Every statement below was generated from pg_policies and verified read-only on
-- 2026-08-06: each of the 31 rendered statements was md5 compared against a
-- catalog generated reference (31 matched, 0 mismatched), and the member policy
-- count summed to 64.

DROP POLICY IF EXISTS "Admins read artwork_funnels" ON public.artwork_funnels;
DROP POLICY IF EXISTS "Public can read published funnels" ON public.artwork_funnels;
DROP POLICY IF EXISTS "Public read published funnels" ON public.artwork_funnels;
CREATE POLICY artwork_funnels_select_consolidated ON public.artwork_funnels
  AS PERMISSIVE
  FOR SELECT
  TO public
  USING (
    (is_admin_or_artist())
    OR ((is_published = true))
    OR ((is_published = true))
  );

DROP POLICY IF EXISTS "Admins read bio_callouts" ON public.bio_callouts;
DROP POLICY IF EXISTS "Public read published bio_callouts" ON public.bio_callouts;
CREATE POLICY bio_callouts_select_consolidated ON public.bio_callouts
  AS PERMISSIVE
  FOR SELECT
  TO public
  USING (
    (is_admin_or_artist())
    OR ((is_published = true))
  );

DROP POLICY IF EXISTS "Public read bio_credentials_block" ON public.bio_credentials_block;
DROP POLICY IF EXISTS bio_credentials_block_admin_read_all ON public.bio_credentials_block;
CREATE POLICY bio_credentials_block_select_consolidated ON public.bio_credentials_block
  AS PERMISSIVE
  FOR SELECT
  TO public
  USING (
    (true)
    OR (is_admin_or_artist())
  );

DROP POLICY IF EXISTS "Admins read bio_sections" ON public.bio_sections;
DROP POLICY IF EXISTS "Public read published bio_sections" ON public.bio_sections;
CREATE POLICY bio_sections_select_consolidated ON public.bio_sections
  AS PERMISSIVE
  FOR SELECT
  TO public
  USING (
    (is_admin_or_artist())
    OR ((is_published = true))
  );

DROP POLICY IF EXISTS "Public can read published blog posts" ON public.blog_posts;
DROP POLICY IF EXISTS "Public can read published blog_posts" ON public.blog_posts;
DROP POLICY IF EXISTS blog_posts_admin_read_all ON public.blog_posts;
CREATE POLICY blog_posts_select_consolidated ON public.blog_posts
  AS PERMISSIVE
  FOR SELECT
  TO public
  USING (
    ((status = 'published'::text))
    OR ((status = 'published'::text))
    OR (is_admin_or_artist())
  );

DROP POLICY IF EXISTS "Public can read categories" ON public.categories;
DROP POLICY IF EXISTS categories_admin_read_all ON public.categories;
CREATE POLICY categories_select_consolidated ON public.categories
  AS PERMISSIVE
  FOR SELECT
  TO public
  USING (
    (true)
    OR (is_admin_or_artist())
  );

DROP POLICY IF EXISTS "Users can read own change requests" ON public.change_requests;
DROP POLICY IF EXISTS change_requests_admin_read_all ON public.change_requests;
CREATE POLICY change_requests_select_consolidated ON public.change_requests
  AS PERMISSIVE
  FOR SELECT
  TO public
  USING (
    (((select auth.uid()) = requester_id))
    OR (is_admin_or_artist())
  );

DROP POLICY IF EXISTS "Admins read all sessions" ON public.class_sessions;
DROP POLICY IF EXISTS "Public can read published sessions" ON public.class_sessions;
CREATE POLICY class_sessions_select_consolidated ON public.class_sessions
  AS PERMISSIVE
  FOR SELECT
  TO public
  USING (
    (is_admin_or_artist())
    OR ((status = ANY (ARRAY['published'::text, 'sold_out'::text])))
  );

DROP POLICY IF EXISTS "Public can read course modules" ON public.course_modules;
DROP POLICY IF EXISTS course_modules_admin_read_all ON public.course_modules;
CREATE POLICY course_modules_select_consolidated ON public.course_modules
  AS PERMISSIVE
  FOR SELECT
  TO public
  USING (
    (true)
    OR (is_admin_or_artist())
  );

DROP POLICY IF EXISTS "Public can read published courses" ON public.courses;
DROP POLICY IF EXISTS courses_admin_read_all ON public.courses;
CREATE POLICY courses_select_consolidated ON public.courses
  AS PERMISSIVE
  FOR SELECT
  TO public
  USING (
    ((status = 'published'::text))
    OR (is_admin_or_artist())
  );

DROP POLICY IF EXISTS "Authenticated can read email_automation_steps" ON public.email_automation_steps;
DROP POLICY IF EXISTS email_automation_steps_admin_read_all ON public.email_automation_steps;
CREATE POLICY email_automation_steps_select_consolidated ON public.email_automation_steps
  AS PERMISSIVE
  FOR SELECT
  TO public
  USING (
    (((select auth.role()) = 'authenticated'::text))
    OR (is_admin_or_artist())
  );

DROP POLICY IF EXISTS "Authenticated can read email_automations" ON public.email_automations;
DROP POLICY IF EXISTS email_automations_admin_read_all ON public.email_automations;
CREATE POLICY email_automations_select_consolidated ON public.email_automations
  AS PERMISSIVE
  FOR SELECT
  TO public
  USING (
    (((select auth.role()) = 'authenticated'::text))
    OR (is_admin_or_artist())
  );

DROP POLICY IF EXISTS "Authenticated can read email_campaigns" ON public.email_campaigns;
DROP POLICY IF EXISTS email_campaigns_admin_read_all ON public.email_campaigns;
CREATE POLICY email_campaigns_select_consolidated ON public.email_campaigns
  AS PERMISSIVE
  FOR SELECT
  TO public
  USING (
    (((select auth.role()) = 'authenticated'::text))
    OR (is_admin_or_artist())
  );

DROP POLICY IF EXISTS "Authenticated can read email_sends" ON public.email_sends;
DROP POLICY IF EXISTS email_sends_admin_read_all ON public.email_sends;
CREATE POLICY email_sends_select_consolidated ON public.email_sends
  AS PERMISSIVE
  FOR SELECT
  TO public
  USING (
    (((select auth.role()) = 'authenticated'::text))
    OR (is_admin_or_artist())
  );

DROP POLICY IF EXISTS "Authenticated can read email_templates" ON public.email_templates;
DROP POLICY IF EXISTS email_templates_admin_read_all ON public.email_templates;
CREATE POLICY email_templates_select_consolidated ON public.email_templates
  AS PERMISSIVE
  FOR SELECT
  TO public
  USING (
    (((select auth.role()) = 'authenticated'::text))
    OR (is_admin_or_artist())
  );

DROP POLICY IF EXISTS "Users can read own enrollments" ON public.enrollments;
DROP POLICY IF EXISTS enrollments_admin_read_all ON public.enrollments;
CREATE POLICY enrollments_select_consolidated ON public.enrollments
  AS PERMISSIVE
  FOR SELECT
  TO public
  USING (
    (((select auth.uid()) = profile_id))
    OR (is_admin_or_artist())
  );

DROP POLICY IF EXISTS "Public can read published faqs" ON public.faqs;
DROP POLICY IF EXISTS faqs_admin_read_all ON public.faqs;
CREATE POLICY faqs_select_consolidated ON public.faqs
  AS PERMISSIVE
  FOR SELECT
  TO public
  USING (
    ((is_published = true))
    OR (is_admin_or_artist())
  );

DROP POLICY IF EXISTS "Admins can insert feedback_audit_log" ON public.feedback_audit_log;
DROP POLICY IF EXISTS "Admins insert feedback_audit_log" ON public.feedback_audit_log;
CREATE POLICY feedback_audit_log_insert_consolidated ON public.feedback_audit_log
  AS PERMISSIVE
  FOR INSERT
  TO public
  WITH CHECK (
    (is_admin_or_artist())
    OR (is_admin_or_artist())
  );

DROP POLICY IF EXISTS "Public can read lessons" ON public.lessons;
DROP POLICY IF EXISTS lessons_admin_read_all ON public.lessons;
CREATE POLICY lessons_select_consolidated ON public.lessons
  AS PERMISSIVE
  FOR SELECT
  TO public
  USING (
    (true)
    OR (is_admin_or_artist())
  );

DROP POLICY IF EXISTS "Users can read own order items" ON public.order_items;
DROP POLICY IF EXISTS order_items_admin_read_all ON public.order_items;
CREATE POLICY order_items_select_consolidated ON public.order_items
  AS PERMISSIVE
  FOR SELECT
  TO public
  USING (
    ((order_id IN ( SELECT orders.id
   FROM orders
  WHERE (orders.profile_id = (select auth.uid())))))
    OR (is_admin_or_artist())
  );

DROP POLICY IF EXISTS "Users can read own orders" ON public.orders;
DROP POLICY IF EXISTS orders_admin_read_all ON public.orders;
CREATE POLICY orders_select_consolidated ON public.orders
  AS PERMISSIVE
  FOR SELECT
  TO public
  USING (
    (((select auth.uid()) = profile_id))
    OR (is_admin_or_artist())
  );

DROP POLICY IF EXISTS "Public can read visible page blocks" ON public.page_blocks;
DROP POLICY IF EXISTS page_blocks_admin_read_all ON public.page_blocks;
CREATE POLICY page_blocks_select_consolidated ON public.page_blocks
  AS PERMISSIVE
  FOR SELECT
  TO public
  USING (
    ((is_visible = true))
    OR (is_admin_or_artist())
  );

DROP POLICY IF EXISTS "Public can read pages" ON public.pages;
DROP POLICY IF EXISTS pages_admin_read_all ON public.pages;
CREATE POLICY pages_select_consolidated ON public.pages
  AS PERMISSIVE
  FOR SELECT
  TO public
  USING (
    (true)
    OR (is_admin_or_artist())
  );

DROP POLICY IF EXISTS "Public can read product_categories" ON public.product_categories;
DROP POLICY IF EXISTS product_categories_admin_read_all ON public.product_categories;
CREATE POLICY product_categories_select_consolidated ON public.product_categories
  AS PERMISSIVE
  FOR SELECT
  TO public
  USING (
    (true)
    OR (is_admin_or_artist())
  );

DROP POLICY IF EXISTS "Public can read product images" ON public.product_images;
DROP POLICY IF EXISTS product_images_admin_read_all ON public.product_images;
CREATE POLICY product_images_select_consolidated ON public.product_images
  AS PERMISSIVE
  FOR SELECT
  TO public
  USING (
    (true)
    OR (is_admin_or_artist())
  );

DROP POLICY IF EXISTS "Public can read product variants" ON public.product_variants;
DROP POLICY IF EXISTS product_variants_admin_read_all ON public.product_variants;
CREATE POLICY product_variants_select_consolidated ON public.product_variants
  AS PERMISSIVE
  FOR SELECT
  TO public
  USING (
    (true)
    OR (is_admin_or_artist())
  );

DROP POLICY IF EXISTS "Public can read active products" ON public.products;
DROP POLICY IF EXISTS products_admin_read_all ON public.products;
CREATE POLICY products_select_consolidated ON public.products
  AS PERMISSIVE
  FOR SELECT
  TO public
  USING (
    ((status = 'active'::text))
    OR (is_admin_or_artist())
  );

DROP POLICY IF EXISTS "Public can read site content" ON public.site_content;
DROP POLICY IF EXISTS site_content_admin_read_all ON public.site_content;
CREATE POLICY site_content_select_consolidated ON public.site_content
  AS PERMISSIVE
  FOR SELECT
  TO public
  USING (
    ((is_active = true))
    OR (is_admin_or_artist())
  );

DROP POLICY IF EXISTS "Public read testimonial_media" ON public.testimonial_media;
DROP POLICY IF EXISTS testimonial_media_admin_read_all ON public.testimonial_media;
CREATE POLICY testimonial_media_select_consolidated ON public.testimonial_media
  AS PERMISSIVE
  FOR SELECT
  TO public
  USING (
    (true)
    OR (is_admin_or_artist())
  );

DROP POLICY IF EXISTS "Public can read featured testimonials" ON public.testimonials;
DROP POLICY IF EXISTS testimonials_admin_read_all ON public.testimonials;
CREATE POLICY testimonials_select_consolidated ON public.testimonials
  AS PERMISSIVE
  FOR SELECT
  TO public
  USING (
    (true)
    OR (is_admin_or_artist())
  );

DROP POLICY IF EXISTS "Admins can insert work_request_audit_log" ON public.work_request_audit_log;
DROP POLICY IF EXISTS "Admins insert work_request_audit_log" ON public.work_request_audit_log;
CREATE POLICY work_request_audit_log_insert_consolidated ON public.work_request_audit_log
  AS PERMISSIVE
  FOR INSERT
  TO public
  WITH CHECK (
    (is_admin_or_artist())
    OR (is_admin_or_artist())
  );
