import { describe, it, expect } from 'vitest'
import { renderMarkdown } from '@/lib/markdown'

describe('renderMarkdown', () => {
  it('returns empty string for empty input', () => {
    expect(renderMarkdown('')).toBe('')
  })

  it('wraps single paragraph', () => {
    expect(renderMarkdown('hello')).toBe('<p>hello</p>')
  })

  it('splits paragraphs on double newline', () => {
    const out = renderMarkdown('one\n\ntwo')
    expect(out).toContain('<p>one</p>')
    expect(out).toContain('<p>two</p>')
  })

  it('converts single newline to <br />', () => {
    expect(renderMarkdown('a\nb')).toBe('<p>a<br />b</p>')
  })

  it('renders **strong** and *em*', () => {
    expect(renderMarkdown('**bold** and *italic*')).toBe('<p><strong>bold</strong> and <em>italic</em></p>')
  })

  it('renders http(s) links with rel safety', () => {
    const out = renderMarkdown('see [my site](https://example.com)')
    expect(out).toContain('<a href="https://example.com" rel="noopener noreferrer">my site</a>')
  })

  it('does not render javascript: links as links', () => {
    const out = renderMarkdown('click [me](javascript:alert(1))')
    // The unsafe URL should NOT produce an anchor tag.
    expect(out).not.toContain('<a href')
    // And the raw "javascript:" string should be HTML-escaped (no executable href).
    expect(out).toContain('javascript:alert(1)')
  })

  it('escapes raw HTML', () => {
    const out = renderMarkdown('<script>alert(1)</script>')
    expect(out).not.toContain('<script>')
    expect(out).toContain('&lt;script&gt;')
  })

  it('escapes quotes and ampersands', () => {
    const out = renderMarkdown(`Roger & "Mary"'s painting`)
    expect(out).toContain('&amp;')
    expect(out).toContain('&quot;')
    expect(out).toContain('&#39;')
  })

  it('handles multi-paragraph + inline mark-up together', () => {
    const out = renderMarkdown('Para **one** has bold.\n\nPara two has [a link](https://x.test).')
    expect(out).toBe(
      '<p>Para <strong>one</strong> has bold.</p><p>Para two has <a href="https://x.test" rel="noopener noreferrer">a link</a>.</p>',
    )
  })
})
