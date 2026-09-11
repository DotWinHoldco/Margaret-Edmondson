import type { LaunchChecklist, LaunchStepKey } from './steps'
import type { LaunchConnections } from './readiness'
export interface LaunchState {
  lumaprintsEnabled: boolean
  stripeTestMode: boolean
  steps: LaunchChecklist
  hidden: boolean
  gateEnabled: boolean
  notes: Record<string, string>
  updatedAt: string | null
  missingPrepSteps: LaunchStepKey[]
  connections: LaunchConnections
  blockers: { code: string; message: string }[]
  readyToGoLive: boolean
}
