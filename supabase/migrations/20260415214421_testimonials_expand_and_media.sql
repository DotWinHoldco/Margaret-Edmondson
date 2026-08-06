-- Materialized verbatim from the production migration ledger
-- (supabase_migrations.schema_migrations) on 2026-08-06 for disaster-recovery
-- completeness.
--
-- This change was applied to the production project through the management API and
-- had no corresponding file in supabase/migrations/. The body below is the ledger
-- row's statements joined with a blank line, each terminated by a semicolon, and is
-- reproduced without modification.
--
-- Ledger version: 20260415214421
-- Ledger name:    testimonials_expand_and_media


-- Expand testimonials
ALTER TABLE public.testimonials
  ADD COLUMN IF NOT EXISTS title text,
  ADD COLUMN IF NOT EXISTS content text,
  ADD COLUMN IF NOT EXISTS source text,
  ADD COLUMN IF NOT EXISTS event_context text,
  ADD COLUMN IF NOT EXISTS date_received date,
  ADD COLUMN IF NOT EXISTS status text NOT NULL DEFAULT 'approved',
  ADD COLUMN IF NOT EXISTS updated_at timestamptz NOT NULL DEFAULT now();

-- Make quote nullable since content can replace it
ALTER TABLE public.testimonials ALTER COLUMN quote DROP NOT NULL;

-- Media attachments
CREATE TABLE IF NOT EXISTS public.testimonial_media (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  testimonial_id uuid NOT NULL REFERENCES public.testimonials(id) ON DELETE CASCADE,
  media_type text NOT NULL CHECK (media_type IN ('image','video','document')),
  url text NOT NULL,
  storage_path text NOT NULL,
  file_name text,
  mime_type text,
  size_bytes bigint,
  caption text,
  sort_order int NOT NULL DEFAULT 0,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS testimonial_media_testimonial_id_idx
  ON public.testimonial_media(testimonial_id);

ALTER TABLE public.testimonial_media ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Public read testimonial_media" ON public.testimonial_media;
CREATE POLICY "Public read testimonial_media"
  ON public.testimonial_media FOR SELECT
  USING (true);

DROP POLICY IF EXISTS "Authenticated write testimonial_media" ON public.testimonial_media;
CREATE POLICY "Authenticated write testimonial_media"
  ON public.testimonial_media FOR ALL
  TO authenticated
  USING (true) WITH CHECK (true);

-- Storage bucket
INSERT INTO storage.buckets (id, name, public)
VALUES ('testimonials','testimonials', true)
ON CONFLICT (id) DO UPDATE SET public = true;

DROP POLICY IF EXISTS "Public read testimonials bucket" ON storage.objects;
CREATE POLICY "Public read testimonials bucket"
  ON storage.objects FOR SELECT
  USING (bucket_id = 'testimonials');

DROP POLICY IF EXISTS "Auth write testimonials bucket" ON storage.objects;
CREATE POLICY "Auth write testimonials bucket"
  ON storage.objects FOR ALL
  TO authenticated
  USING (bucket_id = 'testimonials')
  WITH CHECK (bucket_id = 'testimonials');
