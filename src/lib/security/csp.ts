// Authored by DotWin
// Content Security Policy: the single source of truth for the site policy.
//
// The policy is assembled per request because `script-src` carries a fresh
// nonce for every document. `src/proxy.ts` puts the finished policy on both
// the forwarded request and the outgoing response:
//
//   - request  → Next.js reads the nonce back out of the `content-security-policy`
//                request header (see `getScriptNonceFromHeader` in the Next
//                runtime) and stamps it onto the framework runtime scripts, the
//                page bundles, its own inline scripts, and any `<Script nonce>`.
//   - response → the browser enforces it.
//
// This deliberately does NOT live in `next.config.ts`. A header declared there
// is fixed for the life of the deployment, so it cannot carry a per-request
// nonce, and a second `Content-Security-Policy` header would be intersected
// with this one by the browser rather than replacing it.

/**
 * Path of the violation collector. Relative on purpose: `report-uri` resolves
 * against the document URL, so the same policy works on every domain the site
 * answers on (apex, www, preview deployments) with no per-environment config.
 */
export const CSP_REPORT_PATH = '/api/csp-report'

/**
 * Group name shared by the `report-to` directive and the `Reporting-Endpoints`
 * response header. The two must agree or modern browsers drop the report.
 */
export const CSP_REPORT_GROUP = 'csp-endpoint'

// Script hosts. Stripe.js powers the embedded checkout; the Meta pixel
// bootstrap pulls fbevents.js from connect.facebook.net. `*.js.stripe.com` is
// on Stripe's published CSP list because Stripe.js starts frames on sibling
// origins where it can. (Under 'strict-dynamic' a CSP3 browser ignores these
// hosts and trusts the nonce chain instead, so they are the CSP2 fallback and
// the documented vendor contract rather than the live enforcement path.)
const SCRIPT_HOSTS = [
  'https://js.stripe.com',
  'https://*.js.stripe.com',
  'https://connect.facebook.net',
]

// Frame hosts. 'strict-dynamic' does not apply to frames, so unlike script-src
// this list is load-bearing for checkout:
//   js.stripe.com, *.js.stripe.com  Stripe Elements' own frames
//   hooks.stripe.com                the 3D Secure challenge window
//   link.com, *.link.com            Stripe Link, which Payment Element renders
//                                   whenever the account has Link enabled; the
//                                   checkout page passes no option disabling it
//   youtube / vimeo                 the lesson player's embeds
const FRAME_HOSTS = [
  'https://js.stripe.com',
  'https://*.js.stripe.com',
  'https://hooks.stripe.com',
  'https://link.com',
  'https://*.link.com',
  'https://www.youtube.com',
  'https://www.youtube-nocookie.com',
  'https://player.vimeo.com',
]

// Endpoints the page talks to with fetch/XHR/beacon. Beyond the obvious ones:
//   fonts.googleapis.com  the checkout passes `fonts: [{ cssSrc }]` to Elements,
//                         and Stripe fetches that stylesheet, so it has to be a
//                         connect-src source and not only a style-src one
//   link.com, *.link.com  Stripe Link's own calls, paired with the frames above
const CONNECT_HOSTS = [
  'https://api.stripe.com',
  'https://link.com',
  'https://*.link.com',
  'https://fonts.googleapis.com',
  'https://www.facebook.com',
  'https://*.resend.com',
]

// Supabase storage serves artwork, course video and testimonial media.
const SUPABASE_HOST = 'https://*.supabase.co'

/**
 * Generate a CSP nonce: 128 random bits, base64.
 *
 * Uses Web Crypto rather than `node:crypto` because the proxy runs in the edge
 * runtime. The alphabet is what Next.js accepts when it parses the nonce back
 * out of the request header (`[A-Za-z0-9+/_-]+={0,2}`).
 */
export function generateCspNonce(): string {
  const bytes = new Uint8Array(16)
  crypto.getRandomValues(bytes)
  let binary = ''
  for (const byte of bytes) binary += String.fromCharCode(byte)
  return btoa(binary)
}

/**
 * Build the policy for one request.
 *
 * `isDev` relaxes two things that only the dev server needs: React uses `eval`
 * to rebuild server stacks in the browser, and Turbopack's hot reloader opens a
 * websocket back to the dev server. Neither is used by a production build.
 */
export function buildContentSecurityPolicy(nonce: string, isDev: boolean): string {
  const scriptSrc = [
    // 'self' and the explicit hosts below are the fallback for browsers that
    // predate CSP Level 3: they ignore 'strict-dynamic' and use this list
    // instead. CSP3 browsers ignore them and trust the nonce chain.
    "'self'",
    `'nonce-${nonce}'`,
    // Scripts injected by an already-trusted script (Stripe.js loading its
    // inner frame, the pixel bootstrap loading fbevents.js) inherit trust,
    // so no third-party host has to be blanket-allowed.
    "'strict-dynamic'",
    ...SCRIPT_HOSTS,
    ...(isDev ? ["'unsafe-eval'"] : []),
  ]

  const directives = [
    `default-src 'self'`,
    `script-src ${scriptSrc.join(' ')}`,
    // Inline styles stay allowed. Tailwind 4 emits an inline critical-CSS
    // block and framer-motion animates by writing element.style on every
    // frame; both are inline styles that no nonce can cover, and CSS injection
    // is not the threat this policy is written against. Note that adding a
    // nonce to style-src would silently disable 'unsafe-inline' and break the
    // whole site, so this directive must stay nonce-free.
    `style-src 'self' 'unsafe-inline' https://fonts.googleapis.com`,
    `font-src 'self' https://fonts.gstatic.com`,
    `img-src 'self' data: blob: ${SUPABASE_HOST} https://www.facebook.com https://*.stripe.com https://*.link.com`,
    // Course lessons and testimonial clips are <video src> straight off
    // Supabase storage; blob: covers the admin upload previews.
    `media-src 'self' blob: ${SUPABASE_HOST}`,
    `connect-src 'self' ${SUPABASE_HOST} ${CONNECT_HOSTS.join(' ')}${isDev ? ' ws: wss:' : ''}`,
    `frame-src ${FRAME_HOSTS.join(' ')}`,
    `frame-ancestors 'none'`,
    `object-src 'none'`,
    `base-uri 'self'`,
    `form-action 'self'`,
    // report-uri is deprecated but is still the only reporting channel Safari
    // and Firefox implement; report-to is the modern replacement Chromium
    // uses. Shipping both means violations are collected everywhere.
    `report-uri ${CSP_REPORT_PATH}`,
    `report-to ${CSP_REPORT_GROUP}`,
  ]

  return directives.join('; ')
}

/**
 * Value for the `Reporting-Endpoints` response header, which is how a browser
 * resolves the `report-to` group named in the policy. Chromium ignores
 * `report-uri` whenever `report-to` is present, so without this header its
 * violations go nowhere.
 *
 * The URL is relative, and stays relative deliberately: the browser resolves it
 * against the document, which keeps reports same-origin (no CORS preflight on
 * the collector) and keeps the value independent of whatever host, port or
 * forwarded-proto headers sit in front of the app. Verified against Chromium:
 * a relative endpoint is resolved and delivered.
 */
export const CSP_REPORTING_ENDPOINTS = `${CSP_REPORT_GROUP}="${CSP_REPORT_PATH}"`

/**
 * Which header name to send.
 *
 * Enforcing is the default. Setting `CSP_REPORT_ONLY=true` in the environment
 * downgrades the same policy to report-only, which is the rollback path if a
 * third party ever ships a script that the policy does not anticipate: the
 * violation is still collected, but nothing is blocked. Next.js reads the nonce
 * out of either header name, so nonces keep working in both modes.
 */
export function cspHeaderName(): string {
  return process.env.CSP_REPORT_ONLY === 'true'
    ? 'Content-Security-Policy-Report-Only'
    : 'Content-Security-Policy'
}
