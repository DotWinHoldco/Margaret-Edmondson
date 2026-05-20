// Universal branded shell used by every email leaving ArtByME.
// Transactional (order confirm, magic link), marketing (campaigns),
// automated (cart abandon, nurture), and one-off admin tests all pass
// through this wrapper so the visual identity is consistent.

interface ShellOptions {
  preheader?: string
  unsubscribeUrl?: string
  hideUnsubscribe?: boolean
  footerNote?: string
}

const SITE_URL = process.env.NEXT_PUBLIC_SITE_URL || 'https://artbyme.studio'

export function brandedShell(content: string, opts: ShellOptions = {}): string {
  const preheaderBlock = opts.preheader
    ? `<div style="display:none;max-height:0;overflow:hidden;opacity:0;color:#FAF7F2;font-size:1px;line-height:1px;">${escapeHtml(opts.preheader)}</div>`
    : ''

  const unsubscribeBlock = opts.hideUnsubscribe
    ? ''
    : `<p style="text-align:center;color:#999;font-size:10px;margin-top:12px;line-height:1.6;">
        You are receiving this because you joined the ArtByME Studio List Newsletter.
        ${opts.unsubscribeUrl
          ? `<br/><a href="${opts.unsubscribeUrl}" style="color:#3A7D7B;text-decoration:underline;">Unsubscribe</a>`
          : ''}
      </p>`

  const footerNote = opts.footerNote
    ? `<p style="text-align:center;color:#999;font-size:10px;margin-top:8px;">${opts.footerNote}</p>`
    : ''

  return `${preheaderBlock}
<div style="font-family: Georgia, 'Times New Roman', serif; max-width: 560px; margin: 0 auto; padding: 40px 24px; color: #2C2C2C; background: #FAF7F2;">
  <div style="text-align: center; margin-bottom: 32px;">
    <h1 style="font-size: 28px; font-weight: 300; letter-spacing: 0.03em; margin: 0;">ArtBy<span style="font-weight: 700;">ME</span></h1>
    <p style="color: #3A7D7B; font-size: 12px; text-transform: uppercase; letter-spacing: 0.1em; margin-top: 4px;">Margaret Edmondson</p>
  </div>
  ${content}
  <hr style="border: none; border-top: 1px solid #e5e0d8; margin: 32px 0 16px;" />
  <p style="text-align: center; color: #C9A84C; font-size: 11px; letter-spacing: 0.05em;">Mixed media, paintings &amp; collage by Margaret Edmondson</p>
  <p style="text-align: center; color: #999; font-size: 10px; margin-top: 8px;">
    <a href="${SITE_URL}" style="color: #3A7D7B; text-decoration: none;">artbyme.studio</a>
  </p>
  ${footerNote}
  ${unsubscribeBlock}
</div>`
}

export function discountCallout(code: string, percentOff: number, expiresLabel?: string): string {
  return `<div style="background:#fff;border:1px dashed #C9A84C;border-radius:8px;padding:20px;text-align:center;margin:20px 0;">
    <p style="margin:0 0 8px;color:#3A7D7B;text-transform:uppercase;letter-spacing:0.1em;font-size:11px;">Your code</p>
    <p style="margin:0;font-size:24px;font-weight:700;letter-spacing:0.1em;color:#2C2C2C;font-family:'Courier New',monospace;">${escapeHtml(code)}</p>
    <p style="margin:8px 0 0;color:#666;font-size:13px;">${percentOff}% off your order${expiresLabel ? ` · ${escapeHtml(expiresLabel)}` : ''}</p>
  </div>`
}

export function ctaButton(href: string, label: string, accent: 'teal' | 'coral' = 'teal'): string {
  const bg = accent === 'coral' ? '#D4654A' : '#3A7D7B'
  return `<div style="text-align:center;margin:28px 0;">
    <a href="${href}" style="display:inline-block;background:${bg};color:#fff;padding:14px 36px;text-decoration:none;border-radius:4px;font-size:14px;font-weight:600;">${escapeHtml(label)}</a>
  </div>`
}

function escapeHtml(s: string): string {
  return String(s)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
}
