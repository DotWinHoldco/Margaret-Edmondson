import { festiveClass } from '@/sites/margaret-edmondson/festive-class'
import { FestiveClassPage, festiveMetadata } from '@/sites/margaret-edmondson/FestiveClassPage'
export const dynamic = 'force-dynamic'
export const metadata = festiveMetadata(festiveClass)
/** North Texas class, preserving its existing public URL. */
export default function Page() { return <FestiveClassPage event={festiveClass} /> }
