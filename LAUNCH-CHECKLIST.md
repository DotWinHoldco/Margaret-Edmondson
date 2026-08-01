# ArtByME Go-Live Checklist (Simple Version)

Authored by DotWin · 2026-07-07

Follow this top to bottom. Don't skip steps. Each step says WHAT to do, WHERE to do it,
and WHAT YOU SHOULD SEE when it worked. Steps marked **[DotWin verifies]** get checked
against the live database/logs before you move on — say when you finish those steps.
The deep technical version of everything here: `audit/LAUNCH-NIGHT-2026-07-06.md`.

Already done, so you don't wonder: payment code is deployed and audited green, the
LumaPrints sandbox proved the order pipeline (Mirror Wrap fix, duplicate protection,
fractional sizes, signed URLs), the store is in Stripe TEST mode, and the whole site is
hidden behind the password gate until the very last step. Customers cannot see anything
until you finish Step 10.

---

## Step 1 — Push the newest fixes (your Mac, Terminal, 10 min)

The crop tool was changed to save PNG files (the printer rejects TIFF). That change is
on this computer but not on GitHub yet.

```bash
cd <the repo folder>
npm run build-check
```

You should see: **green / all gates pass**. If it fails, stop and say so.

```bash
git add -A
git commit -m "fix(crops): emit lossless PNG print masters (LumaPrints rejects TIFF); launch docs"
git push origin main
```

You should see: the push succeeds, and in about 2 minutes the Vercel dashboard shows a
new **Ready** production deployment.

## Step 2 — Check the settings dashboards (browser, 15 min)

Three websites to check. Just LOOK and confirm — don't change anything that's already right.

**A. Vercel → margaret-edmondson → Settings → Environment Variables.**
Every one of these must exist (Production):

- `STRIPE_SECRET_KEY` and `STRIPE_WEBHOOK_SECRET`
- `STRIPE_SECRET_KEY_TEST` and `STRIPE_WEBHOOK_SECRET_TEST`
- `NEXT_PUBLIC_STRIPE_PUBLISHABLE_KEY` and `NEXT_PUBLIC_STRIPE_PUBLISHABLE_KEY_TEST`
- `SUPABASE_SERVICE_ROLE_KEY`, `NEXT_PUBLIC_SUPABASE_URL`, `NEXT_PUBLIC_SUPABASE_ANON_KEY`
- `CRON_SECRET`
- `RESEND_API_KEY` and `EMAIL_FROM`
- `LUMAPRINTS_API_KEY`, `LUMAPRINTS_API_SECRET`, `LUMAPRINTS_STORE_ID` (the PRODUCTION ones)
- `NEXT_PUBLIC_SITE_URL` = `https://artbyme.studio`

Also: `LUMAPRINTS_BASE_URL` should NOT be set right now. We add it temporarily in Step 7.

**B. Stripe dashboard → Developers → Webhooks.**
There must be TWO endpoints, both pointing to
`https://artbyme.studio/api/webhooks/stripe`:

- One created in **Test mode** (toggle top-right of Stripe). Its signing secret must match
  `STRIPE_WEBHOOK_SECRET_TEST` in Vercel.
- One created in **Live mode**. Its signing secret must match `STRIPE_WEBHOOK_SECRET`.

Both should listen for: `checkout.session.completed`,
`checkout.session.async_payment_succeeded`, `checkout.session.async_payment_failed`,
`checkout.session.expired`, `payment_intent.succeeded`, `payment_intent.payment_failed`,
`charge.refunded`, `charge.dispute.created`. (Or "all events" — that works too.)

**C. LumaPrints dashboard (the REAL one, not sandbox) → Billing.**
A real, working credit card must be on file. You watched the sandbox park an order
forever when its fake card declined — the real store does the same thing if this card
ever dies. Margaret needs to know this card matters.

## Step 3 — Crop ONE artwork (browser + Mac, 10 min)

1. On your Mac, in the repo folder: `git pull` (gets the PNG fix from Step 1).
2. In the admin site: open any product → edit → set the crop box around the artwork.
   Crop exactly to the painting. No extra space. Save.
3. In Terminal: `node scripts/process-master-crop.mjs`
4. You should see it process one master and finish without errors.

**[DotWin verifies]** — the master shows "ready" with a `print/….png` file.

## Step 4 — Crop the other 38 (browser, 1–2 hours — the long part)

Go product by product and set every crop box. Music recommended. When all 39 are done,
run the worker once more on the Mac:

```bash
node scripts/process-master-crop.mjs
```

You should see it chew through all of them.

**[DotWin verifies]** — 39 of 39 masters print-ready.

## Step 5 — Build the print sizes (browser, ~1 hour)

For each product: edit → **Variants** tab →

1. Click **Generate S/M/L**. Three draft sizes appear, shaped exactly like your crop.
2. If a size was dropped, the message says why (too big for the scan / out of printable
   range / shape). For odd-shaped pieces, click **Add custom size** — it locks to the
   artwork's shape automatically and shows the live price.
3. Look at the price and margin columns. Adjust if something looks silly.
4. Flip each good size to **Live**. If the Live switch won't turn on, the banner tells
   you what's missing — fix that thing, don't force it.

**[DotWin verifies]** — live print variants exist, every one carries the Mirror Wrap
setting, prices are non-zero.

## Step 6 — Point orders at the practice printer (browser, 2 min)

In Vercel → Settings → Environment Variables → add:

- Name: `LUMAPRINTS_BASE_URL`
- Value: `https://us.api-sandbox.lumaprints.com`
- Environment: Production

Then **Redeploy** (Deployments → ⋯ on the newest one → Redeploy). This makes test orders
print NOWHERE REAL. We remove it in Step 10.

## Step 7 — Buy your own art with play money (browser, 20 min)

Do this TWICE — once through each payment path:

- **Buy #1:** add a print to the cart → Checkout → pay on the Stripe-hosted page.
- **Buy #2:** add a different print → use the on-site (embedded) payment form.

Card number both times: `4242 4242 4242 4242` — any future date, any CVC, any ZIP.
Use a real email you can read.

After each buy you should see: the order confirmation page, and a confirmation email
that mentions your new account.

**[DotWin verifies, live]** — for each order: order row correct, print specs frozen
correctly, account created, fulfillment job queued, submitted to the sandbox printer
with the right size, within ~2 minutes.

## Step 8 — Watch it "ship" (browser, 10 min)

In the LumaPrints SANDBOX dashboard, find the newest order and mark it shipped (or just
wait — the tracker checks every 30 minutes). You should get a shipping email with a
clickable tracking link.

**[DotWin verifies]** — order status rolled up to shipped.

## Step 9 — Try to break it (5 min)

- In the cart, quote shipping with an Alaska ZIP (`99501`) — a surcharge line appears.
- Log into your test-buyer account via **Forgot password** → set a password → you should
  see your orders at Account → Orders.

**[DotWin verifies]** — no error rows anywhere in the logs.

## Step 10 — GO LIVE (browser, 2 min — no Vercel needed anymore)

The password gate is now controlled from the admin, not env vars. Margaret's launch
modal (admin Dashboard) walks every prep step and ends in a GO LIVE button; the same
switch lives at **Admin → Settings → Site access** (gate on/off, password, cookie
duration). The API refuses to open the site until every launch prep step is checked.

1. Confirm the store is on REAL money (Settings → Stripe Mode shows Live). Done 2026-07-31.
2. Confirm `LUMAPRINTS_BASE_URL` is NOT set in Vercel (test orders were pointed at the
   practice printer once; it was removed 2026-08-01 — real orders go to the real printer).
3. Complete the launch modal steps, then press **GO LIVE** (or flip Settings → Site
   access → Password protection off).
4. Open `https://artbyme.studio` in a private/incognito window (no cookies): you should
   see the real store — no password page (allow ~30s for the switch to reach every
   visitor). Click an artwork: print sizes and prices show. Everything looks right.

Note: `SITE_PASSWORD` / `SITE_AUTH_SECRET` env vars are now only a fallback used if the
database is unreachable — deleting them is optional and no longer part of go-live.

**[DotWin verifies]** — live mode on, live Stripe key serving, gate gone, crons green.

## Step 11 — Hand Margaret the keys

- Show her `docs/product-setup-prints.md` — her guide for adding new artwork.
- Tell her the three things that matter:
  1. Every problem emails her. No news = everything's working.
  2. The LumaPrints credit card must stay valid — if it dies, prints quietly stop.
     (Weekly habit: the one-line check in the runbook, or just glance at the LumaPrints
     dashboard.)
  3. There's no "saved cards" feature for customers — they retype card info each order.
     Refunds: full refunds from her admin; partial refunds from the Stripe dashboard.

Done. The store is hers.
