// Authored by DotWin
//
// The client-side fetch wrapper for ArtByME. Every interactive component that
// calls an API route should go through here so that:
//   - errors always arrive as friendly, human copy (never raw server text),
//   - network failures are handled the same way as server errors,
//   - the { data } / bare-body response shapes are both unwrapped.
//
// Usage:
//   try {
//     const saved = await apiSend('/api/admin/products', 'POST', payload)
//     toast.success('Saved.')
//   } catch (err) {
//     toast.error(errorMessage(err))   // already friendly
//   }

import { resolveErrorMessage, FRIENDLY_MESSAGES } from '@/lib/errors/friendly'

export class ApiError extends Error {
  readonly code: string
  readonly status: number
  readonly details?: unknown
  constructor(message: string, code: string, status: number, details?: unknown) {
    super(message)
    this.name = 'ApiError'
    this.code = code
    this.status = status
    this.details = details
  }
}

/** Friendly message for anything thrown on the client (ApiError, Error, string). */
export function errorMessage(err: unknown): string {
  if (err instanceof ApiError) return err.message
  return resolveErrorMessage(err)
}

async function readBody(res: Response): Promise<unknown> {
  const text = await res.text().catch(() => '')
  if (!text) return null
  try {
    return JSON.parse(text)
  } catch {
    return text
  }
}

/**
 * Fetch a JSON API route. Resolves to the response payload (unwrapping a
 * `{ data }` envelope when present, otherwise the whole body). Throws an
 * ApiError carrying friendly copy for any non-2xx response or network failure.
 */
export async function apiFetch<T = unknown>(input: string, init?: RequestInit): Promise<T> {
  let res: Response
  try {
    res = await fetch(input, init)
  } catch {
    throw new ApiError(FRIENDLY_MESSAGES.NETWORK, 'NETWORK', 0)
  }

  const body = await readBody(res)
  const obj = body && typeof body === 'object' ? (body as Record<string, unknown>) : null

  if (!res.ok) {
    const code = typeof obj?.code === 'string' ? (obj.code as string) : undefined
    const rawError = typeof obj?.error === 'string' ? (obj.error as string) : undefined
    let message = resolveErrorMessage({ code, message: rawError })
    // Surface the specific validation problems when the server sent them.
    if (code === 'VALIDATION_FAILED' && Array.isArray(obj?.details)) {
      const msgs = (obj!.details as Array<{ message?: string }>)
        .map((d) => d?.message)
        .filter((m): m is string => Boolean(m))
      if (msgs.length) message = msgs.join(' ')
    }
    throw new ApiError(message, code ?? 'INTERNAL', res.status, obj?.details)
  }

  if (obj && 'data' in obj) return obj.data as T
  return body as T
}

/** POST/PUT/PATCH/DELETE with a JSON body. Same error semantics as apiFetch. */
export async function apiSend<T = unknown>(
  input: string,
  method: 'POST' | 'PUT' | 'PATCH' | 'DELETE',
  payload?: unknown,
  init?: RequestInit,
): Promise<T> {
  // `init` is spread first so that method, merged headers, and the serialized
  // body always win: a caller passing extra headers (e.g. the anti-bot intent
  // token) must not drop the JSON Content-Type this sets.
  return apiFetch<T>(input, {
    ...init,
    method,
    headers: { 'Content-Type': 'application/json', ...(init?.headers ?? {}) },
    body: payload !== undefined ? JSON.stringify(payload) : undefined,
  })
}
