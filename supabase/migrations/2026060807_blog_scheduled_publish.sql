-- C/D 3.4: scheduled blog publishing. Posts with status='scheduled' and a due
-- publish_at are flipped to 'published' by /api/cron/publish-scheduled.
-- status is a free-text column, so 'scheduled'/'archived' need no enum DDL.
-- Down (manual revert):
--   DROP INDEX IF EXISTS public.blog_posts_scheduled_idx;
--   ALTER TABLE public.blog_posts DROP COLUMN IF EXISTS publish_at;

ALTER TABLE public.blog_posts ADD COLUMN IF NOT EXISTS publish_at TIMESTAMPTZ;

CREATE INDEX IF NOT EXISTS blog_posts_scheduled_idx
  ON public.blog_posts (status, publish_at)
  WHERE status = 'scheduled';
