# Verified DB schema (authoritative — confirmed via information_schema 2026-06-08)
profiles: id(uuid, = auth.uid()), full_name, email, phone, avatar_url, role, created_at, updated_at  (NO auth_user_id column)
courses: id, title, slug, description, long_description, instructor_name, thumbnail_url, preview_video_url, price(numeric), stripe_price_id, course_type, difficulty_level, materials_needed, status, published_at, created_at, updated_at
course_modules: id, course_id, title, description, sort_order
lessons: id, module_id, title, slug, description, video_url, video_duration_minutes, content_json(jsonb), content_html, resources(jsonb), is_preview(bool), sort_order, created_at
enrollments: id, profile_id, course_id, stripe_checkout_session_id, status, enrolled_at, completed_at  (UNIQUE(profile_id,course_id))
lesson_progress: id, enrollment_id, lesson_id, is_completed(bool), completed_at, last_position_seconds  (UNIQUE(enrollment_id,lesson_id))
lesson_comments: id, lesson_id, profile_id, content, parent_id, created_at
wishlist_items: id, profile_id, product_id, created_at
addresses: id, profile_id, label, line1, line2, city, state, postal_code, country, is_default(bool), created_at
site_settings: id(BOOLEAN, always true → .eq('id', true)), default_margin_pct, shipping_quote_zips(array), updated_at, stripe_test_mode(bool)
email_automations: id, name, trigger_event, is_active(bool), created_at, slug, description, updated_at
email_automation_steps: id, automation_id, step_order, delay_minutes, subject, preheader, content_html, promo_code_kind, promo_percent_off, promo_expires_in_hours, created_at
crm_contacts: id, email, first_name, last_name, phone, source, status, tags(array), total_orders, total_spent_cents, last_purchase_at, last_active_at, profile_id, notes, created_at, updated_at
products: id, slug, status('active'|'draft'|'sold'), title, base_price, fulfillment_type, ... (detail page at /shop/art/[slug])
media_library: id, url, alt_text, file_name, ... (84 rows)
# Conventions: admin API → requireAdmin(); cron/webhook → createServiceClient() + 'Authorization: Bearer CRON_SECRET'; public → createClient(); sanitize HTML via sanitizeHtml from @/lib/sanitize; email via sendEmail from @/lib/email/send + brandedShell from @/lib/email/shell; signed URLs via signBucketUrls from @/lib/storage/signed. is_admin_or_artist() exists for RLS.
