-- Phase 4.5 — Expand site_settings with ~20 typed configuration columns.
-- site_settings.id is BOOLEAN (single-row table → .eq('id', true)).
-- Idempotent: every column uses ADD COLUMN IF NOT EXISTS.

ALTER TABLE public.site_settings
  -- Business & Contact Info
  ADD COLUMN IF NOT EXISTS business_name TEXT DEFAULT 'ArtByME',
  ADD COLUMN IF NOT EXISTS business_email TEXT DEFAULT 'hello@artbyme.studio',
  ADD COLUMN IF NOT EXISTS business_phone TEXT,
  ADD COLUMN IF NOT EXISTS business_address JSONB,

  -- Email Configuration
  ADD COLUMN IF NOT EXISTS email_from_name TEXT DEFAULT 'ArtByME',
  ADD COLUMN IF NOT EXISTS email_from_address TEXT DEFAULT 'hello@artbyme.studio',
  ADD COLUMN IF NOT EXISTS order_notification_email TEXT,

  -- Shipping Configuration
  ADD COLUMN IF NOT EXISTS shipping_origin_zip TEXT,
  ADD COLUMN IF NOT EXISTS shipping_origin_state TEXT,
  ADD COLUMN IF NOT EXISTS free_shipping_threshold_cents INTEGER,

  -- Tax Configuration
  ADD COLUMN IF NOT EXISTS tax_enabled BOOLEAN DEFAULT false,
  ADD COLUMN IF NOT EXISTS tax_rate_pct NUMERIC(5,2),
  ADD COLUMN IF NOT EXISTS tax_nexus_states TEXT[],

  -- SEO & Metadata
  ADD COLUMN IF NOT EXISTS seo_title TEXT,
  ADD COLUMN IF NOT EXISTS seo_description TEXT,
  ADD COLUMN IF NOT EXISTS og_image_url TEXT,

  -- Social Links
  ADD COLUMN IF NOT EXISTS instagram_url TEXT,
  ADD COLUMN IF NOT EXISTS facebook_url TEXT,
  ADD COLUMN IF NOT EXISTS pinterest_url TEXT,

  -- Site Configuration
  ADD COLUMN IF NOT EXISTS announcement_bar_text TEXT,
  ADD COLUMN IF NOT EXISTS announcement_bar_enabled BOOLEAN DEFAULT false,
  ADD COLUMN IF NOT EXISTS maintenance_mode BOOLEAN DEFAULT false,
  ADD COLUMN IF NOT EXISTS currency_code TEXT DEFAULT 'usd',

  -- Integration Toggles
  ADD COLUMN IF NOT EXISTS lumaprints_enabled BOOLEAN DEFAULT true,
  ADD COLUMN IF NOT EXISTS printful_enabled BOOLEAN DEFAULT true,
  ADD COLUMN IF NOT EXISTS shipstation_enabled BOOLEAN DEFAULT true,
  ADD COLUMN IF NOT EXISTS meta_pixel_enabled BOOLEAN DEFAULT true,

  -- Legal Page Visibility
  ADD COLUMN IF NOT EXISTS show_tos BOOLEAN DEFAULT true,
  ADD COLUMN IF NOT EXISTS show_privacy BOOLEAN DEFAULT true,
  ADD COLUMN IF NOT EXISTS show_shipping_policy BOOLEAN DEFAULT true;

-- Ensure the single settings row exists, then backfill email defaults.
INSERT INTO public.site_settings (id)
VALUES (true)
ON CONFLICT (id) DO NOTHING;

UPDATE public.site_settings
SET
  email_from_name = COALESCE(email_from_name, 'ArtByME'),
  email_from_address = COALESCE(email_from_address, 'hello@artbyme.studio'),
  business_name = COALESCE(business_name, 'ArtByME'),
  business_email = COALESCE(business_email, 'hello@artbyme.studio')
WHERE id = true;
