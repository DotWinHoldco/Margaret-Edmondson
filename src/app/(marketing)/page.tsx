import { getPageBlocks } from '@/lib/supabase/queries'
import BlockRenderer from '@/components/blocks/BlockRenderer'
import type { Metadata } from 'next'

export const metadata: Metadata = {
  title: 'ArtByMe — Mixed Media & Fine Art by Margaret Edmondson',
  description:
    'Original mixed-media collage art, oil paintings, fine art prints, and art classes by Margaret Edmondson. Commission custom artwork or shop the gallery.',
}

export default async function HomePage() {
  const blocks = await getPageBlocks('home')

  // If no blocks in DB yet, render default V1 layout with fallback config
  if (blocks.length === 0) {
    return <FallbackHomepage />
  }

  return (
    <>
      {blocks.map((block) => (
        <BlockRenderer
          key={block.id}
          type={block.block_type}
          config={block.config}
          variant="v1"
        />
      ))}
    </>
  )
}

function FallbackHomepage() {
  return (
    <>
      <BlockRenderer type="hero" config={{}} variant="v1" />
      <BlockRenderer type="featured_grid" config={{}} variant="v1" />
      <BlockRenderer type="about_preview" config={{}} variant="v1" />
      <BlockRenderer type="categories_showcase" config={{}} variant="v1" />
      <BlockRenderer type="cta_banner" config={{}} variant="v1" />
      <BlockRenderer type="class_preview" config={{}} variant="v1" />
      <BlockRenderer type="testimonials" config={{}} variant="v1" />
      <BlockRenderer type="newsletter" config={{}} variant="v1" />
    </>
  )
}
