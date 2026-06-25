import { requireAdmin } from '@/lib/auth/require-admin'
import { timingSafeEqualStr } from '@/lib/auth/timing-safe'
import { revalidatePath } from 'next/cache'

/**
 * POST /api/admin/revalidate
 *
 * Forces an On-Demand revalidation of the public site. Revalidating the
 * root layout cascades to every public page; we also explicitly bust the
 * highest-traffic e-commerce paths so listing/detail pages refresh.
 *
 * Auth: admin session OR the CRON_SECRET bearer token (so it can be wired
 * into vercel.json as a scheduled cache warm/bust).
 */
const PUBLIC_PATHS = ['/', '/shop', '/gallery', '/blog', '/courses', '/about']

// POST /api/admin/revalidate — revalidate public page caches; admin session or CRON_SECRET.
export async function POST(request: Request) {
  const cronSecret = process.env.CRON_SECRET
  // Fail closed: a missing/empty secret must never authenticate a request.
  if (!cronSecret || cronSecret.length === 0) {
    console.error('CRON_SECRET is not set — refusing request (fail closed)')
    return Response.json({ error: 'Cron not configured' }, { status: 503 })
  }

  const authHeader = request.headers.get('authorization') ?? ''
  const isCron = timingSafeEqualStr(authHeader, `Bearer ${cronSecret}`)

  if (!isCron) {
    const auth = await requireAdmin()
    if (!auth.ok) return auth.response
  }

  try {
    // Cascade through the whole public tree via the root layout.
    revalidatePath('/', 'layout')
    // Belt-and-suspenders: explicitly bust key public paths.
    for (const path of PUBLIC_PATHS) {
      revalidatePath(path)
    }

    return Response.json({
      success: true,
      message: 'All pages revalidated',
      revalidated: PUBLIC_PATHS,
    })
  } catch {
    return Response.json(
      { error: 'Failed to revalidate cache.' },
      { status: 500 }
    )
  }
}
