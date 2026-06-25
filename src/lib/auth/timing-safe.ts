import crypto from 'node:crypto'

/**
 * Constant-time string compare. Buffers of differing length cannot be passed to
 * crypto.timingSafeEqual, so the length check is done first; this only leaks the
 * length of the expected value, never its content.
 */
export function timingSafeEqualStr(a: string, b: string): boolean {
  const bufA = Buffer.from(a)
  const bufB = Buffer.from(b)
  if (bufA.length !== bufB.length) return false
  return crypto.timingSafeEqual(bufA, bufB)
}
