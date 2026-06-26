/**
 * Typed pricing errors the variant builder renders inline. The price-preview
 * endpoint maps `.code` to a stable JSON error code so the modal can show a
 * specific message (size out of bounds vs LumaPrints unreachable vs generic).
 */

export class SizeOutOfBoundsError extends Error {
  readonly code = 'SIZE_OUT_OF_BOUNDS' as const
  constructor(message: string) {
    super(message)
    this.name = 'SizeOutOfBoundsError'
  }
}

export class LumaprintsUnavailableError extends Error {
  readonly code = 'LUMAPRINTS_UNAVAILABLE' as const
  constructor(message: string) {
    super(message)
    this.name = 'LumaprintsUnavailableError'
  }
}

export function pricingErrorCode(err: unknown): string | null {
  if (err instanceof SizeOutOfBoundsError) return err.code
  if (err instanceof LumaprintsUnavailableError) return err.code
  return null
}
