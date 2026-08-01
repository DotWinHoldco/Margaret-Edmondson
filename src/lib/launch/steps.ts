/**
 * Owner launch-sequence step registry.
 *
 * Shared by the launch API (validation, go-live enforcement) and the admin
 * launch modal (rendering order). Step CONTENT lives in the client component;
 * only keys and ordering live here. The five PREP steps must all be done
 * before the gate can be turned off through /api/admin/settings/gate — the
 * go_live step is recorded automatically when the site actually goes public.
 */

export const LAUNCH_PREP_STEPS = [
  'luma_login',
  'luma_billing',
  'crops',
  'prices',
  'margins',
] as const

export const LAUNCH_STEPS = [...LAUNCH_PREP_STEPS, 'go_live'] as const

export type LaunchStepKey = (typeof LAUNCH_STEPS)[number]

export interface LaunchStepState {
  done: boolean
  at: string | null
}

export type LaunchChecklist = Partial<Record<LaunchStepKey, LaunchStepState>>

export function isLaunchStepKey(v: unknown): v is LaunchStepKey {
  return typeof v === 'string' && (LAUNCH_STEPS as readonly string[]).includes(v)
}

/** Which prep steps are still unfinished in a stored checklist blob. */
export function missingPrepSteps(checklist: unknown): string[] {
  const map = (checklist && typeof checklist === 'object' ? checklist : {}) as Record<
    string,
    { done?: unknown } | undefined
  >
  return LAUNCH_PREP_STEPS.filter((key) => map[key]?.done !== true)
}
