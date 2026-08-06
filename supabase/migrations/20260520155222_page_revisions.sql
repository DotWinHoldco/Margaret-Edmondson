-- ─── Page Revisions ────────────────────────────────────────────────
-- Per-section snapshot history backing the "last 5 revisions / revert"
-- behavior of the unified /admin/pages editor. The server adapter
-- writes the previous value of a section into a snapshot row before
-- every save; the trigger trims to the 5 most recent per
-- (page_slug, section_key).
--
-- created_at defaults to clock_timestamp() (not now() / transaction_
-- timestamp()) so multiple inserts in the same transaction get
-- distinct timestamps. The trim trigger sorts by (created_at desc,
-- id desc) so ties are still deterministic.

create table if not exists public.page_revisions (
  id uuid primary key default gen_random_uuid(),
  page_slug text not null,
  section_key text not null,
  snapshot jsonb not null,
  edited_by uuid references public.profiles(id) on delete set null,
  created_at timestamptz not null default clock_timestamp()
);

create index if not exists page_revisions_lookup_idx
  on public.page_revisions (page_slug, section_key, created_at desc);

alter table public.page_revisions enable row level security;

drop policy if exists "Admins manage page_revisions" on public.page_revisions;
create policy "Admins manage page_revisions"
  on public.page_revisions for all
  to authenticated
  using (public.is_admin_or_artist())
  with check (public.is_admin_or_artist());

-- search_path pinned to '' so a malicious sibling schema can't shadow
-- page_revisions or related objects via the trigger.
create or replace function public.trim_page_revisions()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  delete from public.page_revisions
  where page_slug = new.page_slug
    and section_key = new.section_key
    and id not in (
      select id from public.page_revisions
      where page_slug = new.page_slug
        and section_key = new.section_key
      order by created_at desc, id desc
      limit 5
    );
  return new;
end;
$$;

drop trigger if exists page_revisions_trim on public.page_revisions;
create trigger page_revisions_trim after insert on public.page_revisions
  for each row execute function public.trim_page_revisions();
