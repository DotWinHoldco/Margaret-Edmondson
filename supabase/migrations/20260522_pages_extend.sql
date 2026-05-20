-- ─── Pages table extension ─────────────────────────────────────────
-- The unified /admin/pages editor needs is_published + hero_image_url
-- on top of the existing content_json / content_html / seo_description.
-- Legal pages (Privacy, Terms, Shipping, Commissions) get seeded so
-- their public routes can switch from hardcoded JSX to a DB read.

alter table pages add column if not exists is_published boolean not null default true;
alter table pages add column if not exists hero_image_url text;
alter table pages add column if not exists page_kind text not null default 'custom'
  check (page_kind in ('custom', 'legal', 'commissions', 'contact', 'system'));

create index if not exists pages_kind_idx on pages (page_kind);

-- Seed system-managed content pages so the editor has rows to bind to.
-- body content stays empty here — the Phase 4 build will extract the
-- current hardcoded JSX into these rows.
insert into pages (slug, title, content_html, seo_title, seo_description, page_kind, is_published, updated_at)
values
  ('privacy',         'Privacy Policy',     '', 'Privacy Policy',     'Privacy Policy for ArtByME',                'legal',       true, now()),
  ('terms',           'Terms of Service',   '', 'Terms of Service',   'Terms of Service for ArtByME',              'legal',       true, now()),
  ('shipping-policy', 'Shipping Policy',    '', 'Shipping Policy',    'Shipping Policy for ArtByME',               'legal',       true, now()),
  ('commissions',     'Commissions',        '', 'Commissions',        'Commission a custom artwork from Margaret', 'commissions', true, now())
on conflict (slug) do nothing;
