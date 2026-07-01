import type { Metadata } from 'next'
import V6HomeClient from './V6HomeClient'

export const metadata: Metadata = {
  title: 'ArtByME — Living Studio',
  description:
    'Step into the warm, vibrant studio of Margaret Edmondson. Mixed-media art, oil paintings, and creative energy inspired by the beauty of everyday life.',
}

export default function V6HomePage() {
  return <V6HomeClient />
}
