# Supabase performance advisor remediation, 2026-08-06

Project: `klwkajukicsoiwpsgftt` (prod). Advisor payload: full performance lint set,
323 findings total.

This document maps every finding in the payload to the exact file and statement
that addresses it, or records why it was skipped or deferred. Nothing in this
change set has been applied to the database. All catalog work behind it was
read-only SELECT (see the verification appendix).

## Files in this change set

| File | Statements | Addresses |
| --- | --- | --- |
| `supabase/migrations/2026080602_advisor_fk_indexes.sql` | 56 `create index if not exists` | 56 `unindexed_foreign_keys` |
| `supabase/migrations/2026080603_advisor_drop_duplicate_index.sql` | 1 `drop index if exists` | 1 `duplicate_index` |
| `supabase/migrations/2026080604_advisor_auth_initplan.sql` | 29 `DROP POLICY` + 29 `CREATE POLICY` | 29 `auth_rls_initplan` |
| `docs/technical/advisor-policy-consolidation-proposal.sql` (proposal, not a migration) | 64 `DROP POLICY` + 31 `CREATE POLICY` | 186 of 209 `multiple_permissive_policies` |

## Reconciliation against advisor totals

| Lint | Findings in payload | Addressed | Skipped or deferred |
| --- | --- | --- | --- |
| `multiple_permissive_policies` | 209 | 186 | 23 |
| `unindexed_foreign_keys` | 56 | 56 | 0 |
| `auth_rls_initplan` | 29 | 29 | 0 |
| `unused_index` | 27 | 0 | 27 (out of scope) |
| `duplicate_index` | 1 | 1 | 0 |
| `auth_db_connections_absolute` | 1 | 0 | 1 (out of scope) |
| **Total** | **323** | **272** | **51** |

The task brief listed roughly 209 + 29 + 1 + 56 = 295 findings. The payload also
carries 27 `unused_index` findings and 1 `auth_db_connections_absolute` finding,
which brings the file to 323. Both extra categories are outside this change set;
they are itemised at the end so the totals close.

## 1. `unindexed_foreign_keys` (56 findings, 56 addressed)

All 56 are addressed in `supabase/migrations/2026080602_advisor_fk_indexes.sql`.
Every one was re-verified against the live catalog on 2026-08-06: the constraint
still exists, it is single column, and it has no valid non-partial btree index
whose leading column matches. No advisor entry in this category was stale.

One observation from that check, recorded but deliberately not acted on:
`public.fulfillment_jobs.order_id` (`fulfillment_jobs_order_id_fkey`) also has no
full covering index. Its only index on that column is
`fulfillment_jobs_active_order_uniq`, which is partial (it carries an `indpred`),
so it cannot serve every referential integrity lookup. The advisor does not
report it, presumably because the lint counts a partial index as coverage, and it
is therefore outside the advisor list this change set is scoped to. Worth adding
`idx_fulfillment_jobs_order_id` in a follow-up if the partial index is not enough
for the delete path on `orders`.

| # | Table | FK constraint | Column | Statement in `2026080602` |
| --- | --- | --- | --- | --- |
| 1 | `public.addresses` | `addresses_profile_id_fkey` | `profile_id` | `create index if not exists idx_addresses_profile_id` |
| 2 | `public.artwork_funnels` | `artwork_funnels_product_id_fkey` | `product_id` | `create index if not exists idx_artwork_funnels_product_id` |
| 3 | `public.audit_log` | `audit_log_changed_by_fkey` | `changed_by` | `create index if not exists idx_audit_log_changed_by` |
| 4 | `public.blog_posts` | `blog_posts_author_id_fkey` | `author_id` | `create index if not exists idx_blog_posts_author_id` |
| 5 | `public.carts` | `carts_converted_order_id_fkey` | `converted_order_id` | `create index if not exists idx_carts_converted_order_id` |
| 6 | `public.carts` | `carts_profile_id_fkey` | `profile_id` | `create index if not exists idx_carts_profile_id` |
| 7 | `public.carts` | `carts_promo_code_id_fkey` | `promo_code_id` | `create index if not exists idx_carts_promo_code_id` |
| 8 | `public.change_requests` | `change_requests_requester_id_fkey` | `requester_id` | `create index if not exists idx_change_requests_requester_id` |
| 9 | `public.commission_messages` | `commission_messages_commission_id_fkey` | `commission_id` | `create index if not exists idx_commission_messages_commission_id` |
| 10 | `public.commission_messages` | `commission_messages_sender_id_fkey` | `sender_id` | `create index if not exists idx_commission_messages_sender_id` |
| 11 | `public.commission_milestones` | `commission_milestones_commission_id_fkey` | `commission_id` | `create index if not exists idx_commission_milestones_commission_id` |
| 12 | `public.course_modules` | `course_modules_course_id_fkey` | `course_id` | `create index if not exists idx_course_modules_course_id` |
| 13 | `public.email_automation_sends` | `email_automation_sends_automation_id_fkey` | `automation_id` | `create index if not exists idx_email_automation_sends_automation_id` |
| 14 | `public.email_automation_sends` | `email_automation_sends_step_id_fkey` | `step_id` | `create index if not exists idx_email_automation_sends_step_id` |
| 15 | `public.email_automation_triggers` | `email_automation_triggers_contact_id_fkey` | `contact_id` | `create index if not exists idx_email_automation_triggers_contact_id` |
| 16 | `public.email_automation_triggers` | `email_automation_triggers_related_order_id_fkey` | `related_order_id` | `create index if not exists idx_email_automation_triggers_related_order_id` |
| 17 | `public.email_campaign_recipients` | `email_campaign_recipients_contact_id_fkey` | `contact_id` | `create index if not exists idx_email_campaign_recipients_contact_id` |
| 18 | `public.email_campaigns` | `email_campaigns_audience_list_id_fkey` | `audience_list_id` | `create index if not exists idx_email_campaigns_audience_list_id` |
| 19 | `public.email_campaigns` | `email_campaigns_created_by_fkey` | `created_by` | `create index if not exists idx_email_campaigns_created_by` |
| 20 | `public.email_campaigns` | `email_campaigns_promo_code_id_fkey` | `promo_code_id` | `create index if not exists idx_email_campaigns_promo_code_id` |
| 21 | `public.email_sends` | `email_sends_automation_id_fkey` | `automation_id` | `create index if not exists idx_email_sends_automation_id` |
| 22 | `public.email_sends` | `email_sends_campaign_id_fkey` | `campaign_id` | `create index if not exists idx_email_sends_campaign_id` |
| 23 | `public.email_sends` | `email_sends_template_id_fkey` | `template_id` | `create index if not exists idx_email_sends_template_id` |
| 24 | `public.feedback_audit_log` | `feedback_audit_log_feedback_id_fkey` | `feedback_id` | `create index if not exists idx_feedback_audit_log_feedback_id` |
| 25 | `public.feedback_comments` | `feedback_comments_feedback_id_fkey` | `feedback_id` | `create index if not exists idx_feedback_comments_feedback_id` |
| 26 | `public.feedback_comments` | `feedback_comments_profile_id_fkey` | `profile_id` | `create index if not exists idx_feedback_comments_profile_id` |
| 27 | `public.feedback_items` | `feedback_items_profile_id_fkey` | `profile_id` | `create index if not exists idx_feedback_items_profile_id` |
| 28 | `public.lesson_comments` | `lesson_comments_lesson_id_fkey` | `lesson_id` | `create index if not exists idx_lesson_comments_lesson_id` |
| 29 | `public.lesson_comments` | `lesson_comments_parent_id_fkey` | `parent_id` | `create index if not exists idx_lesson_comments_parent_id` |
| 30 | `public.lesson_comments` | `lesson_comments_profile_id_fkey` | `profile_id` | `create index if not exists idx_lesson_comments_profile_id` |
| 31 | `public.lesson_progress` | `lesson_progress_lesson_id_fkey` | `lesson_id` | `create index if not exists idx_lesson_progress_lesson_id` |
| 32 | `public.lessons` | `lessons_module_id_fkey` | `module_id` | `create index if not exists idx_lessons_module_id` |
| 33 | `public.master_artworks` | `master_artworks_uploaded_by_fkey` | `uploaded_by` | `create index if not exists idx_master_artworks_uploaded_by` |
| 34 | `public.media_library` | `media_library_uploaded_by_fkey` | `uploaded_by` | `create index if not exists idx_media_library_uploaded_by` |
| 35 | `public.order_items` | `order_items_product_id_fkey` | `product_id` | `create index if not exists idx_order_items_product_id` |
| 36 | `public.order_items` | `order_items_variant_id_fkey` | `variant_id` | `create index if not exists idx_order_items_variant_id` |
| 37 | `public.page_revisions` | `page_revisions_edited_by_fkey` | `edited_by` | `create index if not exists idx_page_revisions_edited_by` |
| 38 | `public.product_images` | `product_images_product_id_fkey` | `product_id` | `create index if not exists idx_product_images_product_id` |
| 39 | `public.project_note_comments` | `project_note_comments_note_id_fkey` | `note_id` | `create index if not exists idx_project_note_comments_note_id` |
| 40 | `public.project_note_comments` | `project_note_comments_profile_id_fkey` | `profile_id` | `create index if not exists idx_project_note_comments_profile_id` |
| 41 | `public.project_notes` | `project_notes_profile_id_fkey` | `profile_id` | `create index if not exists idx_project_notes_profile_id` |
| 42 | `public.promo_code_redemptions` | `promo_code_redemptions_order_id_fkey` | `order_id` | `create index if not exists idx_promo_code_redemptions_order_id` |
| 43 | `public.promo_codes` | `promo_codes_audience_list_id_fkey` | `audience_list_id` | `create index if not exists idx_promo_codes_audience_list_id` |
| 44 | `public.promo_codes` | `promo_codes_created_by_fkey` | `created_by` | `create index if not exists idx_promo_codes_created_by` |
| 45 | `public.shared_files` | `shared_files_uploaded_by_fkey` | `uploaded_by` | `create index if not exists idx_shared_files_uploaded_by` |
| 46 | `public.site_content` | `site_content_updated_by_fkey` | `updated_by` | `create index if not exists idx_site_content_updated_by` |
| 47 | `public.social_post_media` | `social_post_media_media_id_fkey` | `media_id` | `create index if not exists idx_social_post_media_media_id` |
| 48 | `public.social_posts` | `social_posts_account_id_fkey` | `account_id` | `create index if not exists idx_social_posts_account_id` |
| 49 | `public.social_posts` | `social_posts_blog_post_id_fkey` | `blog_post_id` | `create index if not exists idx_social_posts_blog_post_id` |
| 50 | `public.social_posts` | `social_posts_product_id_fkey` | `product_id` | `create index if not exists idx_social_posts_product_id` |
| 51 | `public.unsubscribe_events` | `unsubscribe_events_list_id_fkey` | `list_id` | `create index if not exists idx_unsubscribe_events_list_id` |
| 52 | `public.wishlist_items` | `wishlist_items_product_id_fkey` | `product_id` | `create index if not exists idx_wishlist_items_product_id` |
| 53 | `public.work_request_audit_log` | `work_request_audit_log_work_request_id_fkey` | `work_request_id` | `create index if not exists idx_work_request_audit_log_work_request_id` |
| 54 | `public.work_request_comments` | `work_request_comments_profile_id_fkey` | `profile_id` | `create index if not exists idx_work_request_comments_profile_id` |
| 55 | `public.work_request_comments` | `work_request_comments_work_request_id_fkey` | `work_request_id` | `create index if not exists idx_work_request_comments_work_request_id` |
| 56 | `public.work_requests` | `work_requests_profile_id_fkey` | `profile_id` | `create index if not exists idx_work_requests_profile_id` |

## 2. `duplicate_index` (1 finding, 1 addressed)

| Finding | Resolution |
| --- | --- |
| `public.product_categories` has identical indexes `{product_categories_pk, product_categories_pkey}` | `supabase/migrations/2026080603_advisor_drop_duplicate_index.sql`: `drop index if exists public.product_categories_pk;` |

`product_categories_pkey` is kept because it backs the PRIMARY KEY constraint
(`pg_constraint.contype = 'p'`); dropping it would mean dropping the constraint.
`product_categories_pk` is a standalone unique index with no owning constraint.
Both were confirmed identical before writing the DROP: same table, same `indkey`
(`1 2`, meaning `product_id, category_id` in that order), same `indoption`
(`0 0`), same access method (btree), both unique, neither partial (`indpred is
null`), both valid, and `pg_get_indexdef` output identical apart from the name.
No foreign key constraint references `product_categories_pk` as its unique index.

## 3. `auth_rls_initplan` (29 findings, 29 addressed)

All 29 are addressed in `supabase/migrations/2026080604_advisor_auth_initplan.sql`,
one `DROP POLICY` + `CREATE POLICY` pair per finding. Each pair reproduces the
live `pg_policies` row (permissive, cmd, roles, qual, with_check) verbatim, with
the scalar subquery wrapping as the only change. `TO public` in the generated SQL
corresponds to `roles = {public}` in the catalog, which is what Postgres stores
for a policy written without a `TO` clause.

| # | Table | Policy | Cmd | Roles | Wrapped call(s) |
| --- | --- | --- | --- | --- | --- |
| 1 | `public.addresses` | `Users can delete own addresses` | DELETE | `authenticated` | `auth.uid()` |
| 2 | `public.addresses` | `Users can insert own addresses` | INSERT | `authenticated` | `auth.uid()` |
| 3 | `public.addresses` | `Users can read own addresses` | SELECT | `authenticated` | `auth.uid()` |
| 4 | `public.addresses` | `Users can update own addresses` | UPDATE | `authenticated` | `auth.uid()` |
| 5 | `public.carts` | `Users can read own cart` | SELECT | `public` | `auth.uid()` |
| 6 | `public.carts` | `Users can update own cart` | UPDATE | `public` | `auth.uid()` |
| 7 | `public.change_requests` | `Users can create change requests` | INSERT | `public` | `auth.uid()` |
| 8 | `public.change_requests` | `Users can read own change requests` | SELECT | `public` | `auth.uid()` |
| 9 | `public.commission_messages` | `Users can read own commission messages` | SELECT | `public` | `auth.uid()` |
| 10 | `public.email_automation_steps` | `Authenticated can read email_automation_steps` | SELECT | `public` | `auth.role()` |
| 11 | `public.email_automations` | `Authenticated can read email_automations` | SELECT | `public` | `auth.role()` |
| 12 | `public.email_campaigns` | `Authenticated can read email_campaigns` | SELECT | `public` | `auth.role()` |
| 13 | `public.email_sends` | `Authenticated can read email_sends` | SELECT | `public` | `auth.role()` |
| 14 | `public.email_templates` | `Authenticated can read email_templates` | SELECT | `public` | `auth.role()` |
| 15 | `public.enrollments` | `Users can read own enrollments` | SELECT | `public` | `auth.uid()` |
| 16 | `public.lesson_comments` | `Users can create lesson comments` | INSERT | `public` | `auth.uid()` |
| 17 | `public.lesson_progress` | `Users can insert own progress` | INSERT | `public` | `auth.uid()` |
| 18 | `public.lesson_progress` | `Users can read own progress` | SELECT | `public` | `auth.uid()` |
| 19 | `public.lesson_progress` | `Users can update own progress` | UPDATE | `public` | `auth.uid()` |
| 20 | `public.order_items` | `Users can read own order items` | SELECT | `public` | `auth.uid()` |
| 21 | `public.orders` | `Users can read own orders` | SELECT | `public` | `auth.uid()` |
| 22 | `public.profiles` | `Users can read own profile` | SELECT | `public` | `auth.uid()` |
| 23 | `public.profiles` | `Users can update own profile` | UPDATE | `public` | `auth.uid()` |
| 24 | `public.shared_files` | `shared_files_insert_admins` | INSERT | `public` | `auth.uid()` |
| 25 | `public.site_settings` | `site_settings_write` | ALL | `public` | `auth.role()` |
| 26 | `public.social_posts` | `Admin manage social_posts` | ALL | `public` | `auth.uid()` |
| 27 | `public.wishlist_items` | `Users can delete own wishlist` | DELETE | `authenticated` | `auth.uid()` |
| 28 | `public.wishlist_items` | `Users can insert own wishlist` | INSERT | `authenticated` | `auth.uid()` |
| 29 | `public.wishlist_items` | `Users can read own wishlist` | SELECT | `authenticated` | `auth.uid()` |

## 4. `multiple_permissive_policies` (209 findings, 186 addressed, 23 skipped)

Addressed in `docs/technical/advisor-policy-consolidation-proposal.sql`, which is
a proposal rather than an active migration and sits outside `supabase/migrations/`
by design.

The advisor emits one finding per table + role + command. A policy written
without a `TO` clause applies to every role, so a single pair of overlapping
`TO public` policies produces six findings (`anon`, `authenticated`,
`authenticator`, `cli_login_postgres`, `dashboard_user`,
`supabase_privileged_role`). Each row below therefore lists the exact roles it
accounts for and the finding count, and every one of the 209 findings appears in
exactly one row.

### 4a. Consolidated (186 findings, 31 tables, 64 policies to 31)

| Table | Cmd | Roles (one finding each) | n | Policies merged | Consolidated policy |
| --- | --- | --- | --- | --- | --- |
| `public.artwork_funnels` | SELECT | `anon`, `authenticated`, `authenticator`, `cli_login_postgres`, `dashboard_user`, `supabase_privileged_role` | 6 | `Admins read artwork_funnels`<br>`Public can read published funnels`<br>`Public read published funnels` | `artwork_funnels_select_consolidated` |
| `public.bio_callouts` | SELECT | `anon`, `authenticated`, `authenticator`, `cli_login_postgres`, `dashboard_user`, `supabase_privileged_role` | 6 | `Admins read bio_callouts`<br>`Public read published bio_callouts` | `bio_callouts_select_consolidated` |
| `public.bio_credentials_block` | SELECT | `anon`, `authenticated`, `authenticator`, `cli_login_postgres`, `dashboard_user`, `supabase_privileged_role` | 6 | `Public read bio_credentials_block`<br>`bio_credentials_block_admin_read_all` | `bio_credentials_block_select_consolidated` |
| `public.bio_sections` | SELECT | `anon`, `authenticated`, `authenticator`, `cli_login_postgres`, `dashboard_user`, `supabase_privileged_role` | 6 | `Admins read bio_sections`<br>`Public read published bio_sections` | `bio_sections_select_consolidated` |
| `public.blog_posts` | SELECT | `anon`, `authenticated`, `authenticator`, `cli_login_postgres`, `dashboard_user`, `supabase_privileged_role` | 6 | `Public can read published blog posts`<br>`Public can read published blog_posts`<br>`blog_posts_admin_read_all` | `blog_posts_select_consolidated` |
| `public.categories` | SELECT | `anon`, `authenticated`, `authenticator`, `cli_login_postgres`, `dashboard_user`, `supabase_privileged_role` | 6 | `Public can read categories`<br>`categories_admin_read_all` | `categories_select_consolidated` |
| `public.change_requests` | SELECT | `anon`, `authenticated`, `authenticator`, `cli_login_postgres`, `dashboard_user`, `supabase_privileged_role` | 6 | `Users can read own change requests`<br>`change_requests_admin_read_all` | `change_requests_select_consolidated` |
| `public.class_sessions` | SELECT | `anon`, `authenticated`, `authenticator`, `cli_login_postgres`, `dashboard_user`, `supabase_privileged_role` | 6 | `Admins read all sessions`<br>`Public can read published sessions` | `class_sessions_select_consolidated` |
| `public.course_modules` | SELECT | `anon`, `authenticated`, `authenticator`, `cli_login_postgres`, `dashboard_user`, `supabase_privileged_role` | 6 | `Public can read course modules`<br>`course_modules_admin_read_all` | `course_modules_select_consolidated` |
| `public.courses` | SELECT | `anon`, `authenticated`, `authenticator`, `cli_login_postgres`, `dashboard_user`, `supabase_privileged_role` | 6 | `Public can read published courses`<br>`courses_admin_read_all` | `courses_select_consolidated` |
| `public.email_automation_steps` | SELECT | `anon`, `authenticated`, `authenticator`, `cli_login_postgres`, `dashboard_user`, `supabase_privileged_role` | 6 | `Authenticated can read email_automation_steps`<br>`email_automation_steps_admin_read_all` | `email_automation_steps_select_consolidated` |
| `public.email_automations` | SELECT | `anon`, `authenticated`, `authenticator`, `cli_login_postgres`, `dashboard_user`, `supabase_privileged_role` | 6 | `Authenticated can read email_automations`<br>`email_automations_admin_read_all` | `email_automations_select_consolidated` |
| `public.email_campaigns` | SELECT | `anon`, `authenticated`, `authenticator`, `cli_login_postgres`, `dashboard_user`, `supabase_privileged_role` | 6 | `Authenticated can read email_campaigns`<br>`email_campaigns_admin_read_all` | `email_campaigns_select_consolidated` |
| `public.email_sends` | SELECT | `anon`, `authenticated`, `authenticator`, `cli_login_postgres`, `dashboard_user`, `supabase_privileged_role` | 6 | `Authenticated can read email_sends`<br>`email_sends_admin_read_all` | `email_sends_select_consolidated` |
| `public.email_templates` | SELECT | `anon`, `authenticated`, `authenticator`, `cli_login_postgres`, `dashboard_user`, `supabase_privileged_role` | 6 | `Authenticated can read email_templates`<br>`email_templates_admin_read_all` | `email_templates_select_consolidated` |
| `public.enrollments` | SELECT | `anon`, `authenticated`, `authenticator`, `cli_login_postgres`, `dashboard_user`, `supabase_privileged_role` | 6 | `Users can read own enrollments`<br>`enrollments_admin_read_all` | `enrollments_select_consolidated` |
| `public.faqs` | SELECT | `anon`, `authenticated`, `authenticator`, `cli_login_postgres`, `dashboard_user`, `supabase_privileged_role` | 6 | `Public can read published faqs`<br>`faqs_admin_read_all` | `faqs_select_consolidated` |
| `public.feedback_audit_log` | INSERT | `anon`, `authenticated`, `authenticator`, `cli_login_postgres`, `dashboard_user`, `supabase_privileged_role` | 6 | `Admins can insert feedback_audit_log`<br>`Admins insert feedback_audit_log` | `feedback_audit_log_insert_consolidated` |
| `public.lessons` | SELECT | `anon`, `authenticated`, `authenticator`, `cli_login_postgres`, `dashboard_user`, `supabase_privileged_role` | 6 | `Public can read lessons`<br>`lessons_admin_read_all` | `lessons_select_consolidated` |
| `public.order_items` | SELECT | `anon`, `authenticated`, `authenticator`, `cli_login_postgres`, `dashboard_user`, `supabase_privileged_role` | 6 | `Users can read own order items`<br>`order_items_admin_read_all` | `order_items_select_consolidated` |
| `public.orders` | SELECT | `anon`, `authenticated`, `authenticator`, `cli_login_postgres`, `dashboard_user`, `supabase_privileged_role` | 6 | `Users can read own orders`<br>`orders_admin_read_all` | `orders_select_consolidated` |
| `public.page_blocks` | SELECT | `anon`, `authenticated`, `authenticator`, `cli_login_postgres`, `dashboard_user`, `supabase_privileged_role` | 6 | `Public can read visible page blocks`<br>`page_blocks_admin_read_all` | `page_blocks_select_consolidated` |
| `public.pages` | SELECT | `anon`, `authenticated`, `authenticator`, `cli_login_postgres`, `dashboard_user`, `supabase_privileged_role` | 6 | `Public can read pages`<br>`pages_admin_read_all` | `pages_select_consolidated` |
| `public.product_categories` | SELECT | `anon`, `authenticated`, `authenticator`, `cli_login_postgres`, `dashboard_user`, `supabase_privileged_role` | 6 | `Public can read product_categories`<br>`product_categories_admin_read_all` | `product_categories_select_consolidated` |
| `public.product_images` | SELECT | `anon`, `authenticated`, `authenticator`, `cli_login_postgres`, `dashboard_user`, `supabase_privileged_role` | 6 | `Public can read product images`<br>`product_images_admin_read_all` | `product_images_select_consolidated` |
| `public.product_variants` | SELECT | `anon`, `authenticated`, `authenticator`, `cli_login_postgres`, `dashboard_user`, `supabase_privileged_role` | 6 | `Public can read product variants`<br>`product_variants_admin_read_all` | `product_variants_select_consolidated` |
| `public.products` | SELECT | `anon`, `authenticated`, `authenticator`, `cli_login_postgres`, `dashboard_user`, `supabase_privileged_role` | 6 | `Public can read active products`<br>`products_admin_read_all` | `products_select_consolidated` |
| `public.site_content` | SELECT | `anon`, `authenticated`, `authenticator`, `cli_login_postgres`, `dashboard_user`, `supabase_privileged_role` | 6 | `Public can read site content`<br>`site_content_admin_read_all` | `site_content_select_consolidated` |
| `public.testimonial_media` | SELECT | `anon`, `authenticated`, `authenticator`, `cli_login_postgres`, `dashboard_user`, `supabase_privileged_role` | 6 | `Public read testimonial_media`<br>`testimonial_media_admin_read_all` | `testimonial_media_select_consolidated` |
| `public.testimonials` | SELECT | `anon`, `authenticated`, `authenticator`, `cli_login_postgres`, `dashboard_user`, `supabase_privileged_role` | 6 | `Public can read featured testimonials`<br>`testimonials_admin_read_all` | `testimonials_select_consolidated` |
| `public.work_request_audit_log` | INSERT | `anon`, `authenticated`, `authenticator`, `cli_login_postgres`, `dashboard_user`, `supabase_privileged_role` | 6 | `Admins can insert work_request_audit_log`<br>`Admins insert work_request_audit_log` | `work_request_audit_log_insert_consolidated` |

### 4b. Skipped (23 findings, 5 tables)

| Table | Cmd | Roles (one finding each) | n | Reason |
| --- | --- | --- | --- | --- |
| `public.cv_entries` | SELECT | `authenticated` | 1 | FOR ALL TO authenticated policy overlaps a FOR SELECT TO public policy: mixed command scope and mixed role list. |
| `public.cv_settings` | SELECT | `authenticated` | 1 | FOR ALL TO authenticated policy overlaps a FOR SELECT TO public policy: mixed command scope and mixed role list. |
| `public.lumaprints_mediums` | SELECT | `authenticated` | 1 | FOR ALL TO authenticated policy overlaps a FOR SELECT TO public policy: mixed command scope and mixed role list. |
| `public.lumaprints_pricing_cache` | SELECT | `authenticated` | 1 | Role lists match but command scopes do not: a FOR ALL policy overlaps a FOR SELECT policy, so merging requires splitting FOR ALL. |
| `public.site_settings` | DELETE | `anon`, `authenticated`, `authenticator`, `cli_login_postgres`, `dashboard_user`, `supabase_privileged_role` | 6 | Six policies across three command scopes and two role lists, including two FOR ALL policies: combining the service_role, admin, and command specific paths is a security judgement. |
| `public.site_settings` | INSERT | `anon`, `authenticated`, `authenticator`, `cli_login_postgres`, `dashboard_user`, `supabase_privileged_role` | 6 | Six policies across three command scopes and two role lists, including two FOR ALL policies: combining the service_role, admin, and command specific paths is a security judgement. |
| `public.site_settings` | SELECT | `authenticated` | 1 | Six policies across three command scopes and two role lists, including two FOR ALL policies: combining the service_role, admin, and command specific paths is a security judgement. |
| `public.site_settings` | UPDATE | `anon`, `authenticated`, `authenticator`, `cli_login_postgres`, `dashboard_user`, `supabase_privileged_role` | 6 | Six policies across three command scopes and two role lists, including two FOR ALL policies: combining the service_role, admin, and command specific paths is a security judgement. |

Subtotals: 186 consolidated + 23 skipped = 209.

## 5. Out of scope in this change set (28 findings)

### 5a. `unused_index` (27 findings, all deferred)

Deferred deliberately. The advisor reports an index as unused from
`pg_stat_user_indexes` scan counters, and this project is pre-launch with
near-empty tables and effectively no production query history, so a zero scan
count carries no signal yet. Dropping indexes on that basis would remove
deliberate design work before the workload that justifies it exists. Revisit
after the site has real traffic and the counters mean something.

Note that the 56 indexes added by `2026080602_advisor_fk_indexes.sql` will
themselves show up as `unused_index` findings on the next advisor run, for the
same reason. That is expected and is not a regression.

The 27 indexes reported:

| # | Table | Index |
| --- | --- | --- |
| 1 | `public.blog_posts` | `blog_posts_scheduled_idx` |
| 2 | `public.blog_posts` | `idx_blog_posts_slug` |
| 3 | `public.carts` | `carts_status_idx` |
| 4 | `public.carts` | `idx_carts_activity` |
| 5 | `public.carts` | `idx_carts_email` |
| 6 | `public.commissions` | `idx_commissions_status` |
| 7 | `public.crm_contacts` | `crm_contacts_email_idx` |
| 8 | `public.crm_contacts` | `crm_contacts_profile_idx` |
| 9 | `public.crm_contacts` | `crm_contacts_status_idx` |
| 10 | `public.email_automation_triggers` | `email_automation_triggers_event_processed_idx` |
| 11 | `public.email_campaigns` | `email_campaigns_scheduled_idx` |
| 12 | `public.email_sends` | `idx_email_sends_status` |
| 13 | `public.lumaprints_pricing_cache` | `lumaprints_pricing_cache_expires_idx` |
| 14 | `public.media_library` | `media_library_bucket_idx` |
| 15 | `public.media_library` | `media_library_categories_idx` |
| 16 | `public.media_library` | `media_library_created_at_idx` |
| 17 | `public.newsletter_subscribers` | `idx_newsletter_email` |
| 18 | `public.order_items` | `idx_order_items_order` |
| 19 | `public.orders` | `idx_orders_email` |
| 20 | `public.pages` | `pages_kind_idx` |
| 21 | `public.product_categories` | `idx_product_categories_primary` |
| 22 | `public.products` | `idx_products_featured` |
| 23 | `public.promo_codes` | `promo_codes_cart_idx` |
| 24 | `public.shared_files` | `shared_files_tag_idx` |
| 25 | `public.social_post_media` | `idx_social_post_media_post` |
| 26 | `public.social_posts` | `idx_social_posts_channel` |
| 27 | `public.unsubscribe_events` | `unsubscribe_events_email_idx` |

One of these overlaps this change set: `idx_product_categories_primary` is a
partial index (`WHERE is_primary`) on `product_categories(product_id)`. It is not
a duplicate of the indexes handled in file 2 and is left alone.

### 5b. `auth_db_connections_absolute` (1 finding, deferred)

The Auth server is configured with an absolute cap of 10 database connections
rather than a percentage based allocation, so scaling the instance up will not
scale Auth with it. This is a project configuration setting in the Supabase
dashboard, not something a SQL migration can change, so it is outside the scope
of these files. Flagged here so it is not lost.

## Appendix: read-only verification queries

Every query below was run through the Supabase MCP `execute_sql` tool against
`klwkajukicsoiwpsgftt` on 2026-08-06. All are `SELECT`; nothing was applied, and
no `EXPLAIN` was run against DDL.

**A1. Resolve every public foreign key to its columns and any covering index.**
Confirmed the 56 advisor entries and showed which FKs already had coverage
(so they could be excluded).

```sql
select n.nspname as sch, rel.relname as tbl, c.conname as fkey,
  (select string_agg(a.attname, ',' order by k.ord)
     from unnest(c.conkey) with ordinality k(attnum, ord)
     join pg_attribute a on a.attrelid = c.conrelid and a.attnum = k.attnum) as fk_cols,
  coalesce((select string_agg(i.relname, ' | ' order by i.relname)
     from pg_index x join pg_class i on i.oid = x.indexrelid
     join pg_am am on am.oid = i.relam
     where x.indrelid = c.conrelid and am.amname = 'btree'
       and x.indpred is null and x.indisvalid
       and (string_to_array(x.indkey::text, ' ')::int2[])[1:array_length(c.conkey,1)] = c.conkey),
   '(none)') as full_cover
from pg_constraint c
join pg_class rel on rel.oid = c.conrelid
join pg_namespace n on n.oid = rel.relnamespace
where c.contype = 'f' and n.nspname = 'public'
order by 2, 3;
```

**A2. Same check joined against the 56 advisor entries by name.** Returned
`full_cover = (none)` and `fk_missing = false` for all 56 rows, which is what
makes the advisor data non-stale.

**A3. Index name collision check for the 56 proposed names.** Returned zero rows.

```sql
select relname, relkind from pg_class c
join pg_namespace n on n.oid = c.relnamespace
where n.nspname = 'public' and relname in ('idx_addresses_profile_id', ...);
```

**A4. Duplicate index comparison on `product_categories`.**

```sql
select i.relname as indexname, x.indisunique, x.indisprimary, x.indisvalid,
       am.amname, x.indkey::text as indkey, x.indoption::text as indoption,
       pg_get_indexdef(x.indexrelid) as indexdef,
       pg_get_expr(x.indpred, x.indrelid) as pred,
       coalesce((select string_agg(con.conname || ':' || con.contype::text, ',')
                 from pg_constraint con where con.conindid = x.indexrelid), '(none)')
         as owning_constraints,
       coalesce((select string_agg(dc.conname || ' on ' || dr.relname, ', ')
                 from pg_constraint dc join pg_class dr on dr.oid = dc.conrelid
                 where dc.conindid = x.indexrelid and dc.contype = 'f'), '(none)')
         as referencing_fks
from pg_index x
join pg_class i on i.oid = x.indexrelid
join pg_am am on am.oid = i.relam
where x.indrelid = 'public.product_categories'::regclass
order by i.relname;
```

**A5. Policy catalog census.** Returned 254 policies over 73 tables, 6879 bytes of
expression text, and `restrictive_count = 0`. The zero is what licenses the OR
merge argument in the consolidation proposal.

```sql
select count(*) as total_policies, count(distinct tablename) as tables,
       sum(length(coalesce(qual,'')) + length(coalesce(with_check,''))) as expr_bytes,
       count(*) filter (where permissive <> 'PERMISSIVE') as restrictive_count
from pg_policies where schemaname = 'public';
```

**A6. Exact definitions of the 29 `auth_rls_initplan` policies.** Joined the
advisor's (table, policy) pairs against `pg_policies` and selected `permissive`,
`cmd`, `roles`, `qual`, `with_check`, plus a `policy_missing` flag. All 29 were
found; none had a pre-existing `(select auth...)` wrap to avoid double wrapping.

**A7. Structural summary of all policies on the 36 tables with
`multiple_permissive_policies` findings.** Used to classify each table as
cleanly consolidatable or skip.

```sql
select tablename, policyname, cmd, array_to_string(roles, '+') as roles, permissive,
       (qual is not null) as has_qual, (with_check is not null) as has_check
from pg_policies
where schemaname = 'public' and tablename in (...36 tables...)
order by tablename, cmd, policyname;
```

**A8. Server-side generation of the rewritten policy DDL.** Rather than
hand-editing predicates, the DDL for files 3 and 4 was generated inside Postgres
from the live catalog, applying the wrap with
`regexp_replace(qual, 'auth\.(uid|jwt|role)\(\)', '(select auth.\1())', 'g')`.
This makes the file text a pure function of the catalog text.

**A9. Drift check, file 3.** Re-ran the generator, md5'd each of the 29 generated
statements server-side, and compared against md5s computed locally from the
written file: **29 matched, 0 mismatched**.

**A10. Drift check, file 4.** Same method for the 31 consolidated statements:
**31 matched, 0 mismatched**, with member policy count summing to 64. The same
query confirmed `count(distinct roles) = 1` for every consolidation group, which
is the condition that makes the OR merge role-safe.

**A11. Final cross-check of file 1 against the live catalog.** Compared the 56
(table, column) pairs written into `2026080602_advisor_fk_indexes.sql` against
every single-column public foreign key that currently lacks a valid non-partial
btree covering index. Result: 56 of 56 exact matches, nothing in the file that is
not genuinely uncovered, and exactly one uncovered FK in the database that is not
in the file (`fulfillment_jobs.order_id`, discussed in section 1).

```sql
with mine(tbl, col) as (values ('addresses', 'profile_id'), ...56 pairs...),
live as (
  select rel.relname as tbl,
         (select a.attname from unnest(c.conkey) k(attnum)
            join pg_attribute a on a.attrelid = c.conrelid and a.attnum = k.attnum) as col
  from pg_constraint c
  join pg_class rel on rel.oid = c.conrelid
  join pg_namespace n on n.oid = rel.relnamespace
  where c.contype = 'f' and n.nspname = 'public' and array_length(c.conkey, 1) = 1
    and not exists (
      select 1 from pg_index x
      join pg_class i on i.oid = x.indexrelid
      join pg_am am on am.oid = i.relam
      where x.indrelid = c.conrelid and am.amname = 'btree'
        and x.indpred is null and x.indisvalid
        and (string_to_array(x.indkey::text, ' ')::int2[])[1:1] = c.conkey)
)
select ... full outer comparison of mine against live ...;
```

### Manual normalisation

None was needed. Because the statement text is generated inside Postgres from
`pg_policies` output, the parenthesisation Postgres adds when it re-renders an
expression is already present in the source text and is carried through
unchanged. That is why the merged predicates read as `((status = 'published'::text))`
rather than `(status = 'published')`: the inner parentheses are the catalog's own
rendering, and the outer pair is added by the OR merge. No expression was
re-typed, re-worded, or simplified by hand.
