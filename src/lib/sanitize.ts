import DOMPurify from 'isomorphic-dompurify'

// Allowlist tuned for the HTML we actually render via dangerouslySetInnerHTML:
// markdown output, TipTap / page-builder rich text, blog + product bodies, and
// — critically — customer-submitted text shown back inside admin pages
// (commission/order notes). Anything outside this set is stripped: <script>,
// inline event handlers (on*), javascript: URLs, <iframe>, <object>, etc.
//
// `style` is permitted because DOMPurify runs a built-in CSS sanitizer on it
// (removing expression()/url(javascript:)/behaviors), and our rich-text output
// relies on inline alignment/spacing. Everything dangerous is still removed.
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
  'class', 'style', 'colspan', 'rowspan', 'start', 'type', 'id', 'align',
]

/**
 * Sanitize untrusted/authored HTML for safe rendering. Returns '' for empty
 * input. Safe to call on the server (jsdom) and the client (browser DOMPurify).
 */
export function sanitizeHtml(dirty: string | null | undefined): string {
  if (!dirty) return ''
  return DOMPurify.sanitize(dirty, {
    ALLOWED_TAGS,
    ALLOWED_ATTR,
    ALLOW_DATA_ATTR: false,
    FORBID_TAGS: ['style', 'script', 'iframe', 'object', 'embed', 'form'],
    USE_PROFILES: { html: true },
  })
}
