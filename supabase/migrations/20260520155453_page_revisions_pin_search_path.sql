-- Materialized verbatim from the production migration ledger
-- (supabase_migrations.schema_migrations) on 2026-08-06 for disaster-recovery
-- completeness.
--
-- This change was applied to the production project through the management API and
-- had no corresponding file in supabase/migrations/. The body below is the ledger
-- row's statements joined with a blank line, each terminated by a semicolon, and is
-- reproduced without modification.
--
-- Ledger version: 20260520155453
-- Ledger name:    page_revisions_pin_search_path

-- Pin search_path on the trim function so a malicious schema can not
-- shadow page_revisions or related objects. Recommended by Supabase
-- linter (0011_function_search_path_mutable).

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
      order by created_at desc
      limit 5
    );
  return new;
end;
$$;
