-- Materialized verbatim from the production migration ledger
-- (supabase_migrations.schema_migrations) on 2026-08-06 for disaster-recovery
-- completeness.
--
-- This change was applied to the production project through the management API and
-- had no corresponding file in supabase/migrations/. The body below is the ledger
-- row's statements joined with a blank line, each terminated by a semicolon, and is
-- reproduced without modification.
--
-- Ledger version: 20260421191257
-- Ledger name:    add_testimonial_image_url

alter table public.testimonials add column if not exists image_url text;
