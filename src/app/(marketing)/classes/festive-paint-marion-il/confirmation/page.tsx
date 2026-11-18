import type { Metadata } from 'next'
import { FestiveConfirmation } from '@/sites/margaret-edmondson/FestiveConfirmation'
import { illinoisClass } from '@/sites/margaret-edmondson/festive-class'
export const metadata: Metadata = { title: 'Your registration', robots: { index: false, follow: false }, referrer: 'no-referrer' }
/** Authored by DotWin. Private receipt reads webhook-confirmed state through a capability. */
export default function ConfirmationPage() { return <div><FestiveConfirmation event={illinoisClass} /></div> }
