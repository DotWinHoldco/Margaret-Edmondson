/**
 * Tiny restricted-markdown renderer for bio sections.
 *
 * Supports: paragraphs (double newline), line breaks, *em*, **strong**,
 * inline links [text](url). Strips raw HTML and headings. Output is
 * HTML-safe (no dangerous innerHTML beyond the produced spans).
 */

function escapeHtml(s: string): string {
  return s
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;')
}

function applyInline(s: string): string {
  // Order matters: links first so the brackets don't get parsed as emphasis.
  // Links: [text](https://...) — http(s) only, no javascript: etc.
  s = s.replace(/\[([^\]]+)\]\((https?:\/\/[^\s)]+)\)/g, (_match, text: string, href: string) => {
    return `<a href="${escapeHtml(href)}" rel="noopener noreferrer">${escapeHtml(text)}</a>`
  })
  // Strong: **text**
  s = s.replace(/\*\*([^*]+)\*\*/g, (_m, t: string) => `<strong>${t}</strong>`)
  // Emphasis: *text*
  s = s.replace(/(?<!\*)\*([^*]+)\*(?!\*)/g, (_m, t: string) => `<em>${t}</em>`)
  return s
}

export function renderMarkdown(input: string): string {
  if (!input) return ''
  const safe = escapeHtml(input)
  const paragraphs = safe.split(/\n{2,}/)
  return paragraphs
    .map((p) => {
      const withBreaks = p.replace(/\n/g, '<br />')
      return `<p>${applyInline(withBreaks)}</p>`
    })
    .join('')
}
