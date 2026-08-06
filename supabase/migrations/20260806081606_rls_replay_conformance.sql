-- Authored by DotWin
-- RLS replay conformance + anon cart write lockdown.
--
-- Context: the 2026-08-06 ledger reconciliation materialized the platform's
-- early migration history (create_core_schema and friends) into this
-- directory. Those early tables got row level security from the
-- rls_auto_enable event trigger and from raw hardening SQL, so the textual
-- migration set never says so. Production is correct; a from-zero replay of
-- the files would not be. This migration makes the text match reality:
--
-- 1. Explicit ENABLE ROW LEVEL SECURITY for every early table. Every
--    statement is a no-op in production (RLS is already enabled on all of
--    them, verified via pg_class.relrowsecurity on 2026-08-06) and makes a
--    from-zero replay converge on the same state.
-- 2. Textual drop of the April-era public commission INSERT policy that was
--    removed from production by raw hardening SQL long ago (verified absent
--    in pg_policies on 2026-08-06): the commission form writes through a
--    validated service-role route, not PostgREST.
-- 3. REAL CHANGE: drop the legacy anonymous cart write policies. Guest cart
--    traffic flows exclusively through the token-verified API routes and the
--    track_cart SECURITY DEFINER RPC (service role), so direct PostgREST
--    writes by anon were nothing but attack surface: "Anon insert carts" was
--    WITH CHECK (true), and "Anon update carts" let any anonymous caller
--    mutate ANY guest cart row (qual: profile_id IS NULL), which is exactly
--    the ownership hole the signed cart tokens closed at the API layer.
--    Authenticated self-access read/update policies are untouched.
--
-- Down (manual revert): re-create the two carts policies from
-- 20260806080923_carts_extend.sql if a direct-PostgREST cart path ever
-- returns (it should not; prefer the token routes).

-- 1. Textual RLS enables for the early-history tables (no-ops in prod).
alter table public.profiles enable row level security;
alter table public.categories enable row level security;
alter table public.products enable row level security;
alter table public.product_images enable row level security;
alter table public.product_variants enable row level security;
alter table public.orders enable row level security;
alter table public.order_items enable row level security;
alter table public.commissions enable row level security;
alter table public.commission_messages enable row level security;
alter table public.commission_milestones enable row level security;
alter table public.courses enable row level security;
alter table public.course_modules enable row level security;
alter table public.lessons enable row level security;
alter table public.enrollments enable row level security;
alter table public.lesson_progress enable row level security;
alter table public.lesson_comments enable row level security;
alter table public.blog_posts enable row level security;
alter table public.pages enable row level security;
alter table public.testimonials enable row level security;
alter table public.faqs enable row level security;
alter table public.newsletter_subscribers enable row level security;
alter table public.promo_codes enable row level security;
alter table public.webhook_logs enable row level security;
alter table public.site_content enable row level security;
alter table public.page_blocks enable row level security;
alter table public.change_requests enable row level security;
alter table public.email_templates enable row level security;
alter table public.email_sends enable row level security;
alter table public.carts enable row level security;
alter table public.meta_events enable row level security;
alter table public.audit_log enable row level security;

-- 2. Textual record of the historical hardening (no-op in prod).
drop policy if exists "anyone can create commission" on public.commissions;
drop policy if exists "Anyone can create commission" on public.commissions;

-- 3. Anon direct cart writes are closed for real.
drop policy if exists "Anon insert carts" on public.carts;
drop policy if exists "anon insert carts" on public.carts;
drop policy if exists "Anon update carts" on public.carts;
drop policy if exists "anon update carts" on public.carts;
