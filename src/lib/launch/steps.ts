/** Each fulfillment path keeps its own preparation and rehearsal acknowledgements. */
export const LUMAPRINTS_PREP_STEPS = [
  'luma_login', 'luma_billing', 'crops', 'prices', 'margins',
  'luma_shipping', 'luma_workflow', 'stripe_account', 'luma_test_order', 'business_details',
] as const
export const STUDIO_PREP_STEPS = [
  'studio_partner', 'studio_shipping', 'studio_prices', 'studio_artwork',
  'studio_workflow', 'stripe_account', 'studio_test_order', 'business_details',
] as const
export const LAUNCH_STEPS = [...LUMAPRINTS_PREP_STEPS, ...STUDIO_PREP_STEPS, 'go_live'] as const
export type LaunchStepKey = (typeof LAUNCH_STEPS)[number]
export type LaunchPath = 'lumaprints' | 'studio'
export interface LaunchStepState { done: boolean; at: string | null }
export type LaunchChecklist = Partial<Record<LaunchStepKey, LaunchStepState>>
/** Validate checklist writes against the supported owner-decision keys. */
export function isLaunchStepKey(v: unknown): v is LaunchStepKey {
  return typeof v === 'string' && (LAUNCH_STEPS as readonly string[]).includes(v)
}
/** Choose requirements for the active fulfillment route. */
export function prepSteps(lumaprintsEnabled: boolean): readonly LaunchStepKey[] {
  return lumaprintsEnabled ? LUMAPRINTS_PREP_STEPS : STUDIO_PREP_STEPS
}
/** Legacy print acknowledgements never silently approve studio costs or shipping. */
export function missingPrepSteps(checklist: unknown, lumaprintsEnabled = true): LaunchStepKey[] {
  const map = (checklist && typeof checklist === 'object' ? checklist : {}) as Record<string, { done?: unknown } | undefined>
  return prepSteps(lumaprintsEnabled).filter(key => map[key]?.done !== true)
}
