import { NextRequest, NextResponse } from 'next/server';
import { rateLimit, rateLimitResponse } from '@/lib/api/rate-limit';
import { timingSafeEqualStr } from '@/lib/auth/timing-safe';
import { getGateConfig, gateToken } from '@/lib/gate/config';

const COOKIE_NAME = 'site-auth';

// POST /api/gate — verify the site-access password and set the access cookie; public.
// Config is DB-first (site_settings.gate_*) with env fallback, matching the
// middleware in src/proxy.ts, so an owner-changed password or cookie duration
// applies here without a deploy. When the gate is disabled this endpoint says
// so instead of validating against a dead password.
export async function POST(req: NextRequest) {
  const rl = await rateLimit(req, { limit: 5, windowMs: 300_000, keyPrefix: 'gate' });
  if (!rl.ok) return rateLimitResponse(rl);

  const cfg = await getGateConfig();
  if (!cfg.enabled) {
    // Site is public — nothing to unlock. 409 (not 200) so the gate page
    // doesn't loop setting cookies against a disabled gate.
    return NextResponse.json({ error: 'Site is not gated' }, { status: 409 });
  }
  if (!cfg.password || !cfg.secret) {
    return NextResponse.json({ error: 'Gate not configured' }, { status: 500 });
  }

  const { password: submitted } = (await req.json().catch(() => ({}))) as {
    password?: string;
  };
  if (!submitted || !timingSafeEqualStr(submitted, cfg.password)) {
    return NextResponse.json({ error: 'Invalid' }, { status: 401 });
  }

  const token = await gateToken(cfg.password, cfg.secret);
  const res = NextResponse.json({ ok: true });
  res.cookies.set(COOKIE_NAME, token, {
    httpOnly: true,
    secure: true,
    sameSite: 'lax',
    path: '/',
    maxAge: cfg.cookieHours * 3600,
  });
  return res;
}
