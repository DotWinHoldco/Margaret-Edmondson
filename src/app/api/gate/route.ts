import { NextRequest, NextResponse } from 'next/server';
import { rateLimit, rateLimitResponse } from '@/lib/api/rate-limit';

const COOKIE_NAME = 'site-auth';
const MAX_AGE = 60 * 60 * 24 * 30;

async function sha256Hex(input: string) {
  const data = new TextEncoder().encode(input);
  const digest = await crypto.subtle.digest('SHA-256', data);
  return Array.from(new Uint8Array(digest))
    .map((b) => b.toString(16).padStart(2, '0'))
    .join('');
}

// POST /api/gate — verify the site-access password and set the access cookie; public.
export async function POST(req: NextRequest) {
  const rl = rateLimit(req, { limit: 5, windowMs: 300_000, keyPrefix: 'gate' });
  if (!rl.ok) return rateLimitResponse(rl);

  const password = process.env.SITE_PASSWORD;
  const secret = process.env.SITE_AUTH_SECRET;
  if (!password || !secret) {
    return NextResponse.json({ error: 'Gate not configured' }, { status: 500 });
  }

  const { password: submitted } = (await req.json().catch(() => ({}))) as {
    password?: string;
  };
  if (!submitted || submitted !== password) {
    return NextResponse.json({ error: 'Invalid' }, { status: 401 });
  }

  const token = await sha256Hex(password + secret);
  const res = NextResponse.json({ ok: true });
  res.cookies.set(COOKIE_NAME, token, {
    httpOnly: true,
    secure: true,
    sameSite: 'lax',
    path: '/',
    maxAge: MAX_AGE,
  });
  return res;
}
