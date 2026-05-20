// Placeholder substitution for marketing emails and automations.
// Tokens look like {{first_name}}. Unknown tokens collapse to '' so a
// missing variable never leaks "{{...}}" to the recipient.

export interface PlaceholderContext {
  first_name?: string | null
  last_name?: string | null
  email?: string | null
  discount_code?: string | null
  discount_value?: string | number | null
  cart_url?: string | null
  site_url?: string | null
  shop_url?: string | null
  unsubscribe_url?: string | null
  first_name_or_friend?: string | null
  [key: string]: string | number | null | undefined
}

const TOKEN_RE = /\{\{\s*([a-z0-9_]+)\s*\}\}/gi

export function substitutePlaceholders(
  template: string,
  ctx: PlaceholderContext
): string {
  const enriched: PlaceholderContext = {
    site_url: process.env.NEXT_PUBLIC_SITE_URL || 'https://artbyme.studio',
    shop_url: `${process.env.NEXT_PUBLIC_SITE_URL || 'https://artbyme.studio'}/shop`,
    cart_url: `${process.env.NEXT_PUBLIC_SITE_URL || 'https://artbyme.studio'}/cart`,
    ...ctx,
  }
  enriched.first_name_or_friend = enriched.first_name && String(enriched.first_name).trim().length > 0
    ? String(enriched.first_name).trim()
    : 'friend'

  return template.replace(TOKEN_RE, (_match, key: string) => {
    const v = enriched[key.toLowerCase()]
    if (v === null || v === undefined) return ''
    return String(v)
  })
}

export const KNOWN_PLACEHOLDERS = [
  'first_name',
  'last_name',
  'email',
  'discount_code',
  'discount_value',
  'cart_url',
  'shop_url',
  'site_url',
  'unsubscribe_url',
  'first_name_or_friend',
] as const
