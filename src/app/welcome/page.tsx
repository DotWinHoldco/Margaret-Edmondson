import type { Metadata } from 'next'
import { redirect } from 'next/navigation'

export const metadata: Metadata = {
  title: 'Launch guide | ArtByME',
  robots: { index: false, follow: false },
}

/** Retire old welcome links into the current guide behind the admin role gate. */
export default function WelcomePage() {
  redirect('/admin')
}
