@AGENTS.md

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
