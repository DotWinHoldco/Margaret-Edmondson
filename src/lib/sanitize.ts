import DOMPurify from 'isomorphic-dompurify'

// Allowlist tuned for the HTML we actually render via dangerouslySetInnerHTML:
// markdown output, TipTap / page-builder rich text, blog + product bodies, and
// — critically — customer-submitted text shown back inside admin pages
// (commission/order notes). Anything outside this set is stripped: <script>,
// inline event handlers (on*), javascript: URLs, <iframe>, <object>, etc.
//
// NOTE: the `style` attribute is intentionally NOT allowed. DOMPurify 3.x no
// longer ships a built-in CSS sanitizer, so permitting `style` would let
// customer-submitted content inject CSS (position:fixed overlays / clickjacking)
// into admin pages. Alignment/spacing is covered by `align` + Tailwind classes.
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
