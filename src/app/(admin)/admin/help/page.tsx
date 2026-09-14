import type { Metadata } from 'next'
import HelpIndex from './HelpIndex'

export const metadata: Metadata = { title: 'Help & Guides | ArtByME', robots: { index: false, follow: false } }

export default function HelpPage() {
  return <HelpIndex />
}
