import { NextRequest } from 'next/server'
import { requireAdmin } from '@/lib/auth/require-admin'
import { apiError, apiFail, dbFail } from '@/lib/api/respond'
import {
  isLaunchStepKey,
  missingPrepSteps,
  type LaunchChecklist,
} from '@/lib/launch/steps'
import { launchConnectionBlockers, readLaunchConnections } from '@/lib/launch/readiness'

const SELECT = 'lumaprints_enabled, stripe_test_mode, launch_checklist, launch_modal_hidden, gate_enabled, launch_notes, updated_at'

interface LaunchRow {
  lumaprints_enabled: boolean
  stripe_test_mode: boolean
  updated_at: string | null
  launch_checklist: LaunchChecklist | null
  launch_modal_hidden: boolean | null
  gate_enabled: boolean | null
  launch_notes: Record<string, string> | null
}

function shape(row: LaunchRow) {
  const missing = missingPrepSteps(row.launch_checklist, row.lumaprints_enabled)
  const connections = readLaunchConnections(process.env)
  const blockers = launchConnectionBlockers(connections, row.stripe_test_mode !== false, row.lumaprints_enabled)
  return {
    lumaprintsEnabled: row.lumaprints_enabled,
    stripeTestMode: row.stripe_test_mode !== false,
    updatedAt: row.updated_at,
    connections,
    blockers,
    steps: row.launch_checklist || {},
    hidden: row.launch_modal_hidden === true,
    gateEnabled: row.gate_enabled !== false,
    // Owner-facing launch strings seeded operationally (print-partner login).
    // Served ONLY here, behind requireAdmin — never baked into client bundles.
    notes: row.launch_notes || {},
    missingPrepSteps: missing,
    readyToGoLive: missing.length === 0 && blockers.length === 0,
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

// PATCH /api/admin/launch — merge owner decisions and private contact notes without overwriting concurrent settings; admin only.
export async function PATCH(request: NextRequest) {
  try {
    const auth = await requireAdmin()
    if (!auth.ok) return auth.response

    const body = (await request.json().catch(() => ({}))) as {
      step?: unknown
      done?: unknown
      hidden?: unknown
      notes?: unknown
      updatedAt?: unknown
    }

    const { data: current, error: readError } = await auth.supabase
      .from('site_settings').select(SELECT).eq('id', true).maybeSingle()
    if (readError) return dbFail(readError, 'admin/launch PATCH read')
    if (!current) return apiError('Site settings row missing.', 500, 'SETTINGS_MISSING')
    if (body.updatedAt !== undefined && body.updatedAt !== current.updated_at)
      return apiError('Setup changed in another window. Refresh the guide before saving.', 409, 'SETTINGS_CHANGED')

    const updates: Record<string, unknown> = { updated_at: new Date().toISOString() }
    let touched = false

    if (body.step !== undefined) {
      if (!isLaunchStepKey(body.step) || body.step === 'go_live') {
        return apiError('Unknown launch step.', 400, 'VALIDATION_FAILED')
      }
      if (typeof body.done !== 'boolean') {
        return apiError('done must be true or false.', 400, 'VALIDATION_FAILED')
      }
      const checklist = {
        ...((current?.launch_checklist as LaunchChecklist) || {}),
        [body.step]: { done: body.done, at: body.done ? new Date().toISOString() : null },
      }
      updates.launch_checklist = checklist
      touched = true
    }

    if (body.notes !== undefined) {
      if (!body.notes || typeof body.notes !== 'object' || Array.isArray(body.notes))
        return apiError('Enter valid contact details.', 400, 'VALIDATION_FAILED')
      const allowed = ['studio_contact_name', 'studio_contact_method', 'studio_arrangements']
      const notes = { ...(current.launch_notes as Record<string, string> || {}) }
      for (const [key, value] of Object.entries(body.notes)) {
        if (!allowed.includes(key) || typeof value !== 'string' || value.length > 4000)
          return apiError('Check your contact details; each field must be text under 4,000 characters.', 400, 'VALIDATION_FAILED')
        notes[key] = value.trim()
      }
      updates.launch_notes = notes
      touched = true
    }

    if (body.step === 'studio_partner' && body.done === true) {
      const notes = (updates.launch_notes || current.launch_notes || {}) as Record<string, string>
      if (!notes.studio_contact_name?.trim() || !notes.studio_contact_method?.trim() || !notes.studio_arrangements?.trim())
        return apiError('Save your contact, how you will reach them, and the agreed costs and turnaround first.', 400, 'VALIDATION_FAILED')
    }

    if (body.hidden !== undefined) {
      if (typeof body.hidden !== 'boolean') {
        return apiError('hidden must be true or false.', 400, 'VALIDATION_FAILED')
      }
      updates.launch_modal_hidden = body.hidden
      touched = true
    }

    if (!touched) return apiError('Nothing to update.', 400, 'NO_CHANGES')

    let update = auth.supabase
      .from('site_settings')
      .update(updates)
      .eq('id', true)
    update = current.updated_at === null ? update.is('updated_at', null) : update.eq('updated_at', current.updated_at)
    const { data, error } = await update
      .select(SELECT)
      .maybeSingle()
    if (error) return dbFail(error, 'admin/launch PATCH')
    if (!data) return apiError('Setup changed in another window. Refresh the guide before saving.', 409, 'SETTINGS_CHANGED')

    return Response.json(shape(data as LaunchRow))
  } catch (err) {
    return apiFail(err, { context: 'admin/launch PATCH' })
  }
}
