-- Advisor remediation: unindexed foreign keys (Supabase performance lint 0001).
--
-- Adds one single-column btree index per foreign key constraint that the
-- performance advisor reported without a covering index. Verified read-only
-- against pg_constraint and pg_index on 2026-08-06 for project
-- klwkajukicsoiwpsgftt: all 56 reported constraints still exist, all are
-- single column, and none of them has a full covering index (that is, a valid,
-- non-partial btree index whose leading column matches the constraint column).
-- No advisor entry was stale, and none of the 56 index names below collides
-- with an existing relation name in the public schema.
--
-- Plain CREATE INDEX is used deliberately. CREATE INDEX CONCURRENTLY cannot run
-- inside the transaction that wraps a migration, and these tables are near empty
-- pre-launch, so the brief exclusive lock is acceptable.
--
-- Naming pattern: idx_<table>_<column>.

create index if not exists idx_addresses_profile_id
  on public.addresses (profile_id);

create index if not exists idx_artwork_funnels_product_id
  on public.artwork_funnels (product_id);

create index if not exists idx_audit_log_changed_by
  on public.audit_log (changed_by);

create index if not exists idx_blog_posts_author_id
  on public.blog_posts (author_id);

create index if not exists idx_carts_converted_order_id
  on public.carts (converted_order_id);

create index if not exists idx_carts_profile_id
  on public.carts (profile_id);

create index if not exists idx_carts_promo_code_id
  on public.carts (promo_code_id);

create index if not exists idx_change_requests_requester_id
  on public.change_requests (requester_id);

create index if not exists idx_commission_messages_commission_id
  on public.commission_messages (commission_id);

create index if not exists idx_commission_messages_sender_id
  on public.commission_messages (sender_id);

create index if not exists idx_commission_milestones_commission_id
  on public.commission_milestones (commission_id);

create index if not exists idx_course_modules_course_id
  on public.course_modules (course_id);

create index if not exists idx_email_automation_sends_automation_id
  on public.email_automation_sends (automation_id);

create index if not exists idx_email_automation_sends_step_id
  on public.email_automation_sends (step_id);

create index if not exists idx_email_automation_triggers_contact_id
  on public.email_automation_triggers (contact_id);

create index if not exists idx_email_automation_triggers_related_order_id
  on public.email_automation_triggers (related_order_id);

create index if not exists idx_email_campaign_recipients_contact_id
  on public.email_campaign_recipients (contact_id);

create index if not exists idx_email_campaigns_audience_list_id
  on public.email_campaigns (audience_list_id);

create index if not exists idx_email_campaigns_created_by
  on public.email_campaigns (created_by);

create index if not exists idx_email_campaigns_promo_code_id
  on public.email_campaigns (promo_code_id);

create index if not exists idx_email_sends_automation_id
  on public.email_sends (automation_id);

create index if not exists idx_email_sends_campaign_id
  on public.email_sends (campaign_id);

create index if not exists idx_email_sends_template_id
  on public.email_sends (template_id);

create index if not exists idx_feedback_audit_log_feedback_id
  on public.feedback_audit_log (feedback_id);

create index if not exists idx_feedback_comments_feedback_id
  on public.feedback_comments (feedback_id);

create index if not exists idx_feedback_comments_profile_id
  on public.feedback_comments (profile_id);

create index if not exists idx_feedback_items_profile_id
  on public.feedback_items (profile_id);

create index if not exists idx_lesson_comments_lesson_id
  on public.lesson_comments (lesson_id);

create index if not exists idx_lesson_comments_parent_id
  on public.lesson_comments (parent_id);

create index if not exists idx_lesson_comments_profile_id
  on public.lesson_comments (profile_id);

create index if not exists idx_lesson_progress_lesson_id
  on public.lesson_progress (lesson_id);

create index if not exists idx_lessons_module_id
  on public.lessons (module_id);

create index if not exists idx_master_artworks_uploaded_by
  on public.master_artworks (uploaded_by);

create index if not exists idx_media_library_uploaded_by
  on public.media_library (uploaded_by);

create index if not exists idx_order_items_product_id
  on public.order_items (product_id);

create index if not exists idx_order_items_variant_id
  on public.order_items (variant_id);

create index if not exists idx_page_revisions_edited_by
  on public.page_revisions (edited_by);

create index if not exists idx_product_images_product_id
  on public.product_images (product_id);

create index if not exists idx_project_note_comments_note_id
  on public.project_note_comments (note_id);

create index if not exists idx_project_note_comments_profile_id
  on public.project_note_comments (profile_id);

create index if not exists idx_project_notes_profile_id
  on public.project_notes (profile_id);

create index if not exists idx_promo_code_redemptions_order_id
  on public.promo_code_redemptions (order_id);

create index if not exists idx_promo_codes_audience_list_id
  on public.promo_codes (audience_list_id);

create index if not exists idx_promo_codes_created_by
  on public.promo_codes (created_by);

create index if not exists idx_shared_files_uploaded_by
  on public.shared_files (uploaded_by);

create index if not exists idx_site_content_updated_by
  on public.site_content (updated_by);

create index if not exists idx_social_post_media_media_id
  on public.social_post_media (media_id);

create index if not exists idx_social_posts_account_id
  on public.social_posts (account_id);

create index if not exists idx_social_posts_blog_post_id
  on public.social_posts (blog_post_id);

create index if not exists idx_social_posts_product_id
  on public.social_posts (product_id);

create index if not exists idx_unsubscribe_events_list_id
  on public.unsubscribe_events (list_id);

create index if not exists idx_wishlist_items_product_id
  on public.wishlist_items (product_id);

create index if not exists idx_work_request_audit_log_work_request_id
  on public.work_request_audit_log (work_request_id);

create index if not exists idx_work_request_comments_profile_id
  on public.work_request_comments (profile_id);

create index if not exists idx_work_request_comments_work_request_id
  on public.work_request_comments (work_request_id);

create index if not exists idx_work_requests_profile_id
  on public.work_requests (profile_id);
