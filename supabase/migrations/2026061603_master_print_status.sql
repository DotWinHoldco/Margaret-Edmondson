-- Master crop job status (Phase 1 of the variant/ordering rebuild). Additive +
-- idempotent — safe to re-run, no existing column dropped or renamed.
--
-- The crop endpoint (POST /api/admin/master-artworks/[id]/crop) writes the
-- normalized crop_box + border_mode/border_color (added in 2026061601) and sets
-- print_status='pending'. The operator-run worker (scripts/process-master-crop.mjs)
-- claims 'pending' rows -> 'processing' -> 'ready' (writing print_storage_path /
-- print_width_px / print_height_px / print_updated_at) or 'failed' (+ print_error).
-- The admin product editor polls print_status to show job progress. A queue table
-- is intentionally avoided (low volume; see the build plan, Appendix A).
--
-- DOWN (manual): drop columns print_status, print_requested_at, print_error.

alter table public.master_artworks
  add column if not exists print_status text not null default 'none',
  add column if not exists print_requested_at timestamptz,
  add column if not exists print_error text;

do $$ begin
  if not exists (select 1 from pg_constraint where conname = 'master_artworks_print_status_check') then
    alter table public.master_artworks
      add constraint master_artworks_print_status_check
      check (print_status in ('none','pending','processing','ready','failed'));
  end if;
end $$;
