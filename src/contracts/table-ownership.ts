// Authored by DotWin
// Table ownership + class, derived from the real schema during the adopt domain-cell pass
// (2026-06-24). One row per public table (73 total).
//
//   owner  : the business area responsible for the table's invariant (see domain-map.ts).
//   class  : 'core'        — carries a business invariant; a torn/partial write is a real defect.
//            'recoverable' — side-effect/log/cache; a torn write self-heals or is re-derivable,
//                            and an event handler is permitted to write it (check-event-boundaries).
//
// ENFORCEMENT NOTE (legacy adopt): the app has no src/domains/ cells yet, so check-table-ownership
// (which maps a written table to its owner by domain prefix) runs in SCORE mode and currently
// skips for lack of cells. This file is the declared fact the audit scores against and the future
// domain manifests will assert. The class labels here are authoritative input to the staged
// refactor (audit/ADOPT-2026-06-24/). Until cells exist, the write boundary is enforced at the
// database by RLS (check-rls, passing) — that is the real backstop, per write-boundary-rls.md.
export const tableOwnership = {
  // identity
  profiles: { owner: 'identity', class: 'core' },
  addresses: { owner: 'identity', class: 'core' },

  // catalog
  products: { owner: 'catalog', class: 'core' },
  product_images: { owner: 'catalog', class: 'recoverable' },
  product_variants: { owner: 'catalog', class: 'core' },
  categories: { owner: 'catalog', class: 'core' },
  product_categories: { owner: 'catalog', class: 'core' },
  master_artworks: { owner: 'catalog', class: 'core' },

  // commerce
  orders: { owner: 'commerce', class: 'core' },
  order_items: { owner: 'commerce', class: 'core' },
  carts: { owner: 'commerce', class: 'core' },
  wishlist_items: { owner: 'commerce', class: 'recoverable' },

  // promo
  promo_codes: { owner: 'promo', class: 'core' },
  promo_code_redemptions: { owner: 'promo', class: 'core' },

  // fulfillment pricing (cache: re-derivable from provider)
  lumaprints_pricing_cache: { owner: 'fulfillmentPricing', class: 'recoverable' },
  lumaprints_mediums: { owner: 'fulfillmentPricing', class: 'core' },

  // commissions
  commissions: { owner: 'commissions', class: 'core' },
  commission_messages: { owner: 'commissions', class: 'core' },
  commission_milestones: { owner: 'commissions', class: 'core' },

  // lms
  courses: { owner: 'lms', class: 'core' },
  course_modules: { owner: 'lms', class: 'core' },
  lessons: { owner: 'lms', class: 'core' },
  enrollments: { owner: 'lms', class: 'core' },
  lesson_progress: { owner: 'lms', class: 'core' },
  lesson_comments: { owner: 'lms', class: 'recoverable' },

  // classes
  class_sessions: { owner: 'classes', class: 'core' },
  class_bookings: { owner: 'classes', class: 'core' },

  // cms
  blog_posts: { owner: 'cms', class: 'core' },
  pages: { owner: 'cms', class: 'core' },
  page_blocks: { owner: 'cms', class: 'core' },
  page_revisions: { owner: 'cms', class: 'recoverable' },
  site_content: { owner: 'cms', class: 'core' },
  site_settings: { owner: 'cms', class: 'core' },
  testimonials: { owner: 'cms', class: 'core' },
  testimonial_media: { owner: 'cms', class: 'recoverable' },
  faqs: { owner: 'cms', class: 'core' },
  bio_sections: { owner: 'cms', class: 'core' },
  bio_callouts: { owner: 'cms', class: 'core' },
  bio_credentials_block: { owner: 'cms', class: 'core' },
  cv_entries: { owner: 'cms', class: 'core' },
  cv_settings: { owner: 'cms', class: 'core' },

  // crm
  crm_contacts: { owner: 'crm', class: 'core' },
  contact_lists: { owner: 'crm', class: 'core' },
  contact_list_members: { owner: 'crm', class: 'core' },
  newsletter_subscribers: { owner: 'crm', class: 'core' },

  // email
  email_templates: { owner: 'email', class: 'core' },
  email_campaigns: { owner: 'email', class: 'core' },
  email_campaign_recipients: { owner: 'email', class: 'core' },
  email_sends: { owner: 'email', class: 'recoverable' },
  email_automations: { owner: 'email', class: 'core' },
  email_automation_steps: { owner: 'email', class: 'core' },
  email_automation_sends: { owner: 'email', class: 'recoverable' },
  email_automation_triggers: { owner: 'email', class: 'recoverable' },
  unsubscribe_events: { owner: 'email', class: 'recoverable' },

  // social
  social_accounts: { owner: 'social', class: 'core' },
  social_posts: { owner: 'social', class: 'core' },
  social_post_media: { owner: 'social', class: 'recoverable' },

  // analytics
  meta_events: { owner: 'analytics', class: 'recoverable' },

  // workspace (internal collaboration)
  feedback_items: { owner: 'workspace', class: 'core' },
  feedback_comments: { owner: 'workspace', class: 'core' },
  feedback_audit_log: { owner: 'workspace', class: 'recoverable' },
  work_requests: { owner: 'workspace', class: 'core' },
  work_request_comments: { owner: 'workspace', class: 'core' },
  work_request_audit_log: { owner: 'workspace', class: 'recoverable' },
  project_notes: { owner: 'workspace', class: 'core' },
  project_note_comments: { owner: 'workspace', class: 'core' },
  change_requests: { owner: 'workspace', class: 'core' },
  artwork_funnels: { owner: 'workspace', class: 'recoverable' },

  // media
  media_library: { owner: 'media', class: 'recoverable' },
  shared_files: { owner: 'media', class: 'core' },
  shared_file_tags: { owner: 'media', class: 'recoverable' },

  // platform (shared side-effect logs — written by multiple areas BY DESIGN)
  audit_log: { owner: 'platform', class: 'recoverable' },
  webhook_logs: { owner: 'platform', class: 'recoverable' },
} as const;
