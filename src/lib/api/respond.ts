import { z } from 'zod'
import type { ZodSchema } from 'zod'
import { friendlyMessage } from '@/lib/errors/friendly'

// Standard error response shape for the API. Every route should produce
// { error, code, details? } so the UI can render messages consistently and
// surface validation problems without leaking internals. The `error` string is
// always safe to show a person — it is friendly copy, never raw exception or
// Postgres text (use apiFail below to guarantee that for caught exceptions).
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

// Turn a caught exception (or any unknown error) into a safe API response.
// The real detail is logged server-side for the developer; the client only
// ever receives friendly copy keyed by `code`. Use this in catch blocks so a
// raw Postgres/Supabase/Stripe message can never reach the browser.
//   catch (err) { return apiFail(err, { context: 'admin/products PATCH' }) }
export function apiFail(
  err: unknown,
  opts: { status?: number; code?: string; publicMessage?: string; context?: string } = {},
): Response {
  const status = opts.status ?? 500
  const code = opts.code ?? 'INTERNAL'
  const detail =
    err instanceof Error ? err.message : typeof err === 'string' ? err : safeStringify(err)
  // Server-only log; never sent to the client.
  console.error(`[api] ${opts.context ?? code}:`, detail)
  return apiError(opts.publicMessage ?? friendlyMessage(code), status, code)
}

// Convenience for the most common leak: a failed Supabase/Postgres call.
// Returns the friendly "there was an error with your database" copy.
export function dbFail(err: unknown, context?: string): Response {
  return apiFail(err, { status: 500, code: 'DATABASE_ERROR', context })
}

function safeStringify(value: unknown): string {
  try {
    return JSON.stringify(value)
  } catch {
    return String(value)
  }
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
