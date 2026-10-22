-- Authored by DotWin
-- Keep the artist's LinkedIn link editable alongside the other footer networks.
ALTER TABLE public.site_settings ADD COLUMN linkedin_url text;
COMMENT ON COLUMN public.site_settings.linkedin_url IS 'Public LinkedIn profile URL shown in the storefront footer; empty hides the icon.';

