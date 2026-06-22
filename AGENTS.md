<!-- BEGIN:nextjs-agent-rules -->
# This is NOT the Next.js you know

This version has breaking changes. APIs, conventions, and file structure may all differ from
your training data. Read the relevant guide in `node_modules/next/dist/docs/` before writing any
code. Heed deprecation notices.
<!-- END:nextjs-agent-rules -->

# Agent Guardrails

Authored by DotWin

This is Next.js 16. Before writing routing, data-fetching, or middleware code, confirm the real
API in `node_modules/next/dist`. Do not guess from memory.

## Next.js 16 gotchas that break builds

- `cookies()`, `headers()`, and `params` are async. Always `await` them. In dynamic routes,
  `params` is a `Promise`: `const { id } = await params;`.
- Middleware is renamed. It lives in `src/proxy.ts` and exports `proxy`, not `middleware.ts` /
  `middleware`. Do NOT create `src/middleware.ts`.
- Server Components are the default. Add `'use client'` only when you need interactivity.
- Turbopack is the default bundler. Some webpack-only config will not apply.

## Supabase

- Two client roles in this project: cookie/anon (`createClient`, request-scoped, RLS as the
  user) and service-role (`createServiceClient`, server-only, for webhooks, crons, and
  capability-token lookups).
- Never reach for the service-role client to dodge RLS. Add a policy or a SECURITY DEFINER RPC.
- `SUPABASE_SERVICE_ROLE_KEY` must be set in Vercel for the money path, crons, the
  order-confirmation page, and the pixel queue.

## Before you say it works

Run `npm run build-check`. "Green" is whatever the runner prints, not your judgment.
