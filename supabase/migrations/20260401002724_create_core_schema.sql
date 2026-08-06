-- Materialized verbatim from the production migration ledger
-- (supabase_migrations.schema_migrations) on 2026-08-06 for disaster-recovery
-- completeness.
--
-- This change was applied to the production project through the management API and
-- had no corresponding file in supabase/migrations/. The body below is the ledger
-- row's statements joined with a blank line, each terminated by a semicolon, and is
-- reproduced without modification.
--
-- Ledger version: 20260401002724
-- Ledger name:    create_core_schema


-- ==========================================
-- USERS & AUTH (extends Supabase Auth)
-- ==========================================

CREATE TABLE profiles (
  id UUID PRIMARY KEY REFERENCES auth.users(id),
  full_name TEXT,
  email TEXT UNIQUE NOT NULL,
  phone TEXT,
  avatar_url TEXT,
  role TEXT DEFAULT 'customer' CHECK (role IN ('customer', 'admin', 'artist')),
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE TABLE addresses (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  profile_id UUID REFERENCES profiles(id) ON DELETE CASCADE,
  label TEXT DEFAULT 'default',
  line1 TEXT NOT NULL,
  line2 TEXT,
  city TEXT NOT NULL,
  state TEXT NOT NULL,
  postal_code TEXT NOT NULL,
  country TEXT DEFAULT 'US',
  is_default BOOLEAN DEFAULT false,
  created_at TIMESTAMPTZ DEFAULT NOW()
);

-- ==========================================
-- PRODUCTS
-- ==========================================

CREATE TABLE categories (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  name TEXT NOT NULL,
  slug TEXT UNIQUE NOT NULL,
  description TEXT,
  image_url TEXT,
  sort_order INT DEFAULT 0
);

CREATE TABLE products (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  category_id UUID REFERENCES categories(id),
  title TEXT NOT NULL,
  slug TEXT UNIQUE NOT NULL,
  description_json JSONB,
  description_html TEXT,
  story_json JSONB,
  story_html TEXT,
  medium TEXT,
  dimensions TEXT,
  base_price DECIMAL(10,2) NOT NULL,
  compare_at_price DECIMAL(10,2),
  fulfillment_type TEXT NOT NULL CHECK (fulfillment_type IN ('lumaprints', 'printful', 'self_ship')),
  lumaprints_product_config JSONB,
  printful_sync_product_id TEXT,
  status TEXT DEFAULT 'active' CHECK (status IN ('active', 'draft', 'archived', 'sold')),
  is_original BOOLEAN DEFAULT false,
  is_featured BOOLEAN DEFAULT false,
  tags TEXT[],
  seo_title TEXT,
  seo_description TEXT,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE TABLE product_images (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  product_id UUID REFERENCES products(id) ON DELETE CASCADE,
  url TEXT NOT NULL,
  alt_text TEXT,
  sort_order INT DEFAULT 0,
  is_primary BOOLEAN DEFAULT false
);

CREATE TABLE product_variants (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  product_id UUID REFERENCES products(id) ON DELETE CASCADE,
  name TEXT NOT NULL,
  sku TEXT UNIQUE,
  price DECIMAL(10,2) NOT NULL,
  external_variant_id TEXT,
  fulfillment_metadata JSONB,
  inventory_count INT,
  sort_order INT DEFAULT 0
);

-- ==========================================
-- ORDERS
-- ==========================================

CREATE TABLE orders (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  order_number SERIAL,
  profile_id UUID REFERENCES profiles(id),
  email TEXT NOT NULL,
  stripe_checkout_session_id TEXT,
  stripe_payment_intent_id TEXT,
  status TEXT DEFAULT 'pending' CHECK (status IN (
    'pending', 'processing', 'partially_fulfilled', 'fulfilled', 'shipped', 'delivered', 'cancelled', 'refunded'
  )),
  subtotal DECIMAL(10,2) NOT NULL,
  shipping_cost DECIMAL(10,2) DEFAULT 0,
  tax DECIMAL(10,2) DEFAULT 0,
  discount DECIMAL(10,2) DEFAULT 0,
  total DECIMAL(10,2) NOT NULL,
  promo_code TEXT,
  shipping_address JSONB NOT NULL,
  billing_address JSONB,
  notes TEXT,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE TABLE order_items (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  order_id UUID REFERENCES orders(id) ON DELETE CASCADE,
  product_id UUID REFERENCES products(id),
  variant_id UUID REFERENCES product_variants(id),
  quantity INT NOT NULL DEFAULT 1,
  unit_price DECIMAL(10,2) NOT NULL,
  fulfillment_type TEXT NOT NULL,
  fulfillment_status TEXT DEFAULT 'pending' CHECK (fulfillment_status IN (
    'pending', 'submitted', 'in_production', 'shipped', 'delivered', 'cancelled'
  )),
  external_order_id TEXT,
  tracking_number TEXT,
  tracking_url TEXT,
  carrier TEXT,
  shipped_at TIMESTAMPTZ,
  delivered_at TIMESTAMPTZ
);

-- ==========================================
-- COMMISSIONS
-- ==========================================

CREATE TABLE commissions (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  commission_number SERIAL,
  profile_id UUID REFERENCES profiles(id),
  client_name TEXT NOT NULL,
  client_email TEXT NOT NULL,
  client_phone TEXT,
  description TEXT NOT NULL,
  preferred_medium TEXT,
  preferred_size TEXT,
  budget_range TEXT,
  timeline TEXT,
  reference_images TEXT[],
  status TEXT DEFAULT 'inquiry' CHECK (status IN (
    'inquiry', 'quoted', 'deposit_paid', 'sketch_phase', 'sketch_approved',
    'in_progress', 'review', 'completed', 'shipped', 'delivered', 'cancelled'
  )),
  quoted_price DECIMAL(10,2),
  deposit_amount DECIMAL(10,2),
  deposit_stripe_invoice_id TEXT,
  final_stripe_invoice_id TEXT,
  shipping_address JSONB,
  estimated_completion DATE,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE TABLE commission_messages (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  commission_id UUID REFERENCES commissions(id) ON DELETE CASCADE,
  sender_type TEXT NOT NULL CHECK (sender_type IN ('client', 'artist')),
  sender_id UUID REFERENCES profiles(id),
  message TEXT NOT NULL,
  attachments TEXT[],
  created_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE TABLE commission_milestones (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  commission_id UUID REFERENCES commissions(id) ON DELETE CASCADE,
  title TEXT NOT NULL,
  description TEXT,
  images TEXT[],
  status TEXT DEFAULT 'pending' CHECK (status IN ('pending', 'in_progress', 'completed', 'approved')),
  completed_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ DEFAULT NOW()
);

-- ==========================================
-- LMS (CLASSES & COURSES)
-- ==========================================

CREATE TABLE courses (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  title TEXT NOT NULL,
  slug TEXT UNIQUE NOT NULL,
  description TEXT,
  long_description TEXT,
  instructor_name TEXT DEFAULT 'ArtByMe',
  thumbnail_url TEXT,
  preview_video_url TEXT,
  price DECIMAL(10,2),
  stripe_price_id TEXT,
  course_type TEXT DEFAULT 'on_demand' CHECK (course_type IN ('on_demand', 'live', 'hybrid')),
  difficulty_level TEXT CHECK (difficulty_level IN ('beginner', 'intermediate', 'advanced', 'all_levels')),
  materials_needed TEXT,
  status TEXT DEFAULT 'draft' CHECK (status IN ('draft', 'published', 'archived')),
  published_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE TABLE course_modules (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  course_id UUID REFERENCES courses(id) ON DELETE CASCADE,
  title TEXT NOT NULL,
  description TEXT,
  sort_order INT DEFAULT 0
);

CREATE TABLE lessons (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  module_id UUID REFERENCES course_modules(id) ON DELETE CASCADE,
  title TEXT NOT NULL,
  slug TEXT NOT NULL,
  description TEXT,
  video_url TEXT,
  video_duration_minutes INT,
  content_json JSONB,
  content_html TEXT,
  resources JSONB,
  is_preview BOOLEAN DEFAULT false,
  sort_order INT DEFAULT 0,
  created_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE TABLE enrollments (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  profile_id UUID REFERENCES profiles(id) ON DELETE CASCADE,
  course_id UUID REFERENCES courses(id) ON DELETE CASCADE,
  stripe_checkout_session_id TEXT,
  status TEXT DEFAULT 'active' CHECK (status IN ('active', 'completed', 'refunded')),
  enrolled_at TIMESTAMPTZ DEFAULT NOW(),
  completed_at TIMESTAMPTZ,
  UNIQUE(profile_id, course_id)
);

CREATE TABLE lesson_progress (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  enrollment_id UUID REFERENCES enrollments(id) ON DELETE CASCADE,
  lesson_id UUID REFERENCES lessons(id) ON DELETE CASCADE,
  is_completed BOOLEAN DEFAULT false,
  completed_at TIMESTAMPTZ,
  last_position_seconds INT DEFAULT 0,
  UNIQUE(enrollment_id, lesson_id)
);

CREATE TABLE lesson_comments (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  lesson_id UUID REFERENCES lessons(id) ON DELETE CASCADE,
  profile_id UUID REFERENCES profiles(id) ON DELETE CASCADE,
  content TEXT NOT NULL,
  parent_id UUID REFERENCES lesson_comments(id),
  created_at TIMESTAMPTZ DEFAULT NOW()
);

-- ==========================================
-- BLOG & CMS CONTENT
-- ==========================================

CREATE TABLE blog_posts (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  title TEXT NOT NULL,
  slug TEXT UNIQUE NOT NULL,
  excerpt TEXT,
  content_json JSONB NOT NULL,
  content_html TEXT NOT NULL,
  cover_image_url TEXT,
  author_id UUID REFERENCES profiles(id),
  status TEXT DEFAULT 'draft' CHECK (status IN ('draft', 'published', 'archived')),
  tags TEXT[],
  seo_title TEXT,
  seo_description TEXT,
  published_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE TABLE pages (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  title TEXT NOT NULL,
  slug TEXT UNIQUE NOT NULL,
  content_json JSONB NOT NULL,
  content_html TEXT NOT NULL,
  seo_title TEXT,
  seo_description TEXT,
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE TABLE testimonials (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  name TEXT NOT NULL,
  role TEXT,
  quote TEXT NOT NULL,
  avatar_url TEXT,
  is_featured BOOLEAN DEFAULT false,
  sort_order INT DEFAULT 0,
  created_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE TABLE faqs (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  question TEXT NOT NULL,
  answer_json JSONB NOT NULL,
  answer_html TEXT NOT NULL,
  category TEXT,
  sort_order INT DEFAULT 0,
  is_published BOOLEAN DEFAULT true
);

-- ==========================================
-- MARKETING & MISC
-- ==========================================

CREATE TABLE newsletter_subscribers (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  email TEXT UNIQUE NOT NULL,
  first_name TEXT,
  source TEXT,
  subscribed_at TIMESTAMPTZ DEFAULT NOW(),
  unsubscribed_at TIMESTAMPTZ
);

CREATE TABLE promo_codes (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  code TEXT UNIQUE NOT NULL,
  discount_type TEXT CHECK (discount_type IN ('percentage', 'fixed')),
  discount_value DECIMAL(10,2) NOT NULL,
  min_order_amount DECIMAL(10,2),
  usage_limit INT,
  usage_count INT DEFAULT 0,
  valid_from TIMESTAMPTZ,
  valid_until TIMESTAMPTZ,
  is_active BOOLEAN DEFAULT true
);

CREATE TABLE wishlist_items (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  profile_id UUID REFERENCES profiles(id) ON DELETE CASCADE,
  product_id UUID REFERENCES products(id) ON DELETE CASCADE,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  UNIQUE(profile_id, product_id)
);

CREATE TABLE webhook_logs (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  source TEXT NOT NULL,
  event_type TEXT,
  payload JSONB NOT NULL,
  processed BOOLEAN DEFAULT false,
  error TEXT,
  created_at TIMESTAMPTZ DEFAULT NOW()
);

-- ==========================================
-- SITE CONTENT (Tier 1: instant swaps)
-- ==========================================

CREATE TABLE site_content (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  page TEXT NOT NULL,
  section TEXT NOT NULL,
  content_key TEXT NOT NULL,
  content_value TEXT NOT NULL,
  content_type TEXT DEFAULT 'text' CHECK (content_type IN ('text', 'image', 'link', 'boolean', 'number', 'color')),
  is_active BOOLEAN DEFAULT true,
  updated_at TIMESTAMPTZ DEFAULT NOW(),
  updated_by UUID REFERENCES profiles(id),
  UNIQUE(page, section, content_key)
);

-- ==========================================
-- PAGE BLOCKS (Tier 2: reorderable sections)
-- ==========================================

CREATE TABLE page_blocks (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  page TEXT NOT NULL,
  block_type TEXT NOT NULL,
  sort_order INT DEFAULT 0,
  is_visible BOOLEAN DEFAULT true,
  config JSONB DEFAULT '{}',
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- ==========================================
-- CHANGE REQUESTS (Tier 3)
-- ==========================================

CREATE TABLE change_requests (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  requester_id UUID REFERENCES profiles(id),
  title TEXT NOT NULL,
  description TEXT NOT NULL,
  page_affected TEXT,
  priority TEXT DEFAULT 'normal' CHECK (priority IN ('normal', 'urgent')),
  attachments TEXT[],
  status TEXT DEFAULT 'pending' CHECK (status IN ('pending', 'in_progress', 'preview_ready', 'approved', 'deployed', 'rejected')),
  preview_url TEXT,
  git_branch TEXT,
  developer_notes TEXT,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  completed_at TIMESTAMPTZ
);

-- ==========================================
-- EMAIL SYSTEM
-- ==========================================

CREATE TABLE email_templates (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  name TEXT NOT NULL,
  subject TEXT NOT NULL,
  content_json JSONB NOT NULL,
  content_html TEXT NOT NULL,
  template_type TEXT NOT NULL CHECK (template_type IN ('transactional', 'marketing', 'automation')),
  category TEXT,
  variables TEXT[],
  is_active BOOLEAN DEFAULT true,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE TABLE email_campaigns (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  name TEXT NOT NULL,
  template_id UUID REFERENCES email_templates(id),
  subject_override TEXT,
  segment TEXT DEFAULT 'all',
  status TEXT DEFAULT 'draft' CHECK (status IN ('draft', 'scheduled', 'sending', 'sent', 'cancelled')),
  scheduled_for TIMESTAMPTZ,
  sent_at TIMESTAMPTZ,
  recipients_count INT DEFAULT 0,
  opens_count INT DEFAULT 0,
  clicks_count INT DEFAULT 0,
  created_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE TABLE email_automations (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  name TEXT NOT NULL,
  trigger_event TEXT NOT NULL,
  is_active BOOLEAN DEFAULT true,
  created_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE TABLE email_automation_steps (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  automation_id UUID REFERENCES email_automations(id) ON DELETE CASCADE,
  step_order INT NOT NULL,
  delay_minutes INT NOT NULL,
  template_id UUID REFERENCES email_templates(id),
  condition JSONB,
  is_active BOOLEAN DEFAULT true
);

CREATE TABLE email_sends (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  email TEXT NOT NULL,
  template_id UUID REFERENCES email_templates(id),
  campaign_id UUID REFERENCES email_campaigns(id),
  automation_id UUID REFERENCES email_automations(id),
  resend_message_id TEXT,
  status TEXT DEFAULT 'pending' CHECK (status IN ('pending', 'sent', 'delivered', 'opened', 'clicked', 'bounced', 'failed')),
  sent_at TIMESTAMPTZ,
  opened_at TIMESTAMPTZ,
  clicked_at TIMESTAMPTZ,
  variables_used JSONB
);

-- ==========================================
-- SHOPPING CARTS (abandoned cart tracking)
-- ==========================================

CREATE TABLE carts (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  profile_id UUID REFERENCES profiles(id),
  email TEXT,
  items JSONB NOT NULL DEFAULT '[]',
  subtotal DECIMAL(10,2) DEFAULT 0,
  last_activity_at TIMESTAMPTZ DEFAULT NOW(),
  converted_order_id UUID REFERENCES orders(id),
  abandoned_email_1_sent_at TIMESTAMPTZ,
  abandoned_email_2_sent_at TIMESTAMPTZ,
  abandoned_email_3_sent_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- ==========================================
-- META CONVERSION API EVENTS
-- ==========================================

CREATE TABLE meta_events (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  event_name TEXT NOT NULL,
  event_id TEXT NOT NULL,
  user_data JSONB,
  custom_data JSONB,
  source_url TEXT,
  sent_to_meta BOOLEAN DEFAULT false,
  meta_response JSONB,
  created_at TIMESTAMPTZ DEFAULT NOW()
);

-- ==========================================
-- AUDIT LOG
-- ==========================================

CREATE TABLE audit_log (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  table_name TEXT NOT NULL,
  record_id UUID NOT NULL,
  field_name TEXT NOT NULL,
  old_value TEXT,
  new_value TEXT,
  changed_by UUID REFERENCES profiles(id),
  created_at TIMESTAMPTZ DEFAULT NOW()
);

-- ==========================================
-- INDEXES
-- ==========================================

CREATE INDEX idx_products_category ON products(category_id);
CREATE INDEX idx_products_status ON products(status);
CREATE INDEX idx_products_slug ON products(slug);
CREATE INDEX idx_products_featured ON products(is_featured) WHERE is_featured = true;
CREATE INDEX idx_orders_profile ON orders(profile_id);
CREATE INDEX idx_orders_email ON orders(email);
CREATE INDEX idx_orders_status ON orders(status);
CREATE INDEX idx_order_items_order ON order_items(order_id);
CREATE INDEX idx_order_items_fulfillment ON order_items(fulfillment_status);
CREATE INDEX idx_commissions_profile ON commissions(profile_id);
CREATE INDEX idx_commissions_status ON commissions(status);
CREATE INDEX idx_blog_posts_slug ON blog_posts(slug);
CREATE INDEX idx_blog_posts_status ON blog_posts(status);
CREATE INDEX idx_site_content_page ON site_content(page, section);
CREATE INDEX idx_page_blocks_page ON page_blocks(page, sort_order);
CREATE INDEX idx_carts_email ON carts(email);
CREATE INDEX idx_carts_activity ON carts(last_activity_at) WHERE converted_order_id IS NULL;
CREATE INDEX idx_meta_events_unsent ON meta_events(sent_to_meta) WHERE sent_to_meta = false;
CREATE INDEX idx_email_sends_status ON email_sends(status);
CREATE INDEX idx_enrollments_profile ON enrollments(profile_id);
CREATE INDEX idx_enrollments_course ON enrollments(course_id);
CREATE INDEX idx_newsletter_email ON newsletter_subscribers(email);
CREATE INDEX idx_wishlist_profile ON wishlist_items(profile_id);
