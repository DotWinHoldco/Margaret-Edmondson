import { createClient } from './server'

export async function getPageContent(page: string, section?: string) {
  const supabase = await createClient()
  let query = supabase
    .from('site_content')
    .select('*')
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
    .select('*')
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
    .select('*')
    .eq('is_featured', true)
    .order('sort_order', { ascending: true })

  return data || []
}

export async function getPublishedCourses(limit?: number) {
  const supabase = await createClient()
  let query = supabase
    .from('courses')
    .select('*')
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
    .select('*, product_images(*), categories(*), product_variants(id, variant_type, inventory_count, price)', { count: 'exact' })
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
  return { products: data || [], total: count || 0 }
}

export async function getProductBySlug(slug: string) {
  const supabase = await createClient()
  const { data } = await supabase
    .from('products')
    .select('*, product_images(*), product_variants(*), categories(*)')
    .eq('slug', slug)
    .single()

  return data
}

export async function getPublishedBlogPosts(limit?: number) {
  const supabase = await createClient()
  let query = supabase
    .from('blog_posts')
    .select('*')
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
    .select('*')
    .order('sort_order', { ascending: true })

  return data || []
}

export async function getCategoryBySlug(slug: string) {
  const supabase = await createClient()
  const { data } = await supabase
    .from('categories')
    .select('*')
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

  const { data: products } = await supabase
    .from('products')
    .select('*, product_images(*)')
    .eq('category_id', category.id)
    .eq('status', 'active')
    .order('created_at', { ascending: false })

  return { category, products: products || [] }
}

export async function getCourseBySlug(slug: string) {
  const supabase = await createClient()
  const { data } = await supabase
    .from('courses')
    .select('*')
    .eq('slug', slug)
    .single()

  return data
}

export async function getCourseModules(courseId: string) {
  const supabase = await createClient()
  const { data } = await supabase
    .from('course_modules')
    .select('*')
    .eq('course_id', courseId)
    .order('sort_order', { ascending: true })

  return data || []
}
