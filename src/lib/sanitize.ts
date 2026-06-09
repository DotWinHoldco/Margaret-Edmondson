import sanitizeHtmlLib, { type IOptions } from 'sanitize-html'

// NOTE: we use `sanitize-html` (pure JS) rather than DOMPurify/isomorphic-dompurify.
// DOMPurify needs a DOM; on the server isomorphic-dompurify pulls in `jsdom`, which
// does NOT trace cleanly into the Vercel serverless bundle and fails at render with
// "Failed to load external …" (500). sanitize-html has no jsdom dependency, so it
// works identically in server components, route handlers, and the browser.
//
// Allowlist tuned for the HTML we render via dangerouslySetInnerHTML: markdown
// output, TipTap / page-builder rich text, blog + product bodies, and customer-
// submitted text shown back inside admin pages. Everything else is discarded:
// <script>, inline event handlers (on*), javascript: URLs, <iframe>, <style>, etc.
// `style` is intentionally NOT allowed (avoids CSS-injection / clickjacking).
const ALLOWED_TAGS = [
  'p', 'br', 'hr', 'span', 'div',
  'h1', 'h2', 'h3', 'h4', 'h5', 'h6',
  'strong', 'b', 'em', 'i', 'u', 's', 'strike', 'del', 'ins', 'sub', 'sup', 'mark', 'small',
  'a', 'blockquote', 'q', 'cite',
  'ul', 'ol', 'li',
  'table', 'thead', 'tbody', 'tfoot', 'tr', 'th', 'td', 'caption', 'colgroup', 'col',
  'img', 'figure', 'figcaption',
  'pre', 'code', 'kbd', 'samp',
]

const ALLOWED_ATTR = [
  'href', 'target', 'rel', 'title', 'alt', 'src', 'srcset', 'width', 'height',
  'class', 'colspan', 'rowspan', 'start', 'type', 'id', 'align',
]

const OPTIONS: IOptions = {
  allowedTags: ALLOWED_TAGS,
  allowedAttributes: { '*': ALLOWED_ATTR },
  allowedSchemes: ['http', 'https', 'mailto', 'tel'],
  allowProtocolRelative: false,
  // discard disallowed tags entirely (don't leak their text as escaped markup)
  disallowedTagsMode: 'discard',
}

/**
 * Sanitize untrusted/authored HTML for safe rendering. Returns '' for empty
 * input. Safe on the server (no jsdom) and the client.
 */
export function sanitizeHtml(dirty: string | null | undefined): string {
  if (!dirty) return ''
  return sanitizeHtmlLib(dirty, OPTIONS)
}
