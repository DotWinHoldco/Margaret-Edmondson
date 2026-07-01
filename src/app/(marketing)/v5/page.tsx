import type { Metadata } from 'next'
import V5HomeClient from './V5HomeClient'

export const metadata: Metadata = {
  title: 'ArtByME — Editorial Canvas',
  description:
    'Margaret Edmondson: mixed-media fine art, oil paintings, and collage. An editorial journey through color, texture, and the beauty of everyday life.',
}

export default function V5HomePage() {
  return <V5HomeClient />
}
