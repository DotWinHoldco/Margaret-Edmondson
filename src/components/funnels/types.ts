export interface FunnelData {
  id: string
  slug: string
  template: string
  problem_heading: string | null
  problem_body: string | null
  amplify_heading: string | null
  amplify_body: string | null
  story_heading: string | null
  story_body_html: string | null
  transformation_heading: string | null
  transformation_body: string | null
  offer_heading: string | null
  offer_original_description: string | null
  offer_print_description: string | null
  risk_reversal_heading: string | null
  risk_reversal_body: string | null
  final_cta_text: string | null
}

export interface ProductData {
  id: string
  title: string
  slug: string
  description_html: string | null
  story_html: string | null
  medium: string | null
  dimensions: string | null
  base_price: number
  is_original: boolean
  prints_enabled: boolean
}

export interface ImageData {
  id: string
  url: string
  alt_text: string | null
}

export interface VariantData {
  id: string
  name: string
  price: number
  variant_type: string
  inventory_count: number
  // Print-availability gates — mirror the storefront ProductDetail so a funnel
  // never offers a print that would fail at LumaPrints. Draft variants are
  // is_active false; is_lumaprints_available false means the size is disabled.
  is_active?: boolean
  is_lumaprints_available?: boolean
  medium?: string | null
}

export interface FunnelTemplateProps {
  funnel: FunnelData
  product: ProductData
  images: ImageData[]
  variants: VariantData[]
  // True only when the product's print master is 'ready' with a stored file.
  // Print variants are suppressed unless this is true (LumaPrints belt-and-suspenders).
  masterReady: boolean
}
