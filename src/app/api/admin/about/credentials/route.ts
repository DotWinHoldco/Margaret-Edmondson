import { NextRequest } from 'next/server'
import { z } from 'zod'
import { requireAdmin } from '@/lib/auth/require-admin'
import { apiOk, dbFail, parseBody } from '@/lib/api/respond'

const Degree = z.object({
  year: z.string().min(1),
  degree: z.string().min(1),
  institution: z.string().min(1),
  location: z.string().min(1),
  honors: z.string().optional(),
})

// hero_image_url can be: a Supabase public URL, a /public/ relative path,
// an empty string (clears the image), or null. The MediaPicker writes
// supabase URLs; legacy data may still hold /public paths until migrated.
const heroUrl = z
  .string()
  .nullable()
  .optional()
  .transform((v) => (v == null || v === '' ? null : v))
  .refine(
    (v) => v == null || /^https?:\/\//.test(v) || v.startsWith('/'),
    'Must be a full URL, a /public-relative path, or empty',
  )

const Patch = z.object({
  full_name: z.string().min(1).optional(),
  degrees: z.array(Degree).optional(),
  hero_image_url: heroUrl,
  contact_email: z.string().email().optional(),
})

// PATCH /api/admin/about/credentials — update the bio credentials block; admin only.
export async function PATCH(request: NextRequest) {
  const auth = await requireAdmin()
  if (!auth.ok) return auth.response
  const parsed = await parseBody(request, Patch)
  if (!parsed.ok) return parsed.response

  const { error } = await auth.supabase
    .from('bio_credentials_block')
    .update({ ...parsed.data, updated_at: new Date().toISOString() })
    .eq('id', true)

  if (error) return dbFail(error, 'admin/about/credentials PATCH')
  return apiOk({ success: true })
}
