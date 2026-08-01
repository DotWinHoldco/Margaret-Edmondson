import { NextRequest } from 'next/server'
import { requireAdmin } from '@/lib/auth/require-admin'
import { apiError, apiFail, dbFail } from '@/lib/api/respond'
import {
  isLaunchStepKey,
  missingPrepSteps,
  type LaunchChecklist,
} from '@/lib/launch/steps'

const SELECT = 'launch_checklist, launch_modal_hidden, gate_enabled, launch_notes'

interface LaunchRow {
  launch_checklist: LaunchChecklist | null
  launch_modal_hidden: boolean | null
  gate_enabled: boolean | null
  launch_notes: Record<string, string> | null
}

function shape(row: LaunchRow) {
  const missing = missingPrepSteps(row.launch_checklist)
  return {
    steps: row.launch_checklist || {},
    hidden: row.launch_modal_hidden === true,
    gateEnabled: row.gate_enabled !== false,
    // Owner-facing launch strings seeded operationally (print-partner login).
    // Served ONLY here, behind requireAdmin — never baked into client bundles.
    notes: row.launch_notes || {},
    missingPrepSteps: missing,
    readyToGoLive: missing.length === 0,
  }
}

// GET /api/admin/launch — read the owner launch-sequence state (steps, modal visibility, gate status, launch notes); admin only.
export async function GET() {
  try {
    const auth = await requireAdmin()
    if (!auth.ok) return auth.response

    const { data, error } = await auth.supabase
      .from('site_settings')
      .select(SELECT)
      .eq('id', true)
      .maybeSingle()
    if (error) return dbFail(error, 'admin/launch GET')
    if (!data) return apiError('Site settings row missing.', 500, 'SETTINGS_MISSING')

    return Response.json(shape(data as LaunchRow))
  } catch (err) {
    return apiFail(err, { context: 'admin/launch GET' })
  }
}

// PATCH /api/admin/launch — mark a launch step done/undone or hide/show the launch modal; admin only.
export async function PATCH(request: NextRequest) {
  try {
    const auth = await requireAdmin()
    if (!auth.ok) return auth.response

    const body = (await request.json().catch(() => ({}))) as {
      step?: unknown
      done?: unknown
      hidden?: unknown
    }

    const updates: Record<string, unknown> = { updated_at: new Date().toISOString() }
    let touched = false

    if (body.step !== undefined) {
      if (!isLaunchStepKey(body.step)) {
        return apiError('Unknown launch step.', 400, 'VALIDATION_FAILED')
      }
      if (typeof body.done !== 'boolean') {
        return apiError('done must be true or false.', 400, 'VALIDATION_FAILED')
      }
      const { data: current, error: readError } = await auth.supabase
        .from('site_settings')
        .select('launch_checklist')
        .eq('id', true)
        .maybeSingle()
      if (readError) return dbFail(readError, 'admin/launch PATCH read')
      const checklist = {
        ...((current?.launch_checklist as LaunchChecklist) || {}),
        [body.step]: { done: body.done, at: body.done ? new Date().toISOString() : null },
      }
      updates.launch_checklist = checklist
      touched = true
    }

    if (body.hidden !== undefined) {
      if (typeof body.hidden !== 'boolean') {
        return apiError('hidden must be true or false.', 400, 'VALIDATION_FAILED')
      }
      updates.launch_modal_hidden = body.hidden
      touched = true
    }

    if (!touched) return apiError('Nothing to update.', 400, 'NO_CHANGES')

    const { data, error } = await auth.supabase
      .from('site_settings')
      .update(updates)
      .eq('id', true)
      .select(SELECT)
      .maybeSingle()
    if (error) return dbFail(error, 'admin/launch PATCH')
    if (!data) return apiError('Site settings row missing.', 500, 'SETTINGS_MISSING')

    return Response.json(shape(data as LaunchRow))
  } catch (err) {
    return apiFail(err, { context: 'admin/launch PATCH' })
  }
}
