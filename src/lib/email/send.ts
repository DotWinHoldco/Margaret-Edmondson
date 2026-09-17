import { TEXAS_TAX_INCLUDED_STATEMENT } from '@/lib/tax/config'
import { brandedShell, ctaButton, discountCallout } from './shell'
import { escapeHtml } from './escape'
import { normalizeColorHex } from '@/lib/orders/print-options'
import { getEmailFromLine } from '@/lib/settings/accessor'

const RESEND_API = 'https://api.resend.com/emails'

interface SendEmailOptions {
  to: string | string[]
  subject: string
  html: string
  replyTo?: string
  headers?: Record<string, string>
  idempotencyKey?: string
}

export async function sendEmail({ to, subject, html, replyTo, headers, idempotencyKey }: SendEmailOptions) {
  if (!process.env.RESEND_API_KEY) {
    console.warn('RESEND_API_KEY not set — skipping email:', subject)
    return null
  }

  // From line comes from site settings; the env var is the fallback when the
  // setting is unreadable.
  let from = process.env.EMAIL_FROM || 'ArtByME <hello@artbyme.studio>'
  try {
    const line = await getEmailFromLine()
    if (line) from = line
  } catch {
    // settings unavailable — keep the env fallback
  }

  const res = await fetch(RESEND_API, {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${process.env.RESEND_API_KEY}`,
      'Content-Type': 'application/json',
      ...(idempotencyKey ? { 'Idempotency-Key': idempotencyKey } : {}),
    },
    body: JSON.stringify({
      from,
      to: Array.isArray(to) ? to : [to],
      subject,
      html,
      ...(replyTo ? { reply_to: replyTo } : {}),
      ...(headers ? { headers } : {}),
    }),
  })

  if (!res.ok) {
    const err = await res.text()
    console.error('Resend email failed:', res.status, err)
    return null
  }

  return res.json()
}

// ─── Order Confirmation ──────────────────────────────────────────────
/**
 * One purchased line as the emails describe it (P7). `variant`, `options` and
 * `colorHex` all come from the FROZEN purchase_spec, never the live catalog.
 */
export interface OrderEmailLine {
  name: string
  variant?: string
  /** "Wrap: Solid Color Wrap · Hardware: Sawtooth"; omitted when there are none. */
  options?: string
  /** A `#rrggbb` wrap colour; anything else is dropped before it reaches the HTML. */
  colorHex?: string | null
}

interface OrderItem extends OrderEmailLine {
  quantity: number
  price: number
}

/** The frozen configuration under a line's name: escaped text, plus a colour chip. */
function lineDetailHtml(item: OrderEmailLine): string {
  const muted = 'color: #888; font-size: 12px;'
  const hex = normalizeColorHex(item.colorHex)
  return [
    item.variant ? `<br><span style="${muted}">${escapeHtml(item.variant)}</span>` : '',
    item.options ? `<br><span style="${muted}">${escapeHtml(item.options)}</span>` : '',
    hex
      ? `<br><span style="display: inline-block; width: 12px; height: 12px; border: 1px solid #ddd; vertical-align: middle; background-color: ${hex};"></span> <span style="${muted}">${escapeHtml(hex)}</span>`
      : '',
  ].join('')
}

export async function sendOrderConfirmation(
  email: string,
  orderId: string,
  items: OrderItem[],
  total: number,
  orderUrl?: string,
  tax?: { amount: number; included: boolean; state: string },
) {
  const itemRows = items
    .map(
      (i) =>
        `<tr>
          <td style="padding: 8px 0; border-bottom: 1px solid #eee; font-size: 14px;">${escapeHtml(i.name)}${lineDetailHtml(i)}</td>
          <td style="padding: 8px 0; border-bottom: 1px solid #eee; text-align: center; font-size: 14px;">${i.quantity}</td>
          <td style="padding: 8px 0; border-bottom: 1px solid #eee; text-align: right; font-size: 14px;">$${i.price.toFixed(2)}</td>
        </tr>`
    )
    .join('')

  const html = brandedShell(
    `
    <h2 style="font-size: 20px; font-weight: 400; text-align: center; margin-bottom: 8px;">Thank You for Your Order!</h2>
    <p style="text-align: center; color: #666; font-size: 14px; line-height: 1.6; margin-bottom: 24px;">
      Your order has been confirmed and is being prepared. You'll receive shipping updates as your art is on its way.
    </p>
    <div style="background: white; border-radius: 8px; padding: 20px; margin-bottom: 24px; border: 1px solid #e5e0d8;">
      <p style="font-size: 12px; color: #888; text-transform: uppercase; letter-spacing: 0.05em; margin: 0 0 12px;">Order #${orderId.slice(0, 8).toUpperCase()}</p>
      <table style="width: 100%; border-collapse: collapse;">
        <thead>
          <tr>
            <th style="text-align: left; padding: 8px 0; border-bottom: 2px solid #2C2C2C; font-size: 12px; text-transform: uppercase; letter-spacing: 0.05em;">Item</th>
            <th style="text-align: center; padding: 8px 0; border-bottom: 2px solid #2C2C2C; font-size: 12px; text-transform: uppercase; letter-spacing: 0.05em;">Qty</th>
            <th style="text-align: right; padding: 8px 0; border-bottom: 2px solid #2C2C2C; font-size: 12px; text-transform: uppercase; letter-spacing: 0.05em;">Price</th>
          </tr>
        </thead>
        <tbody>${itemRows}</tbody>
        <tfoot>
          ${tax && tax.amount > 0 ? `<tr><td colspan="2" style="padding: 8px 0; text-align: right; font-size: 14px;">${tax.included ? 'Sales tax included (already in prices)' : 'Sales tax'}</td><td style="text-align: right; font-size: 14px;">$${tax.amount.toFixed(2)}</td></tr>` : ''}
          <tr>
            <td colspan="2" style="padding: 12px 0; text-align: right; font-weight: 700; font-size: 14px;">Total</td>
            <td style="padding: 12px 0; text-align: right; font-weight: 700; font-size: 16px; color: #3A7D7B;">$${total.toFixed(2)}</td>
          </tr>
        </tfoot>
      </table>
      ${tax?.included && tax.state.toUpperCase() === 'TX' ? `<p style="font-size: 12px; color: #666;">${TEXAS_TAX_INCLUDED_STATEMENT}</p>` : ''}
    </div>
    ${orderUrl ? ctaButton(orderUrl, 'View your order') : ''}
    ${orderUrl ? `<p style="text-align: center; color: #888; font-size: 12px; line-height: 1.6; margin-top: 4px;">
      We created an account for you with this email so you can track your orders and check out faster next time.
      <a href="${(process.env.NEXT_PUBLIC_SITE_URL || 'https://artbyme.studio').replace(/\/$/, '')}/forgot-password" style="color: #3A7D7B;">Set a password</a> to view your order history.
    </p>` : ''}
    <p style="text-align: center; color: #666; font-size: 13px; line-height: 1.6;">
      Questions about your order? Reply to this email or reach out at
      <a href="mailto:hello@artbyme.studio" style="color: #3A7D7B;">hello@artbyme.studio</a>
    </p>
  `,
    { hideUnsubscribe: true, preheader: `Order confirmed — total $${total.toFixed(2)}` }
  )

  return sendEmail({
    to: email,
    subject: `ArtByME — Order Confirmed #${orderId.slice(0, 8).toUpperCase()}`,
    html,
    replyTo: 'hello@artbyme.studio',
  })
}

// ─── Welcome Subscriber ──────────────────────────────────────────────
export async function sendWelcomeSubscriber(
  email: string,
  firstName?: string,
  options?: { discountCode?: string; percentOff?: number; expiresLabel?: string; unsubscribeUrl?: string }
) {
  const greeting = firstName ? `Hi ${escapeHtml(firstName)},` : 'Welcome!'
  const siteUrl = process.env.NEXT_PUBLIC_SITE_URL || 'https://artbyme.studio'

  const codeBlock = options?.discountCode && options.percentOff
    ? discountCallout(options.discountCode, options.percentOff, options.expiresLabel || 'Valid for 24 hours')
    : ''

  const html = brandedShell(
    `
    <h2 style="font-size: 20px; font-weight: 400; text-align: center; margin-bottom: 8px;">${greeting}</h2>
    <p style="text-align: center; color: #666; font-size: 14px; line-height: 1.6; margin-bottom: 16px;">
      Thank you for subscribing to ArtByME. You'll be the first to know about new artwork, upcoming shows, and exclusive offers from Margaret Edmondson.
    </p>
    ${codeBlock}
    ${ctaButton(`${siteUrl}/shop`, 'Browse the Collection')}
    <p style="text-align: center; color: #999; font-size: 12px;">
      ${codeBlock ? 'Apply the code at checkout. ' : ''}You can unsubscribe at any time using the link below.
    </p>
  `,
    {
      preheader: options?.discountCode
        ? `Welcome to ArtByME — your ${options.percentOff}% off code is inside.`
        : 'Welcome to ArtByME',
      unsubscribeUrl: options?.unsubscribeUrl,
    }
  )

  return sendEmail({
    to: email,
    subject: options?.discountCode
      ? `Welcome — here is your ${options.percentOff}% off code`
      : 'Welcome to ArtByME — Margaret Edmondson',
    html,
  })
}

// ─── Shipping Update ─────────────────────────────────────────────────
export async function sendShippingUpdate(
  email: string,
  orderId: string,
  trackingUrl?: string,
  items?: OrderEmailLine[]
) {
  const siteUrl = process.env.NEXT_PUBLIC_SITE_URL || 'https://artbyme.studio'

  const trackingBlock = trackingUrl
    ? ctaButton(trackingUrl, 'Track Your Shipment')
    : `<p style="text-align: center; color: #666; font-size: 14px;">Tracking details will be available shortly.</p>`

  // P7: name what shipped from each line's frozen configuration.
  const itemBlock = items?.length
    ? `<div style="background: white; border-radius: 8px; padding: 16px; margin-bottom: 24px; border: 1px solid #e5e0d8;">${items
        .map(
          (i) =>
            `<p style="margin: 0 0 8px; font-size: 14px;">${escapeHtml(i.name)}${lineDetailHtml(i)}</p>`
        )
        .join('')}</div>`
    : ''

  const html = brandedShell(
    `
    <h2 style="font-size: 20px; font-weight: 400; text-align: center; margin-bottom: 8px;">Your Art Is On Its Way!</h2>
    <p style="text-align: center; color: #666; font-size: 14px; line-height: 1.6; margin-bottom: 24px;">
      Great news, order #${orderId.slice(0, 8).toUpperCase()} has shipped.
    </p>
    ${itemBlock}
    ${trackingBlock}
    <p style="text-align: center; color: #999; font-size: 12px;">
      Questions? Reply to this email or visit <a href="${siteUrl}" style="color: #3A7D7B;">artbyme.studio</a>
    </p>
  `,
    { hideUnsubscribe: true, preheader: 'Shipping update inside.' }
  )

  return sendEmail({
    to: email,
    subject: `ArtByME — Your Order Has Shipped #${orderId.slice(0, 8).toUpperCase()}`,
    html,
    replyTo: 'hello@artbyme.studio',
  })
}
