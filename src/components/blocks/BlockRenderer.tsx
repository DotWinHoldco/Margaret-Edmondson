import type { Json } from '@/lib/types/database'
import HeroBlock from './HeroBlock'
import FeaturedGridBlock from './FeaturedGridBlock'
import AboutSplitBlock from './AboutSplitBlock'
import TestimonialsBlock from './TestimonialsBlock'
import CTABannerBlock from './CTABannerBlock'
import ClassPreviewBlock from './ClassPreviewBlock'
import NewsletterBlock from './NewsletterBlock'
import CategoriesShowcaseBlock from './CategoriesShowcaseBlock'

interface BlockProps {
  type: string
  config: Json
  variant?: 'v1' | 'v2' | 'v3'
}

const BLOCK_MAP: Record<string, React.ComponentType<{ config: Record<string, unknown>; variant?: string }>> = {
  hero: HeroBlock,
  featured_grid: FeaturedGridBlock,
  about_split: AboutSplitBlock,
  about_preview: AboutSplitBlock,
  testimonials: TestimonialsBlock,
  cta_banner: CTABannerBlock,
  class_preview: ClassPreviewBlock,
  newsletter: NewsletterBlock,
  categories_showcase: CategoriesShowcaseBlock,
}

export default function BlockRenderer({ type, config, variant = 'v1' }: BlockProps) {
  const Component = BLOCK_MAP[type]
  if (!Component) return null

  return <Component config={config as Record<string, unknown>} variant={variant} />
}
