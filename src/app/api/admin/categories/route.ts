import { NextRequest } from 'next/server'
import { z } from 'zod'
import { requireAdmin } from '@/lib/auth/require-admin'
import { apiError, apiOk, dbFail, parseBody } from '@/lib/api/respond'

const slugify = (s: string) =>
  s.toLowerCase().trim().replace(/[^a-z0-9]+/g, '-').replace(/^-+|-+$/g, '')

// GET /api/admin/categories — list categories with product counts; admin only.
export async function GET() {
  const auth = await requireAdmin()
  if (!auth.ok) return auth.response
  const { data: cats, error } = await auth.supabase
    .from('categories')
    .select('id, name, slug, default_margin_pct, sort_order')
    .order('sort_order', { ascending: true })
    .order('name', { ascending: true })
  if (error) return dbFail(error, 'admin/categories GET')
  const { data: prods } = await auth.supabase.from('products').select('category_id')
  const byCat: Record<string, number> = {}
  for (const r of prods || []) if (r.category_id) byCat[r.category_id] = (byCat[r.category_id] || 0) + 1
  return apiOk({ categories: (cats || []).map((c) => ({ ...c, product_count: byCat[c.id] || 0 })) })
}

const Create = z.object({
  name: z.string().min(1),
  slug: z.string().optional(),
  default_margin_pct: z.number().min(0).nullable().optional(),
})

// POST /api/admin/categories — create a category; admin only.
export async function POST(request: NextRequest) {
  const auth = await requireAdmin()
  if (!auth.ok) return auth.response
  const parsed = await parseBody(request, Create)
  if (!parsed.ok) return parsed.response
  const slug = slugify(parsed.data.slug || parsed.data.name) || slugify(parsed.data.name)
  const { data: maxRow } = await auth.supabase
    .from('categories')
    .select('sort_order')
    .order('sort_order', { ascending: false })
    .limit(1)
    .maybeSingle()
  const { data, error } = await auth.supabase
    .from('categories')
    .insert({
      name: parsed.data.name,
      slug,
      default_margin_pct: parsed.data.default_margin_pct ?? null,
      sort_order: (maxRow?.sort_order ?? 0) + 1,
    })
    .select('id, name, slug, default_margin_pct, sort_order')
    .single()
  if (error) {
    if (error.code === '23505') {
      return apiError('That category already exists. Please use a different name.', 409, 'CONFLICT')
    }
    return dbFail(error, 'admin/categories POST')
  }
  return apiOk({ category: { ...data, product_count: 0 } })
}
