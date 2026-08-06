import { redirect } from 'next/navigation'
import type { Metadata } from 'next'
import {
  decideAdminAccess,
  mfaFlowPath,
} from '@/lib/auth/mfa-policy'
import {
  requireAdminForMfaFlow,
  resolveMfaReturnPath,
} from '@/lib/auth/admin-page-guard'
import EnrollTotpClient from './EnrollTotpClient'

export const dynamic = 'force-dynamic'

export const metadata: Metadata = {
  title: 'Set up two-factor authentication',
}

/**
 * Two-factor enrolment for the admin surface.
 *
 * Reachable only by an authenticated admin, and only while that admin actually
 * needs a factor: the shared matrix decides. An admin who already has one is
 * sent to the step-up screen, and one whose session is already verified is
 * returned to the page they were heading for, so a stale bookmark can never
 * start a second enrolment.
 */
export default async function AdminMfaEnrollPage({
  searchParams,
}: {
  searchParams: Promise<{ next?: string | string[] }>
}) {
  const { next } = await searchParams
  const returnTo = resolveMfaReturnPath(next)
  const session = await requireAdminForMfaFlow()

  const decision = decideAdminAccess({
    isAdmin: true,
    aal: session.mfa.aal,
    hasVerifiedTotpFactor: session.mfa.hasVerifiedTotpFactor,
  })
  if (decision === 'allow') redirect(returnTo)
  if (decision === 'challenge') redirect(mfaFlowPath('challenge', returnTo))

  return (
    <EnrollTotpClient
      returnTo={returnTo}
      accountEmail={session.user.email ?? ''}
    />
  )
}
