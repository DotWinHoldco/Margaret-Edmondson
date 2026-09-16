import { NextRequest } from 'next/server'
import { requireAdmin } from '@/lib/auth/require-admin'
import { apiError, apiFail, apiOk } from '@/lib/api/respond'
import { catalogHost, walkCategories, walkCategory } from '@/lib/catalog/walk'

/**
 * Read-only capture of the live print-catalog structure, one category per call.
 *
 * Why a route and not only a script: the production provider credentials exist only
 * inside the hosting platform and cannot be pulled to a workstation, so the production
 * catalog can only be walked from a deployed environment. The payload is shaped exactly
 * like the committed Phase 0 fixture, and `scripts/catalog-snapshot.mjs --assemble <dir>`
 * stitches the per-category responses into one snapshot file for the id diff.
 *
 * Nothing is written: no database rows, no prices, no orders — this reads three GET
 * endpoints and returns what they said.
 *
 * With no query: `{ host, capturedAt, categories: [{ id, name }] }` (one request).
 * With `?category=<int>`: that category's subcategories, each with its published
 * bounds/DPI and option groups. The walk paces itself to <=25 provider requests per
 * minute, so a large category (the framed-paper profiles) can exceed one invocation;
 * it then returns `incomplete: true` with `nextOffset`, and the caller resumes with
 * `?category=<int>&offset=<nextOffset>`.
 */
export const maxDuration = 60

// GET /api/admin/lumaprints/snapshot — capture the live catalog structure (optionally one category); admin only, read-only.
export async function GET(request: NextRequest) {
  const auth = await requireAdmin()
  if (!auth.ok) return auth.response

  if (!process.env.LUMAPRINTS_API_KEY || !process.env.LUMAPRINTS_API_SECRET) {
    return apiError('Print provider API key/secret not configured', 503, 'LUMA_NO_KEYS')
  }

  const params = request.nextUrl.searchParams
  const rawCategory = params.get('category')
  const rawOffset = params.get('offset')

  const parseInteger = (value: string): number | null => {
    if (!/^\d{1,9}$/.test(value.trim())) return null
    const n = Number(value.trim())
    return Number.isSafeInteger(n) ? n : null
  }

  const offset = rawOffset === null ? 0 : parseInteger(rawOffset)
  if (offset === null) return apiError('offset must be a whole number', 400, 'BAD_OFFSET')

  try {
    if (rawCategory === null) {
      const { host, capturedAt, categories } = await walkCategories()
      return apiOk({ host, capturedAt, categories })
    }

    const categoryId = parseInteger(rawCategory)
    if (categoryId === null) return apiError('category must be a whole number', 400, 'BAD_CATEGORY')

    const walked = await walkCategory(categoryId, { offset })
    if (walked.category.subcategories.length === 0 && !walked.category.name) {
      return apiError(`Category ${categoryId} was not found in the live catalog`, 404, 'NO_CATEGORY')
    }
    return apiOk({
      host: walked.host,
      capturedAt: walked.capturedAt,
      requestCount: walked.requestCount,
      wallMs: walked.wallMs,
      subcategoryCount: walked.subcategoryCount,
      incomplete: walked.incomplete,
      nextOffset: walked.nextOffset,
      category: walked.category,
    })
  } catch (err) {
    return apiFail(err, { status: 502, code: 'LUMA_FAIL', context: `admin/lumaprints/snapshot host=${catalogHost()}` })
  }
}
