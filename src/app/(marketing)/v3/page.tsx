import type { Metadata } from 'next'
import V3HomeClient from './V3HomeClient'

export const metadata: Metadata = {
  title: 'ArtByME — Immersive Collage',
  description:
    'Step into the layered, textured world of Margaret Edmondson. Mixed-media collage, oil paintings, and found-material art that lives and breathes.',
}

export default function V3HomePage() {
  return <V3HomeClient />
}
