import { z } from 'zod'
import { requireAdmin } from '@/lib/auth/require-admin'
import { apiOk, apiError, parseBody, dbFail } from '@/lib/api/respond'

const CropBody = z.object({
  crop_box: z.object({
    x: z.number().min(0).max(1),
    y: z.number().min(0).max(1),
    w: z.number().gt(0).max(1),
    h: z.number().gt(0).max(1),
  }),
  border_mode: z.enum(['full_bleed', 'matte']),
  border_color: z
    .string()
    .trim()
    .regex(/^#[0-9a-fA-F]{6}$/, 'border_color must be a #RRGGBB hex')
    .default('#ffffff'),
})

// POST /api/admin/master-artworks/[id]/crop — admin only. Sets the print-ready
// crop area for a master: writes the NORMALIZED crop rectangle (0..1 of the
// original) + border mode/color and ENQUEUES a server-side crop job
// (print_status='pending'). It never touches the (multi-hundred-MB) source file
// in the request — the operator-run worker scripts/process-master-crop.mjs does
// the libvips crop/pad + lossless re-encode and flips print_status to 'ready'.
export async function POST(
  request: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  const auth = await requireAdmin()
  if (!auth.ok) return auth.response
  const { id } = await params

  const parsed = await parseBody(request, CropBody)
  if (!parsed.ok) return parsed.response
  const { crop_box, border_mode, border_color } = parsed.data

  // The rect must stay inside the image (worker reads the region directly).
  if (crop_box.x + crop_box.w > 1 + 1e-6 || crop_box.y + crop_box.h > 1 + 1e-6) {
    return apiError('Crop rectangle extends past the image edge', 400, 'CROP_OUT_OF_BOUNDS')
  }

  // Confirm the master exists (and we can read it under admin RLS).
  const { data: master, error: loadErr } = await auth.supabase
    .from('master_artworks')
    .select('id, storage_path')
    .eq('id', id)
    .maybeSingle()
  if (loadErr) return dbFail(loadErr)
  if (!master) return apiError('Master artwork not found', 404, 'NOT_FOUND')

  const { data, error } = await auth.supabase
    .from('master_artworks')
    .update({
      crop_box,
      border_mode,
      border_color,
      print_status: 'pending',
      print_requested_at: new Date().toISOString(),
      print_error: null,
      updated_at: new Date().toISOString(),
    })
    .eq('id', id)
    .select('id, print_status, print_requested_at, border_mode, border_color, crop_box')
    .single()

  if (error) return dbFail(error)

  // Job queued. The worker is run out-of-band (operator/queue) — do NOT process
  // the source file here. The editor polls GET …/master-artworks/[id] for status.
  return apiOk({ ...data, queued: true })
}
