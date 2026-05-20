-- ─── Pages table extension ─────────────────────────────────────────
-- The unified /admin/pages editor needs is_published + hero_image_url
-- on top of the existing content_json / content_html / seo_description.
-- Legal pages (Privacy, Terms, Shipping, Commissions, Contact) get
-- seeded so the editor always has a row to update and public routes
-- can switch from hardcoded JSX to a DB read on first save.

alter table public.pages add column if not exists is_published boolean not null default true;
alter table public.pages add column if not exists hero_image_url text;
alter table public.pages add column if not exists page_kind text not null default 'custom'
  check (page_kind in ('custom', 'legal', 'commissions', 'contact', 'system'));

create index if not exists pages_kind_idx on public.pages (page_kind);

-- Seed system-managed content pages. content_json + content_html are
-- NOT NULL on the existing pages table, so we provide '{}'::jsonb and
-- ''. Public routes fall through to their hardcoded JSX when
-- content_html is empty, so seeding empty bodies is safe.
insert into public.pages
  (slug, title, content_html, content_json, seo_title, seo_description, page_kind, is_published, updated_at)
values
  ('privacy',         'Privacy Policy',   '', '{}'::jsonb, 'Privacy Policy',   'Privacy Policy for ArtByME',                'legal',       true, now()),
  ('terms',           'Terms of Service', '', '{}'::jsonb, 'Terms of Service', 'Terms of Service for ArtByME',              'legal',       true, now()),
  ('shipping-policy', 'Shipping Policy',  '', '{}'::jsonb, 'Shipping Policy',  'Shipping Policy for ArtByME',               'legal',       true, now()),
  ('commissions',     'Commissions',      '', '{}'::jsonb, 'Commissions',      'Commission a custom artwork from Margaret', 'commissions', true, now()),
  ('contact',         'Contact',          '', '{}'::jsonb, 'Contact',          'Get in touch with Margaret Edmondson',      'contact',     true, now())
on conflict (slug) do nothing;
