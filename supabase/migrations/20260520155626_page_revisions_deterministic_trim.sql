-- Materialized verbatim from the production migration ledger
-- (supabase_migrations.schema_migrations) on 2026-08-06 for disaster-recovery
-- completeness.
--
-- This change was applied to the production project through the management API and
-- had no corresponding file in supabase/migrations/. The body below is the ledger
-- row's statements joined with a blank line, each terminated by a semicolon, and is
-- reproduced without modification.
--
-- Ledger version: 20260520155626
-- Ledger name:    page_revisions_deterministic_trim

-- Two fixes for the trim trigger:
-- 1. Default created_at to clock_timestamp() so multiple inserts inside
--    a single transaction (e.g. the editor's save-then-recordRevision
--    pair) get distinct timestamps.
-- 2. Add id DESC as a secondary sort so ties never collapse to the
--    "wrong 5" — uuid v4 ids aren't time-ordered, but a stable
--    secondary sort still produces deterministic delete behavior.

alter table public.page_revisions
  alter column created_at set default clock_timestamp();

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
