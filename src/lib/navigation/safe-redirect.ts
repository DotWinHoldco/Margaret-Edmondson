const REDIRECT_BASE = 'https://artbyme.invalid'

/**
 * Accept only same-origin paths from untrusted query parameters. URL parsing is
 * important here because browsers treat backslashes in special URLs as slashes.
 */
export function safeInternalPath(
  value: string | null | undefined,
  fallback: string,
): string {
  if (!value || !value.startsWith('/') || /[\u0000-\u001f\\]/.test(value)) {
    return fallback
  }

  try {
    const decoded = decodeURIComponent(value)
    if (decoded.startsWith('//') || /[\u0000-\u001f\\]/.test(decoded)) return fallback
    const parsed = new URL(value, REDIRECT_BASE)
    if (parsed.origin !== REDIRECT_BASE) return fallback
    return `${parsed.pathname}${parsed.search}${parsed.hash}`
  } catch {
    return fallback
  }
}
