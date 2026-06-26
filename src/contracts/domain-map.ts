// Authored by DotWin
// Derived domain map for the ArtByME application (adopt, 2026-06-24).
//
// This is the human-facing at-a-glance index of business area -> owned tables, reverse-engineered
// from the real schema (73 public tables) during the domain-cell conformance pass. It is NOT yet
// enforced by folder structure: the app today is a Next.js App Router monolith under src/app, with
// no src/domains/ cells. Ownership here is therefore DECLARED, not yet enforced by table prefix
// (see table-ownership.ts and KNOWN_RISKS "#me-domain-cell-conformance-2026-06-24").
//
// Collision / naming reality (recorded per protocol): the schema uses bare table names, not
// domain-prefixed ones, so check-table-ownership cannot enforce the write boundary by prefix until
// either (a) future domain manifests list their tables explicitly, or (b) tables are renamed under
// a prefix. The shared recoverable tables audit_log and webhook_logs are written from several
// areas by design (they are side-effect logs, class: recoverable in table-ownership.ts).
export const domainMap = {
  identity: ['profiles', 'addresses'],
  catalog: ['products', 'product_images', 'product_variants', 'categories', 'product_categories', 'master_artworks'],
  commerce: ['orders', 'order_items', 'carts', 'wishlist_items'],
  promo: ['promo_codes', 'promo_code_redemptions'],
  fulfillmentPricing: ['lumaprints_pricing_cache', 'lumaprints_mediums'],
  commissions: ['commissions', 'commission_messages', 'commission_milestones'],
  lms: ['courses', 'course_modules', 'lessons', 'enrollments', 'lesson_progress', 'lesson_comments'],
  classes: ['class_sessions', 'class_bookings'],
  cms: [
    'blog_posts', 'pages', 'page_blocks', 'page_revisions', 'site_content', 'site_settings',
    'testimonials', 'testimonial_media', 'faqs',
    'bio_sections', 'bio_callouts', 'bio_credentials_block', 'cv_entries', 'cv_settings',
  ],
  crm: ['crm_contacts', 'contact_lists', 'contact_list_members', 'newsletter_subscribers'],
  email: [
    'email_templates', 'email_campaigns', 'email_campaign_recipients', 'email_sends',
    'email_automations', 'email_automation_steps', 'email_automation_sends', 'email_automation_triggers',
    'unsubscribe_events',
  ],
  social: ['social_accounts', 'social_posts', 'social_post_media'],
  analytics: ['meta_events'],
  workspace: [
    'feedback_items', 'feedback_comments', 'feedback_audit_log',
    'work_requests', 'work_request_comments', 'work_request_audit_log',
    'project_notes', 'project_note_comments', 'change_requests', 'artwork_funnels',
  ],
  media: ['media_library', 'shared_files', 'shared_file_tags'],
  platform: ['audit_log', 'webhook_logs'],
} as const;
