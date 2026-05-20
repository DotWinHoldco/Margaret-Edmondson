-- Per-medium Lumaprints config: subcategory_id, default option_ids,
-- size grid. Populated by /api/admin/lumaprints/sync which walks the
-- live Lumaprints catalog and name-matches each medium key.

create table if not exists lumaprints_mediums (
  medium text primary key,
  category_id integer,
  subcategory_id integer,
  name text,                            -- as reported by Lumaprints
  option_ids integer[] not null default '{}',
  sizes jsonb not null default '[]'::jsonb,
  enabled boolean not null default false,
  last_synced_at timestamptz,
  notes text
);

alter table lumaprints_mediums enable row level security;

drop policy if exists "Admins manage lumaprints_mediums" on lumaprints_mediums;
create policy "Admins manage lumaprints_mediums"
  on lumaprints_mediums for all
  to authenticated
  using (is_admin_or_artist())
  with check (is_admin_or_artist());

drop policy if exists "Public read lumaprints_mediums" on lumaprints_mediums;
create policy "Public read lumaprints_mediums"
  on lumaprints_mediums for select
  using (true);

-- Pre-seed canvas + framed_canvas with the values already proven in
-- production (so the sync isn't required for the existing two mediums).
insert into lumaprints_mediums (medium, subcategory_id, name, option_ids, sizes, enabled, last_synced_at)
values
  ('canvas', 101002, 'Canvas (1.25" stretched)', '{}'::int[], '[
    {"size_label":"8x10","width":8,"height":10},
    {"size_label":"11x14","width":11,"height":14},
    {"size_label":"12x16","width":12,"height":16},
    {"size_label":"16x20","width":16,"height":20},
    {"size_label":"18x24","width":18,"height":24},
    {"size_label":"24x30","width":24,"height":30},
    {"size_label":"24x36","width":24,"height":36},
    {"size_label":"30x40","width":30,"height":40}
  ]'::jsonb, true, now()),
  ('framed_canvas', 102002, 'Framed Canvas (1.25")', '{27}'::int[], '[
    {"size_label":"8x10","width":8,"height":10},
    {"size_label":"11x14","width":11,"height":14},
    {"size_label":"12x16","width":12,"height":16},
    {"size_label":"16x20","width":16,"height":20},
    {"size_label":"18x24","width":18,"height":24},
    {"size_label":"24x30","width":24,"height":30},
    {"size_label":"24x36","width":24,"height":36},
    {"size_label":"30x40","width":30,"height":40}
  ]'::jsonb, true, now())
on conflict (medium) do nothing;

-- Placeholder rows for the other six mediums so the sync has something to
-- update. enabled stays false until sync populates subcategory_id.
insert into lumaprints_mediums (medium, name, enabled)
values
  ('fine_art_paper', 'Fine Art Paper', false),
  ('framed_fine_art_paper', 'Framed Fine Art Paper', false),
  ('foam_mounted_fine_art_paper', 'Foam-Mounted Fine Art Paper', false),
  ('metal', 'Metal Print', false),
  ('peel_and_stick', 'Peel & Stick', false),
  ('rolled_canvas', 'Rolled Canvas', false)
on conflict (medium) do nothing;
