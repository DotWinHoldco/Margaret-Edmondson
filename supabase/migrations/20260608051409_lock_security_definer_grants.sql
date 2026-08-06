-- A-7 / A-8 / A-18: Lock down over-granted SECURITY DEFINER functions.
--   * rls_auto_enable()        — DDL event-trigger fn, never RPC-callable. It is
--                                referenced by ZERO policies, so we revoke from
--                                PUBLIC (the default grant) to fully de-list it.
--   * record_order_for_contact — only the Stripe webhook (service_role) calls it.
--   * is_admin_or_artist()     — INTENTIONALLY left anon-callable. ~40 admin RLS
--                                policies are written `TO public USING(is_admin_or_artist())`
--                                (including SELECT on public pages: class_sessions,
--                                testimonials, artwork_funnels, bio_*). Postgres
--                                evaluates those policies for the anon role too, so
--                                anon must retain EXECUTE or every public read throws
--                                "permission denied for function". The fn returns
--                                false for anon, so this is harmless. Revoking would
--                                require rewriting all those policies to `TO authenticated`
--                                (large, risky) — DEFERRED. The advisor WARN remains.
-- Public flows stay granted (subscribe_to_newsletter, validate_promo_code_public,
-- track_cart, upsert_contact_to_list, mark_contact_unsubscribed, increment_funnel_metric)
-- and are intentionally NOT touched here.
-- Down (manual revert):
--   GRANT EXECUTE ON FUNCTION public.rls_auto_enable() TO PUBLIC;
--   GRANT EXECUTE ON FUNCTION public.record_order_for_contact(text, numeric, uuid, integer, uuid) TO anon, authenticated;

REVOKE EXECUTE ON FUNCTION public.rls_auto_enable() FROM PUBLIC, anon, authenticated;

REVOKE EXECUTE ON FUNCTION public.record_order_for_contact(text, numeric, uuid, integer, uuid) FROM anon, authenticated;
GRANT EXECUTE ON FUNCTION public.record_order_for_contact(text, numeric, uuid, integer, uuid) TO service_role;
