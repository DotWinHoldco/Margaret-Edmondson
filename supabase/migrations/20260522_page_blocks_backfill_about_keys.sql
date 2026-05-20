-- Backfill legacy about_split / about_preview config keys into the
-- names the current renderer + unified editor use. Only fills when
-- the new key is missing, so saved edits via the editor are never
-- clobbered.
--
-- Legacy → current:
--   body      → body_html
--   cta_text  → link_text
--   cta_link  → link_url
--
-- AboutSplitBlock also reads the legacy keys as fallbacks, so this
-- migration is belt-and-suspenders. Future homepage block rows that
-- never went through the editor still render correctly.

update public.page_blocks
set config = config
    || case when config ? 'body' and not (config ? 'body_html')
            then jsonb_build_object('body_html', config->>'body') else '{}'::jsonb end
    || case when config ? 'cta_text' and not (config ? 'link_text')
            then jsonb_build_object('link_text', config->>'cta_text') else '{}'::jsonb end
    || case when config ? 'cta_link' and not (config ? 'link_url')
            then jsonb_build_object('link_url', config->>'cta_link') else '{}'::jsonb end,
    updated_at = now()
where block_type in ('about_split', 'about_preview')
  and (
    (config ? 'body' and not (config ? 'body_html')) or
    (config ? 'cta_text' and not (config ? 'link_text')) or
    (config ? 'cta_link' and not (config ? 'link_url'))
  );
