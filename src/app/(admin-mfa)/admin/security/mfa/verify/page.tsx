import { redirect } from 'next/navigation'
import type { Metadata } from 'next'
import { decideAdminAccess, mfaFlowPath } from '@/lib/auth/mfa-policy'
import {
  requireAdminForMfaFlow,
  resolveMfaReturnPath,
} from '@/lib/auth/admin-page-guard'
import VerifyTotpClient from './VerifyTotpClient'

export const dynamic = 'force-dynamic'

export const metadata: Metadata = {
  title: 'Two-factor verification',
}

/**
 * Step-up screen: raises an authenticated admin's aal1 password session to
 * aal2 by verifying a code from their registered authenticator.
 *
 * The shared matrix decides who belongs here. An admin with no factor yet is
 * sent to enrolment instead, and an already-verified session is returned to
 * the page it was heading for rather than being asked for a code it does not
 * owe.
 */
export default async function AdminMfaVerifyPage({
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
  if (decision === 'enroll') redirect(mfaFlowPath('enroll', returnTo))

  return (
    <VerifyTotpClient
      returnTo={returnTo}
      accountEmail={session.user.email ?? ''}
    />
  )
}
