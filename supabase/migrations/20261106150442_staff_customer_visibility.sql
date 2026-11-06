-- Authored by DotWin
-- The owner portal must see customer profiles linked to its orders. Keep customer
-- self-access intact and grant staff read access only, anchored to their auth uid.
create policy "Staff can read customer profiles" on public.profiles
  for select to authenticated
  using ((select public.is_admin_or_artist()));
