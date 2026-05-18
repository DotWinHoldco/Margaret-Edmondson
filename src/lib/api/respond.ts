import { z } from 'zod'
import type { ZodSchema } from 'zod'

// Standard error response shape for the admin API. Every route should
// produce { error, code, details? } so the admin UI can render messages
// consistently and surface validation problems without leaking internals.
export interface ApiErrorBody {
  error: string
  code: string
  details?: unknown
}

export function apiError(
  message: string,
  status: number = 500,
  code: string = 'INTERNAL',
  details?: unknown,
): Response {
  const body: ApiErrorBody = { error: message, code }
  if (details !== undefined) body.details = details
  return Response.json(body, { status })
}

export function apiOk<T>(data: T, status: number = 200): Response {
  return Response.json({ data }, { status })
}

// Parse a JSON request body against a Zod schema. Returns either { ok: true, data }
// or { ok: false, response } (a 400 with the validation issues).
export async function parseBody<T>(
  request: Request,
  schema: ZodSchema<T>,
): Promise<{ ok: true; data: T } | { ok: false; response: Response }> {
  let raw: unknown
  try {
    raw = await request.json()
  } catch {
    return { ok: false, response: apiError('Invalid JSON body', 400, 'INVALID_JSON') }
  }
  const parsed = schema.safeParse(raw)
  if (!parsed.success) {
    return {
      ok: false,
      response: apiError(
        'Validation failed',
        400,
        'VALIDATION_FAILED',
        parsed.error.issues.map((i) => ({ path: i.path.join('.'), message: i.message })),
      ),
    }
  }
  return { ok: true, data: parsed.data }
}

// Common scalars
export const trimmedString = z.string().trim()
export const slugRe = /^[a-z0-9-]+$/
export const optionalSlug = z
  .string()
  .trim()
  .regex(slugRe, 'Slug may only contain lowercase letters, numbers, and hyphens')
  .optional()
  .or(z.literal(''))
