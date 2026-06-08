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
  // A-10: CSP defense-in-depth. Shipped in Report-Only first so violations can
  // be reviewed before switching the header name to `Content-Security-Policy` to
  // enforce. 'unsafe-inline'/'unsafe-eval' are required for Next.js 16 App
  // Router until nonce-based CSP is wired.
  {
    key: 'Content-Security-Policy-Report-Only',
    value: [
      "default-src 'self'",
      "script-src 'self' 'unsafe-inline' 'unsafe-eval' https://js.stripe.com https://connect.facebook.net",
      "style-src 'self' 'unsafe-inline' https://fonts.googleapis.com",
      "font-src 'self' https://fonts.gstatic.com",
      "img-src 'self' data: blob: https://*.supabase.co https://www.facebook.com",
      "connect-src 'self' https://*.supabase.co https://api.stripe.com https://www.facebook.com https://*.resend.com",
      "frame-src https://js.stripe.com https://hooks.stripe.com",
      "frame-ancestors 'none'",
      "object-src 'none'",
      "base-uri 'self'",
      "form-action 'self'",
    ].join('; '),
  },
];

const nextConfig: NextConfig = {
  images: {
    formats: ['image/avif', 'image/webp'],
    remotePatterns: [
      {
        protocol: 'https',
        hostname: '*.supabase.co',
        pathname: '/storage/v1/object/public/**',
      },
    ],
  },
  poweredByHeader: false,
  async headers() {
    return [{ source: '/:path*', headers: SECURITY_HEADERS }];
  },
};

export default nextConfig;
