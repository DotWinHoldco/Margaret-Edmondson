-- =============================================================================
-- Standalone security hardening.
--
-- Every statement here removes a permissive state that NO deployed code path
-- depends on, so it is safe to apply ahead of any deploy. Column revokes that
-- a running route still relies on live in the deploy-coupled migration.
--
-- Each item was proven against live state before being written: the escalation
-- was reproduced end to end (customer -> admin, is_admin_or_artist f -> t) and
-- rolled back, and each replacement predicate was checked against the rows and
-- call sites that exist today.
-- =============================================================================

-- ── S1. Privilege escalation through profiles.role, and order hijack through
-- profiles.email.
--
-- "Users can update own profile" is USING-only, so Postgres reuses USING as the
-- WITH CHECK. That pins `id` and nothing else. Combined with Supabase's default
-- table-level UPDATE grant to anon/authenticated, any registered customer could
-- issue one PostgREST call with the public anon key and set role='admin' --
-- is_admin_or_artist() reads exactly this column, so that unlocks every
-- "Admins can ..." policy in the schema. Self-service TOTP enrolment means
-- admin MFA does not stop it.
--
-- The same grant let a customer set profiles.email to a stranger's address.
-- resolveProfileId() in the Stripe webhook attaches a guest order to whichever
-- profile matches the buyer email, so that address change silently re-parents a
-- future victim order (shipping address, line items, totals) into the
-- attacker's /account/orders.
--
-- A column-level REVOKE would be a silent no-op: Postgres ignores column-level
-- revokes for a privilege that is also held at table level. Revoke UPDATE on
-- the table, then grant back only the self-service columns.
revoke update on public.profiles from anon, authenticated;
grant update (full_name, phone, avatar_url) on public.profiles to authenticated;

-- Defence in depth. The grant above is the control, but a future migration that
-- re-runs Supabase's default "grant all on all tables" would silently reopen
-- the hole. This trigger keeps the two privilege-bearing columns unwritable by
-- any caller that is not the service role, independently of the grant layer.
-- Deliberately NOT a policy WITH CHECK: pinning a column in RLS requires
-- selecting from profiles inside a policy on profiles, which raises 42P17
-- infinite recursion and would take sign-in down.
create or replace function public.profiles_guard_privileged_columns()
returns trigger
language plpgsql
set search_path = ''
as $fn$
begin
  -- Server-side callers (service client, migrations, dashboard) are trusted;
  -- they sit behind their own authorization gates.
  if current_user in ('postgres', 'supabase_admin', 'service_role') then
    return new;
  end if;
  if new.role is distinct from old.role then
    raise exception 'profiles.role is not self-writable' using errcode = '42501';
  end if;
  if new.email is distinct from old.email then
    raise exception 'profiles.email is not self-writable' using errcode = '42501';
  end if;
  return new;
end;
$fn$;

drop trigger if exists profiles_guard_privileged_columns on public.profiles;
create trigger profiles_guard_privileged_columns
  before update on public.profiles
  for each row
  execute function public.profiles_guard_privileged_columns();

-- ── S2. pages: "Public can read pages" was USING (true), so every unpublished
-- page body was readable by anon straight off /rest/v1/pages regardless of
-- is_published. pages_admin_read_all already covers the page-builder editor.
-- Verified: 0 rows currently have is_published <> true, so no rendered output
-- changes today.
drop policy if exists "Public can read pages" on public.pages;
create policy "Public can read published pages" on public.pages
  for select
  to public
  using (is_published is true);

-- ── S3. testimonials: the policy named "Public can read featured testimonials"
-- had the predicate USING (true) -- it never filtered on is_featured and never
-- filtered on status, so pending and archived testimonials (including AI-intake
-- rows created with status='pending') were readable by anon.
-- Verified against live data: 16 rows, all status='approved', and 0 rows are
-- featured with any other status, so nothing that renders today disappears.
-- testimonials_admin_read_all keeps the moderation queue visible to staff.
drop policy if exists "Public can read featured testimonials" on public.testimonials;
create policy "Public can read approved testimonials" on public.testimonials
  for select
  to public
  using (status = 'approved');

-- ── S4. course_modules: USING (true) exposed the module structure of draft and
-- archived courses. courses.status defaults to 'draft', so unreleased course
-- outlines were public. The public curriculum on /courses/[slug] only ever
-- renders modules of a published course, so this changes nothing visible.
-- The is_admin_or_artist() branch is stated explicitly rather than leaning on
-- courses_admin_read_all filtering the subquery.
drop policy if exists "Public can read course modules" on public.course_modules;
create policy "Public can read published course modules" on public.course_modules
  for select
  to public
  using (
    public.is_admin_or_artist()
    or exists (
      select 1 from public.courses c
      where c.id = course_modules.course_id
        and c.status = 'published'
    )
  );

-- ── S5. contact_lists: an anon SELECT policy with USING (true) published the
-- CRM list taxonomy (slugs, names, descriptions, is_system) to the internet.
-- No application path reads this table as anon: the public newsletter route
-- goes through subscribe_to_newsletter / upsert_contact_to_list, both SECURITY
-- DEFINER with EXECUTE granted to service_role only, and the unsubscribe route
-- reads crm_contacts rather than contact_lists.
drop policy if exists "Anon read contact_lists" on public.contact_lists;

-- ── S6. lesson_comments: USING (true) to public exposed every comment body and
-- its joined author profile to anon.
--
-- The GET path is unaffected: it already reads with the service client behind
-- an enrollment gate (documented at the call site). This policy only has to
-- admit the author's own INSERT ... RETURNING and staff.
--
-- The enrollment test goes through a SECURITY DEFINER helper rather than an
-- inline three-hop EXISTS, so the predicate does not silently change meaning
-- when the lessons policy is tightened in the deploy-coupled migration.
create or replace function public.has_active_enrollment_for_lesson(p_lesson_id uuid)
returns boolean
language sql
stable
security definer
set search_path = ''
as $fn$
  select exists (
    select 1
    from public.lessons l
    join public.course_modules m on m.id = l.module_id
    join public.enrollments e on e.course_id = m.course_id
    where l.id = p_lesson_id
      and e.profile_id = (select auth.uid())
      and e.status = 'active'
  );
$fn$;

revoke execute on function public.has_active_enrollment_for_lesson(uuid) from public;
-- Granted to authenticated only. The policies below are TO authenticated, so
-- anon never evaluates this expression and never needs EXECUTE on it.
grant execute on function public.has_active_enrollment_for_lesson(uuid) to authenticated;

drop policy if exists "Users can read lesson comments" on public.lesson_comments;
create policy "Enrolled users read lesson comments" on public.lesson_comments
  for select
  to authenticated
  using (
    public.is_admin_or_artist()
    or public.has_active_enrollment_for_lesson(lesson_id)
  );

-- The INSERT gate previously lived only in the route handler. Put the
-- entitlement in the predicate too, so a direct PostgREST call cannot post into
-- a course the caller never bought.
drop policy if exists "Users can create lesson comments" on public.lesson_comments;
create policy "Enrolled users create lesson comments" on public.lesson_comments
  for insert
  to authenticated
  with check (
    (select auth.uid()) = profile_id
    and (
      public.is_admin_or_artist()
      or public.has_active_enrollment_for_lesson(lesson_id)
    )
  );
