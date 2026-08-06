import type { NextConfig } from "next";

const SECURITY_HEADERS = [
  // Force HTTPS for the apex + subdomains for a year, and let preload lists pick us up.
  { key: 'Strict-Transport-Security', value: 'max-age=63072000; includeSubDomains; preload' },
  // Never let the browser sniff a non-declared MIME (defeats some XSS via JSON-as-script tricks).
  { key: 'X-Content-Type-Options', value: 'nosniff' },
  // Block other origins from framing us → clickjacking defense.
  { key: 'X-Frame-Options', value: 'DENY' },
  // Don't leak the path of the previous page to other origins.
  { key: 'Referrer-Policy', value: 'strict-origin-when-cross-origin' },
  // Reduce the attack surface of third-party features the site doesn't use.
  { key: 'Permissions-Policy', value: 'camera=(), microphone=(), geolocation=(), payment=(self), interest-cohort=()' },
  // Cross-origin isolation hints.
  { key: 'Cross-Origin-Opener-Policy', value: 'same-origin' },
  { key: 'Cross-Origin-Resource-Policy', value: 'same-site' },
  // A-10: the Content-Security-Policy is NOT declared here. It carries a
  // per-request nonce, so it is built and attached in `src/proxy.ts` from
  // `src/lib/security/csp.ts`. A copy here would be frozen at deploy time and
  // the browser would intersect the two headers instead of replacing one.
];

// Canonical origin, used to replace the wildcard CORS value below. Falls back
// to the production domain so a build without the env var still emits a real
// origin rather than an empty header.
const SITE_ORIGIN = (process.env.NEXT_PUBLIC_SITE_URL || 'https://artbyme.studio').replace(/\/+$/, '');

// Documents and public files are served to the browser by the host's static
// file layer, which stamps `access-control-allow-origin: *` onto everything it
// serves. Nothing in this codebase sets that header, so it can only be undone
// by declaring a narrower value for the same header name. The site's own origin
// grants no cross-origin reader anything a same-origin request did not already
// have, and no `Access-Control-Allow-Credentials` is sent, so a cookie-bearing
// cross-origin read stays impossible.
//
// Two exclusions, both deliberate:
//   - `/_next/static` and `/_next/image`: the font and chunk requests Next
//     issues are CORS-mode fetches and need the permissive value.
//   - `/api`: every route handler here is same-origin-only, so it gets no CORS
//     headers at all rather than a narrower wildcard.
//
// The value is a constant, not an echo of the request's Origin, so no `Vary:
// Origin` is added, and adding one here would overwrite the RSC vary list
// Next.js relies on for router cache correctness.
const DOCUMENT_CORS_HEADERS = [
  { key: 'Access-Control-Allow-Origin', value: SITE_ORIGIN },
];

const nextConfig: NextConfig = {
  images: {
    formats: ['image/avif', 'image/webp'],
    // Hero/featured artwork intentionally requests 90; Next 16.3 requires
    // every non-default optimizer quality to be allow-listed.
    qualities: [75, 90],
    remotePatterns: [
      {
        protocol: 'https',
        hostname: '*.supabase.co',
        pathname: '/storage/v1/object/public/**',
      },
    ],
  },
  poweredByHeader: false,
  async redirects() {
    return [
      // "Sometime" was renamed to "Royal" — keep any old links working.
      { source: '/shop/art/sometime', destination: '/shop/art/royal', permanent: true },
    ];
  },
  async headers() {
    return [
      { source: '/:path*', headers: SECURITY_HEADERS },
      { source: '/((?!api|_next/static|_next/image).*)', headers: DOCUMENT_CORS_HEADERS },
    ];
  },
};

export default nextConfig;
