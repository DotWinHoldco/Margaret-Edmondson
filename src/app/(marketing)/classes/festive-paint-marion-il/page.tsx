import { illinoisClass } from '@/sites/margaret-edmondson/festive-class'
import { FestiveClassPage, festiveMetadata } from '@/sites/margaret-edmondson/FestiveClassPage'
export const dynamic = 'force-dynamic'
export const metadata = festiveMetadata(illinoisClass)
/** Southern Illinois class with its own reservation and price deadline. */
export default function Page() { return <FestiveClassPage event={illinoisClass} /> }
