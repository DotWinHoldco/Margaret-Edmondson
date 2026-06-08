@AGENTS.md

# 🔴 ACTIVE BUILD — read before writing code

The current end-to-end hardening & completion work is specified in **`audit/OVERNIGHT-PLAN.md`** (phased, executable — the source of truth for what to build and in what order). Supporting docs:
- Audit narrative & verdict: **`audit/AUDIT-REPORT.md`**
- Per-finding detail with `file:line` + copy-pasteable fixes: **`audit/findings/A-security.md` … `G-quality-build.md`** (referenced by finding ID throughout the plan)
- Schema / RLS / functions reference: **`audit/00-backend-reference.md`**

Operating rules for that build: work on `main` (no branches) with annotated `restore/*` tags; **never stop on a failed gate — fix forward and log it**; write integration/payment code env-guarded so it works once keys are added (don't skip a task for a missing key).

**Critical gotcha:** the Next.js 16 middleware is **`src/proxy.ts`** (Next renamed `middleware`→`proxy`). Do **NOT** create `src/middleware.ts`. Audit items A-1/A-2/A-5/F-1 ("no middleware / admin exposed") are **false positives** — ignore them.

# Project Reminders

## Dashboard Stats Strip
**IMPORTANT:** Every time you push changes that add/remove pages, API routes, funnels, or significant code, update the stats strip in `src/app/(admin)/admin/ProjectHubClient.tsx`. Search for `Public Pages` to find the stats array. Update the values to reflect the current counts:
- Public Pages: `find src/app/(marketing) -name "page.tsx" | wc -l`
- Admin Pages: `find src/app/(admin) -name "page.tsx" | wc -l`
- Sales Funnels: count from `artwork_funnels` table (currently 15)
- API Routes: `find src/app/api -name "route.ts" | wc -l`
- Lines of Code: `find src -name "*.tsx" -o -name "*.ts" | xargs wc -l | tail -1`

## Branding
- Always use "ArtByME" (capital M and E), never "ArtByMe" or "Artbyme"
- Artist name: Margaret Edmondson
- Artist photos must be SOLO photos of Margaret from `/public/Margaret Edmondson/Margaret Bio Photos/`
- Never fabricate biographical content — use real documents from `/public/Margaret Edmondson/Artist and Artwork Details/`

## Supabase
- Use `createClient` (not `createServiceClient`) for ALL admin pages and API routes — `SUPABASE_SERVICE_ROLE_KEY` is not set in Vercel
- `createServiceClient` should only be used in webhook handlers or cron jobs that don't have user sessions

## Artwork inventory

The canonical list of every original artwork lives in docs/artwork-inventory.md. Read this file before any of:
- Creating, editing, or listing products
- Building or modifying the variant configurator
- Wiring CV award-piece links to artwork pages
- Touching any artwork-detail page UI
- Generating SEO descriptions or metadata for artwork

If Margaret adds, sells, or reclassifies an artwork, update this file in the same PR.
