import { renderMarkdown } from '@/lib/markdown'
import { sanitizeHtml } from '@/lib/sanitize'

/** Render current rich-text editor output and older Markdown biographies safely. */
export function sanitizeBioContent(value: string): string {
  const isRichText = /^\s*<(?:p|h[1-6]|ul|ol|blockquote|div)\b/i.test(value)
  return sanitizeHtml(isRichText ? value : renderMarkdown(value))
}
