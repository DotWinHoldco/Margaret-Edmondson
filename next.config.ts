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
