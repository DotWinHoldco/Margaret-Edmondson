-- Phase 4.1 — Social Content Calendar
-- Tables: social_accounts, social_posts, social_post_media
-- Admin-only RLS via is_admin_or_artist(). Idempotent.
--
-- GOTCHA (token security): social_accounts.access_token / refresh_token are
-- stored as plaintext for Phase 1. This is security debt. Before any live
-- OAuth integration (Phase 2 Meta Graph publish) these MUST be moved into
-- Supabase Vault (vault.create_secret / vault.decrypted_secrets) or encrypted
-- at rest. Do NOT expose these columns to any non-admin path.
--
-- NOTE on updated_at: we do NOT rely on the `moddatetime` extension (it may
-- not be installed). updated_at is maintained in the API layer (every PATCH
-- sets updated_at = now()). No DB trigger is created here.

-- ─── social_accounts ──────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS public.social_accounts (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  provider text NOT NULL CHECK (provider IN ('instagram', 'facebook', 'twitter', 'tiktok', 'pinterest', 'linkedin')),
  handle text NOT NULL,
  display_name text,
  avatar_url text,
  access_token text,              -- GOTCHA: plaintext; move to Vault before live publish
  refresh_token text,             -- GOTCHA: plaintext; move to Vault before live publish
  token_expires_at timestamptz,
  connected boolean NOT NULL DEFAULT false,
  page_id text,                   -- Facebook Page ID for IG/FB dual publish
  extra jsonb,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

-- ─── social_posts ─────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS public.social_posts (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  account_id uuid REFERENCES public.social_accounts(id) ON DELETE SET NULL,
  channel text NOT NULL CHECK (channel IN ('instagram', 'facebook', 'twitter', 'tiktok', 'pinterest', 'linkedin')),
  body text,
  media_urls text[] NOT NULL DEFAULT '{}',
  link_url text,
  hashtags text[],
  status text NOT NULL DEFAULT 'draft'
    CHECK (status IN ('draft', 'scheduled', 'publishing', 'published', 'failed', 'cancelled')),
  scheduled_at timestamptz,
  published_at timestamptz,
  provider_post_id text,          -- populated after Meta/platform publish
  error_message text,
  progress_pct smallint CHECK (progress_pct BETWEEN 0 AND 100),
  blog_post_id uuid REFERENCES public.blog_posts(id) ON DELETE SET NULL,
  product_id uuid REFERENCES public.products(id) ON DELETE SET NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

-- ─── social_post_media (ordered media join) ───────────────────────────
CREATE TABLE IF NOT EXISTS public.social_post_media (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  post_id uuid NOT NULL REFERENCES public.social_posts(id) ON DELETE CASCADE,
  media_id uuid REFERENCES public.media_library(id) ON DELETE SET NULL,
  url text NOT NULL,
  sort_order smallint NOT NULL DEFAULT 0
);

-- ─── Indexes ──────────────────────────────────────────────────────────
CREATE INDEX IF NOT EXISTS idx_social_posts_status_scheduled
  ON public.social_posts(status, scheduled_at)
  WHERE status = 'scheduled';
CREATE INDEX IF NOT EXISTS idx_social_posts_scheduled_at
  ON public.social_posts(scheduled_at);
CREATE INDEX IF NOT EXISTS idx_social_posts_channel
  ON public.social_posts(channel);
CREATE INDEX IF NOT EXISTS idx_social_post_media_post
  ON public.social_post_media(post_id, sort_order);

-- ─── RLS ──────────────────────────────────────────────────────────────
ALTER TABLE public.social_accounts ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.social_posts ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.social_post_media ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Admin manage social_accounts" ON public.social_accounts;
CREATE POLICY "Admin manage social_accounts"
  ON public.social_accounts FOR ALL
  USING (is_admin_or_artist())
  WITH CHECK (is_admin_or_artist());

DROP POLICY IF EXISTS "Admin manage social_posts" ON public.social_posts;
CREATE POLICY "Admin manage social_posts"
  ON public.social_posts FOR ALL
  USING (is_admin_or_artist())
  WITH CHECK (is_admin_or_artist());

DROP POLICY IF EXISTS "Admin manage social_post_media" ON public.social_post_media;
CREATE POLICY "Admin manage social_post_media"
  ON public.social_post_media FOR ALL
  USING (is_admin_or_artist())
  WITH CHECK (is_admin_or_artist());
