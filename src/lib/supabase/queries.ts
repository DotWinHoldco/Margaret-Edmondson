import { createClient } from './server'
import { loadPublicPrintReadiness, storefrontMaster } from '@/lib/products/print-readiness'

export async function getPageContent(page: string, section?: string) {
  const supabase = await createClient()
  let query = supabase
    .from('site_content')
    .select('id, page, section, content_key, content_value, content_type, is_active, updated_at, updated_by')
    .eq('page', page)
    .eq('is_active', true)

  if (section) {
    query = query.eq('section', section)
  }

  const { data } = await query

  if (!data) return {}

  return data.reduce(
    (acc, item) => {
      if (!acc[item.section]) acc[item.section] = {}
      acc[item.section][item.content_key] = item.content_value
      return acc
    },
    {} as Record<string, Record<string, string>>
  )
}

export async function getSectionContent(page: string, section: string) {
  const content = await getPageContent(page, section)
  return content[section] || {}
}

export async function getPageBlocks(page: string) {
  const supabase = await createClient()
  const { data } = await supabase
    .from('page_blocks')
    .select('id, page, block_type, sort_order, is_visible, config, created_at, updated_at')
    .eq('page', page)
    .eq('is_visible', true)
    .order('sort_order', { ascending: true })

  return data || []
}

export async function getFeaturedProducts(limit = 4) {
  const supabase = await createClient()
  const { data } = await supabase
    .from('products')
    .select('*, product_images(*)')
    .eq('is_featured', true)
    .eq('status', 'active')
    .order('created_at', { ascending: false })
    .limit(limit)

  return data || []
}

export async function getFeaturedTestimonials() {
  const supabase = await createClient()
  const { data } = await supabase
    .from('testimonials')
    .select('id, name, role, quote, avatar_url, is_featured, sort_order, created_at, title, content, source, event_context, date_received, status, updated_at, image_url')
    .eq('is_featured', true)
    .order('sort_order', { ascending: true })

  return data || []
}

export async function getPublishedCourses(limit?: number) {
  const supabase = await createClient()
  let query = supabase
    .from('courses')
    .select('id, title, slug, description, long_description, instructor_name, thumbnail_url, preview_video_url, price, stripe_price_id, course_type, difficulty_level, materials_needed, status, published_at, created_at, updated_at')
    .eq('status', 'published')
    .order('created_at', { ascending: false })

  if (limit) query = query.limit(limit)

  const { data } = await query
  return data || []
}

export async function getProducts(options?: {
  category?: string
  limit?: number
  offset?: number
  sort?: 'newest' | 'price_asc' | 'price_desc'
}) {
  const supabase = await createClient()
  let query = supabase
    .from('products')
    .select('*, product_images(*), categories!products_category_id_fkey(id, name, slug), product_variants(id, variant_type, inventory_count, price, medium, is_active, is_lumaprints_available)', { count: 'exact' })
    .eq('status', 'active')

  if (options?.category) {
    query = query.eq('categories.slug', options.category)
  }

  switch (options?.sort) {
    case 'price_asc':
      query = query.order('base_price', { ascending: true })
      break
    case 'price_desc':
      query = query.order('base_price', { ascending: false })
      break
    default:
      query = query.order('created_at', { ascending: false })
  }

  if (options?.limit) query = query.limit(options.limit)
  if (options?.offset) query = query.range(options.offset, options.offset + (options.limit || 12) - 1)

  const { data, count } = await query
  const products = data || []
  const readiness = await loadPublicPrintReadiness(supabase, products.map((product) => product.id))
  if (readiness.error) console.error('Storefront print readiness lookup failed', readiness.error)
  return {
    products: products.map((product) => ({
      ...product,
      master_artwork: storefrontMaster(readiness.data.get(product.id)),
    })),
    total: count || 0,
  }
}

export async function getProductBySlug(slug: string) {
  const supabase = await createClient()
  const { data } = await supabase
    .from('products')
    .select('*, product_images(*), product_variants(*), categories!products_category_id_fkey(id, name, slug)')
    .eq('slug', slug)
    .in('status', ['active', 'sold'])
    .single()

  if (!data) return data
  const readiness = await loadPublicPrintReadiness(supabase, [data.id])
  if (readiness.error) console.error('Product print readiness lookup failed', readiness.error)
  return { ...data, master_artwork: storefrontMaster(readiness.data.get(data.id)) }
}

export async function getPublishedBlogPosts(limit?: number) {
  const supabase = await createClient()
  let query = supabase
    .from('blog_posts')
    .select('id, title, slug, excerpt, content_json, content_html, cover_image_url, author_id, status, tags, seo_title, seo_description, published_at, created_at, updated_at, publish_at')
    .eq('status', 'published')
    .order('published_at', { ascending: false })

  if (limit) query = query.limit(limit)

  const { data } = await query
  return data || []
}

export async function getCategories() {
  const supabase = await createClient()
  const { data } = await supabase
    .from('categories')
    .select('id, name, slug, description, image_url, sort_order, default_margin_pct')
    .order('sort_order', { ascending: true })

  return data || []
}

export async function getCategoryBySlug(slug: string) {
  const supabase = await createClient()
  const { data } = await supabase
    .from('categories')
    .select('id, name, slug, description, image_url, sort_order, default_margin_pct')
    .eq('slug', slug)
    .single()

  return data
}

export async function getProductsByCategory(categorySlug: string) {
  const supabase = await createClient()
  const { data: category } = await supabase
    .from('categories')
    .select('id, name, slug, description')
    .eq('slug', categorySlug)
    .single()

  if (!category) return { category: null, products: [] }

  // Pull product IDs from the junction so cross-posted products show in
  // every category they belong to, not just their primary one. sort_order is
  // the per-category manual display order (NULL = unset).
  const { data: links } = await supabase
    .from('product_categories')
    .select('product_id, sort_order')
    .eq('category_id', category.id)

  const productIds = (links || []).map((l) => l.product_id)
  if (productIds.length === 0) return { category, products: [] }

  const { data: products } = await supabase
    .from('products')
    .select('*, product_images(*), product_variants(id, variant_type, inventory_count, price, medium, is_active, is_lumaprints_available)')
    .in('id', productIds)
    .eq('status', 'active')
    .order('created_at', { ascending: false })

  // Apply the per-category manual ordering: products with an explicit
  // sort_order come first (ascending), the rest keep the created_at fallback
  // (newest first). The masonry fills column-major, so this order is set
  // column-major to lay out like-sized pieces into the same visual row.
  const readiness = await loadPublicPrintReadiness(supabase, (products || []).map((product) => product.id))
  if (readiness.error) console.error('Collection print readiness lookup failed', readiness.error)
  const hydratedProducts = (products || []).map((product) => ({
    ...product,
    master_artwork: storefrontMaster(readiness.data.get(product.id)),
  }))

  const orderMap = new Map((links || []).map((l) => [l.product_id, l.sort_order as number | null]))
  const ordered = hydratedProducts.slice().sort((a, b) => {
    const sa = orderMap.get(a.id)
    const sb = orderMap.get(b.id)
    if (sa != null && sb != null) return sa - sb
    if (sa != null) return -1
    if (sb != null) return 1
    return 0
  })

  return { category, products: ordered }
}

export async function getCourseBySlug(slug: string) {
  const supabase = await createClient()
  const { data } = await supabase
    .from('courses')
    .select('id, title, slug, description, long_description, instructor_name, thumbnail_url, preview_video_url, price, stripe_price_id, course_type, difficulty_level, materials_needed, status, published_at, created_at, updated_at')
    .eq('slug', slug)
    .single()

  return data
}

export async function getCourseModules(courseId: string) {
  const supabase = await createClient()
  const { data } = await supabase
    .from('course_modules')
    .select('id, course_id, title, description, sort_order')
    .eq('course_id', courseId)
    .order('sort_order', { ascending: true })

  return data || []
}

export async function getCourseWithModulesAndLessons(courseId: string) {
  const supabase = await createClient()
  const { data: course } = await supabase
    .from('courses')
    .select('id, title, slug, description, long_description, instructor_name, thumbnail_url, preview_video_url, price, stripe_price_id, course_type, difficulty_level, materials_needed, status, published_at, created_at, updated_at')
    .eq('id', courseId)
    .single()

  if (!course) return null

  const { data: modules } = await supabase
    .from('course_modules')
    .select('*, lessons(*)')
    .eq('course_id', courseId)
    .order('sort_order', { ascending: true })

  return {
    ...course,
    modules: (modules || []).map((mod) => ({
      ...mod,
      lessons: (mod.lessons || []).sort(
        (a: { sort_order: number }, b: { sort_order: number }) =>
          a.sort_order - b.sort_order
      ),
    })),
  }
}

export async function getEnrollment(profileId: string, courseId: string) {
  const supabase = await createClient()
  const { data } = await supabase
    .from('enrollments')
    .select('id, profile_id, course_id, stripe_checkout_session_id, status, enrolled_at, completed_at')
    .eq('profile_id', profileId)
    .eq('course_id', courseId)
    .maybeSingle()

  return data
}

export async function getLessonProgress(enrollmentId: string) {
  const supabase = await createClient()
  const { data } = await supabase
    .from('lesson_progress')
    .select('id, enrollment_id, lesson_id, is_completed, completed_at, last_position_seconds')
    .eq('enrollment_id', enrollmentId)

  return data || []
}

export async function getBlogPostBySlug(slug: string) {
  const supabase = await createClient()
  const { data } = await supabase
    .from('blog_posts')
    .select('id, title, slug, excerpt, content_json, content_html, cover_image_url, author_id, status, tags, seo_title, seo_description, published_at, created_at, updated_at, publish_at')
    .eq('slug', slug)
    .eq('status', 'published')
    .single()

  return data
}
