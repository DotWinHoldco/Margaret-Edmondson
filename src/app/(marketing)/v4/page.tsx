import type { Metadata } from 'next'
import V4HomeClient from './V4HomeClient'

export const metadata: Metadata = {
  title: 'ArtByME — Kinetic Gallery',
  description:
    'A cinematic journey through Margaret Edmondson\u2019s mixed-media art. Oil paintings, collage, and fine art inspired by the beauty of everyday life.',
}

export default function V4HomePage() {
  return <V4HomeClient />
}
