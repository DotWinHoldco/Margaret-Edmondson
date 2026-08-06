-- Gate control + launch checklist (owner go-live sequence).
--
-- Moves the pre-launch password gate from env-var-only (SITE_PASSWORD /
-- SITE_AUTH_SECRET, requiring a Vercel change to go live) to site_settings so
-- the studio owner can turn the gate off/on, change the password, and set the
-- cookie duration from /admin/settings. Env vars remain a fallback: when the
-- DB row is unreadable or the DB fields are null, the middleware falls back to
-- the env values, so a half-applied deploy can never strand the site.
--
-- gate_password / gate_secret are intentionally NOT seeded here: this file is
-- committed, and secrets never go in git. They are seeded operationally; until
-- then the env fallback keeps the current gate behavior byte-identical.
--
-- launch_checklist:   jsonb map of step_key -> {done: bool, at: timestamptz}
--                     for the owner launch modal. Going live (gate_enabled ->
--                     false via the admin API) requires the five preparation
--                     steps to be marked done.
-- launch_modal_hidden: the owner can hide the launch modal; a floating pill
--                     reopens it while the site is still gated.
-- launch_notes:       small jsonb blob of owner-facing launch strings that
--                     must not live in the repo (e.g. print-partner login),
--                     seeded operationally and served only via requireAdmin.

alter table site_settings
  add column if not exists gate_enabled boolean not null default true,
  add column if not exists gate_password text,
  add column if not exists gate_secret text,
  add column if not exists gate_cookie_hours integer not null default 720,
  add column if not exists launch_checklist jsonb not null default '{}'::jsonb,
  add column if not exists launch_modal_hidden boolean not null default false,
  add column if not exists launch_notes jsonb not null default '{}'::jsonb;

comment on column site_settings.gate_enabled is
  'Pre-launch password gate. true = site requires the gate password; false = public. Overrides SITE_PASSWORD/SITE_AUTH_SECRET env behavior.';
comment on column site_settings.gate_cookie_hours is
  'How long a successful gate login lasts, in hours (cookie max-age). Default 720 = 30 days.';
comment on column site_settings.launch_checklist is
  'Owner launch sequence: {step_key: {done, at}}. Steps 1-5 must be done before the gate can be turned off via the admin API.';
