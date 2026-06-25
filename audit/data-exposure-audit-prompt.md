# Data-Exposure Adversarial Audit — Prompt

Authored by DotWin

Reusable adversarial prompt for auditing ArtByME (Margaret-Edmondson) for data
exposure. Targets are specific to this project's live surface. Re-confirm against
the live DB — base tables (`profiles`, `orders`, `order_items`, `carts`,
`products`, `promo_codes`), the gate fn `is_admin_or_artist()`, and the RPC bodies
live in the prod baseline, not necessarily in `supabase/migrations/`.

---

```text
Adversarially audit Margaret-Edmondson (ArtByME) for data exposure.

ENVIRONMENT YOU MUST ASSUME (and re-verify against the LIVE DB):
- Next.js 16 App Router. Middleware is src/proxy.ts and it does NOT guard /api/* —
  it only redirects unauth/non-admin users away from /account and /admin PAGE
  routes and applies the SITE_PASSWORD gate (skipped for /api/webhooks and
  /api/cron). ALL API authorization is per-route.
- src/lib/supabase/server.ts exports createClient() (cookie/anon, RLS-governed)
  and createServiceClient() (service-role, RLS-BYPASS / god-mode). No requireUser
  helper; user routes inline supabase.auth.getUser(). Guards: requireAdmin()
  (src/lib/auth/require-admin.ts), requireCron() (src/lib/auth/require-cron.ts).
- The realistic least-privileged attacker does NOT go through the Next.js routes
  (they carry rate limits + server-side massaging). It calls PostgREST directly
  with the publishable/anon key — POST $SUPABASE_URL/rest/v1/rpc/<fn> and
  GET $SUPABASE_URL/rest/v1/<table> — exercising only RLS + EXECUTE grants and
  bypassing all route logic. Probe at THAT layer.

1) ENUMERATE every store of sensitive data (confirm columns at the live DB):
   - PII: profiles (email, full_name, role), crm_contacts (email/phone/notes/tags/
     total_spent_cents), orders (email + shipping_address jsonb + stripe ids),
     carts (email + items), addresses, commissions (client_name/email/phone +
     reference_images), class_bookings (name/email/phone + pet_photo_urls),
     newsletter_subscribers, unsubscribe_events (email + ip + user_agent),
     email_campaign_recipients / email_automation_sends (email snapshots + Resend
     message ids), cv_settings.contact_email.
   - auth/credentials: social_accounts (OAuth tokens for social posting).
   - payment: orders, promo_codes, webhook_logs.
   - private content: order_items, wishlist_items, contact_list_members,
     promo_code_redemptions, master_artworks, commission_milestones, and lesson
     comments (commenter name/avatar of paying students).
   - secrets: env/config.

2) For EACH, trace every reachable path — RLS policies, table/column grants, views,
   RPCs / SECURITY DEFINER functions (check EXECUTE grants to anon/authenticated,
   NOT just RLS), API routes, storage buckets, env/config. There are NO Supabase
   edge functions; privileged logic is in ~130 route handlers under src/app/api.
   Attack this known surface first:
   - anon-EXECUTE SECURITY DEFINER RPCs: upsert_contact_to_list,
     validate_promo_code_public, mark_contact_unsubscribed, subscribe_to_newsletter,
     track_cart, book_class_session, increment_funnel_metric, reprice_variants.
   - USING(true) / no-TO-clause policies: site_settings.site_settings_read,
     cv_settings."Public can read cv_settings",
     cv_entries."Public can read published cv_entries",
     lumaprints_mediums."Public read lumaprints_mediums", and the public
     storage.objects read policies (library, about-images, product-images,
     testimonials).
   - broad authenticated read: promo_codes."Authenticated can read promo_codes"
     (USING auth.role()='authenticated').
   - RLS gaps to confirm: product_categories, promo_codes, audit_log,
     commission_milestones, meta_events, webhook_logs.
   - service-client (RLS-bypass) routes that are PUBLIC (guard=NONE): /api/checkout,
     /api/checkout/intent, /api/commissions, /api/pixel/event, and especially
     /api/lessons/[id]/comments GET (service client, NO auth, NO enrollment check).
   - storage buckets: private (must stay private) — print-masters,
     commission-references, class-pet-photos, shared-files; public — product-images,
     testimonials, library, about-images.
   - webhook secret transport: /api/webhooks/shipstation takes its secret as a URL
     query param (?secret=) — check for leakage via access logs / referrer / proxy.

3) Then ACTUALLY call/read each path as the least-privileged caller: first
   anonymous (anon key against PostgREST, or SET LOCAL ROLE anon), then a logged-in
   non-owner (a self-registered role='customer' JWT), passing a REAL victim's id, in
   a ROLLED-BACK transaction so nothing commits. For write RPCs, also exercise the
   IDOR/tamper axis.

4) Report what each role ACTUALLY obtained — quote the leaked rows / returned ids /
   mutated state — NOT what the schema implies. Separate read-exposure from
   write-tamper.

5) Treat any USING(true)/permissive policy, broad grant, public bucket, or
   SECURITY DEFINER object over a sensitive payload as GUILTY UNTIL PROVEN SCOPED.

6) For the SECURITY DEFINER functions, verify each derives identity from auth.uid()
   and does NOT trust a caller-supplied identity/authority parameter:
   - mark_contact_unsubscribed(p_contact_id, …, p_ip, p_user_agent) — any authz?
   - upsert_contact_to_list(p_email, …, p_tags) — does it return a victim's id?
   - validate_promo_code_public(p_code, p_email, p_cart_id, …) — identity from param?
   - subscribe_to_newsletter(p_email, …) — does it return a contact_id + promo code?
   - track_cart(p_cart_id, p_email, p_items, …) — IDOR write to any cart?
   - book_class_session / increment_funnel_metric — write-only? whitelist on metric?
   - reprice_variants — anon-executable? SET search_path pinned?
   - is_admin_or_artist() — body derives from auth.uid() with no coercible param?
```
