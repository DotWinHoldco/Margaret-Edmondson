import { NextRequest } from 'next/server'
import { requireAdmin } from '@/lib/auth/require-admin'
import { apiError, apiFail, dbFail } from '@/lib/api/respond'
import { clearGateConfigCache } from '@/lib/gate/config'
import { missingPrepSteps } from '@/lib/launch/steps'

const SELECT = 'gate_enabled, gate_password, gate_secret, gate_cookie_hours, launch_checklist'

interface GateRow {
  gate_enabled: boolean | null
  gate_password: string | null
  gate_secret: string | null
  gate_cookie_hours: number | null
  launch_checklist: unknown
}

function randomSecretHex(): string {
  const bytes = new Uint8Array(32)
  crypto.getRandomValues(bytes)
  return Array.from(bytes)
    .map((b) => b.toString(16).padStart(2, '0'))
    .join('')
}

function shape(row: GateRow) {
  return {
    enabled: row.gate_enabled !== false,
    password: row.gate_password || '',
    cookieHours: row.gate_cookie_hours ?? 720,
    secretSet: Boolean(row.gate_secret),
    missingPrepSteps: missingPrepSteps(row.launch_checklist),
  }
}

// GET /api/admin/settings/gate — read the site password-gate config (enabled, password, cookie duration) plus launch readiness; admin only.
export async function GET() {
  try {
    const auth = await requireAdmin()
    if (!auth.ok) return auth.response

    const { data, error } = await auth.supabase
      .from('site_settings')
      .select(SELECT)
      .eq('id', true)
      .maybeSingle()
    if (error) return dbFail(error, 'admin/settings/gate GET')
    if (!data) return apiError('Site settings row missing.', 500, 'SETTINGS_MISSING')

    return Response.json(shape(data as GateRow))
  } catch (err) {
    return apiFail(err, { context: 'admin/settings/gate GET' })
  }
}

// PATCH /api/admin/settings/gate — turn the site gate on/off, change the gate password, or change the cookie duration; going live (enabled:false) requires every launch prep step to be complete; admin only.
export async function PATCH(request: NextRequest) {
  try {
    const auth = await requireAdmin()
    if (!auth.ok) return auth.response

    const body = (await request.json().catch(() => ({}))) as {
      enabled?: unknown
      password?: unknown
      cookieHours?: unknown
    }

    const { data: current, error: readError } = await auth.supabase
      .from('site_settings')
      .select(SELECT)
      .eq('id', true)
      .maybeSingle()
    if (readError) return dbFail(readError, 'admin/settings/gate read')
    if (!current) return apiError('Site settings row missing.', 500, 'SETTINGS_MISSING')
    const row = current as GateRow

    const updates: Record<string, unknown> = { updated_at: new Date().toISOString() }
    let goingLive = false

    if (body.enabled !== undefined) {
      if (typeof body.enabled !== 'boolean') {
        return apiError('enabled must be true or false.', 400, 'VALIDATION_FAILED')
      }
      if (body.enabled === false && row.gate_enabled !== false) {
        // Going live is deliberately blocked until the owner has worked
        // through every prep step in the launch sequence.
        const missing = missingPrepSteps(row.launch_checklist)
        if (missing.length > 0) {
          return Response.json(
            {
              error:
                'Finish the launch checklist first — every step must be marked complete before the site can go live.',
              code: 'LAUNCH_INCOMPLETE',
              missingPrepSteps: missing,
            },
            { status: 409 },
          )
        }
        goingLive = true
      }
      updates.gate_enabled = body.enabled
    }

    if (body.password !== undefined) {
      const pw = String(body.password ?? '').trim()
      if (pw.length < 6) {
        return apiError('The gate password must be at least 6 characters.', 400, 'VALIDATION_FAILED')
      }
      if (pw.length > 128) {
        return apiError('The gate password must be 128 characters or fewer.', 400, 'VALIDATION_FAILED')
      }
      updates.gate_password = pw
    }

    if (body.cookieHours !== undefined) {
      const hours = Number(body.cookieHours)
      if (!Number.isFinite(hours) || hours < 1 || hours > 8760) {
        return apiError('Cookie duration must be between 1 and 8760 hours.', 400, 'VALIDATION_FAILED')
      }
      updates.gate_cookie_hours = Math.round(hours)
    }

    if (Object.keys(updates).length === 1) {
      return apiError('Nothing to update.', 400, 'NO_CHANGES')
    }

    // Self-heal: if the gate is (or is being turned) on and no signing secret
    // exists in the DB or env, mint one so the cookie token can be computed.
    const willBeEnabled =
      updates.gate_enabled !== undefined ? updates.gate_enabled === true : row.gate_enabled !== false
    if (willBeEnabled && !row.gate_secret && !process.env.SITE_AUTH_SECRET) {
      updates.gate_secret = randomSecretHex()
    }

    if (goingLive) {
      // Record the moment in the launch checklist so the sequence shows done.
      const checklist =
        (row.launch_checklist && typeof row.launch_checklist === 'object'
          ? (row.launch_checklist as Record<string, unknown>)
          : {})
      updates.launch_checklist = {
        ...checklist,
        go_live: { done: true, at: new Date().toISOString() },
      }
    }

    const { data, error } = await auth.supabase
      .from('site_settings')
      .update(updates)
      .eq('id', true)
      .select(SELECT)
      .maybeSingle()
    if (error) return dbFail(error, 'admin/settings/gate PATCH')
    if (!data) return apiError('Site settings row missing.', 500, 'SETTINGS_MISSING')

    // Local-instance cache clear; other instances converge within the ~30s TTL.
    clearGateConfigCache()

    return Response.json({ ...shape(data as GateRow), wentLive: goingLive })
  } catch (err) {
    return apiFail(err, { context: 'admin/settings/gate PATCH' })
  }
}
