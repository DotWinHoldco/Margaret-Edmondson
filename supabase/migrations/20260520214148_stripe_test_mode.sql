-- Stripe test-mode toggle for the singleton site_settings row.
--
-- When true (default), checkout + webhooks resolve the test keys
-- (STRIPE_SECRET_KEY_TEST / STRIPE_WEBHOOK_SECRET_TEST). When false,
-- they resolve the live keys (STRIPE_SECRET_KEY / STRIPE_WEBHOOK_SECRET).

alter table site_settings
  add column if not exists stripe_test_mode boolean not null default true;

-- Admin/artist session writes (sits alongside the existing
-- service_role-only write policy; PERMISSIVE policies OR).
drop policy if exists site_settings_admin_write on site_settings;
create policy site_settings_admin_write on site_settings
  for all
  to authenticated
  using (is_admin_or_artist())
  with check (is_admin_or_artist());
