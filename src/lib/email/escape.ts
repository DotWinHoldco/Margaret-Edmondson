// Shared HTML-escape helper for outbound email bodies. Null-safe: coerces any
// value (including null/undefined) to a string, then escapes the five HTML
// metacharacters with the ampersand first so existing entities are not broken.
// Use this at every call site that interpolates user-supplied input (names,
// emails, phones, free-text notes/messages, addresses) into an email HTML
// template so a hostile submission cannot inject markup into the studio inbox.
export function escapeHtml(value: unknown): string {
  if (value === null || value === undefined) return ''
  return String(value)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;')
}
