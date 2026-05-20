-- ─── Page Revisions ────────────────────────────────────────────────
-- Per-section snapshot history backing the "last 5 revisions / revert"
-- behavior of the unified /admin/pages editor. The server adapter
-- writes the previous value of a section into a snapshot row before
-- every save; the trigger trims to the 5 most recent per
-- (page_slug, section_key).

create table if not exists page_revisions (
  id uuid primary key default gen_random_uuid(),
  page_slug text not null,
  section_key text not null,
  snapshot jsonb not null,
  edited_by uuid references profiles(id) on delete set null,
  created_at timestamptz not null default now()
);

create index if not exists page_revisions_lookup_idx
  on page_revisions (page_slug, section_key, created_at desc);

alter table page_revisions enable row level security;

drop policy if exists "Admins manage page_revisions" on page_revisions;
create policy "Admins manage page_revisions"
  on page_revisions for all
  to authenticated
  using (is_admin_or_artist())
  with check (is_admin_or_artist());

create or replace function trim_page_revisions()
returns trigger as $$
begin
  delete from page_revisions
  where page_slug = new.page_slug
    and section_key = new.section_key
    and id not in (
      select id from page_revisions
      where page_slug = new.page_slug
        and section_key = new.section_key
      order by created_at desc
      limit 5
    );
  return new;
end;
$$ language plpgsql;

drop trigger if exists page_revisions_trim on page_revisions;
create trigger page_revisions_trim after insert on page_revisions
  for each row execute function trim_page_revisions();
