export const MEDIA_CATEGORIES = ['library', 'products', 'about', 'commissions', 'classes', 'testimonials'] as const
export type MediaCategory = (typeof MEDIA_CATEGORIES)[number]

export const MEDIA_CATEGORY_LABEL: Record<MediaCategory, string> = {
  library: 'Library',
  products: 'Products',
  about: 'About',
  commissions: 'Commissions',
  classes: 'Classes',
  testimonials: 'Testimonials',
}
