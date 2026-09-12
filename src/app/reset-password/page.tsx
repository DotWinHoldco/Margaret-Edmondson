import type { Metadata } from 'next'
import ResetPasswordForm from './ResetPasswordForm'

export const metadata: Metadata = {
  title: 'Set a new password | ArtByME',
  robots: { index: false, follow: false },
  referrer: 'no-referrer',
}

// Kept outside the storefront layout so maintenance and marketing popups
// cannot interrupt recovery. The form verifies the session with Supabase.
export default async function ResetPasswordPage({
  searchParams,
}: {
  searchParams: Promise<{ error?: string }>
}) {
  const { error } = await searchParams
  return <ResetPasswordForm invalidLink={Boolean(error)} />
}
