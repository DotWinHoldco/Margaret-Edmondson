import { brandedShell, ctaButton, discountCallout } from './shell'

const RESEND_API = 'https://api.resend.com/emails'

interface SendEmailOptions {
  to: string | string[]
  subject: string
  html: string
  replyTo?: string
  headers?: Record<string, string>
}

export async function sendEmail({ to, subject, html, replyTo, headers }: SendEmailOptions) {
  if (!process.env.RESEND_API_KEY) {
    console.warn('RESEND_API_KEY not set — skipping email:', subject)
    return null
  }

  const res = await fetch(RESEND_API, {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${process.env.RESEND_API_KEY}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({
      from: process.env.EMAIL_FROM || 'ArtByME <hello@artbyme.studio>',
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
interface OrderItem {
  name: string
  quantity: number
  price: number
  variant?: string
}

export async function sendOrderConfirmation(
  email: string,
  orderId: string,
  items: OrderItem[],
  total: number
) {
  const itemRows = items
    .map(
      (i) =>
        `<tr>
          <td style="padding: 8px 0; border-bottom: 1px solid #eee; font-size: 14px;">${i.name}${i.variant ? `<br><span style="color: #888; font-size: 12px;">${i.variant}</span>` : ''}</td>
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
          <tr>
            <td colspan="2" style="padding: 12px 0; text-align: right; font-weight: 700; font-size: 14px;">Total</td>
            <td style="padding: 12px 0; text-align: right; font-weight: 700; font-size: 16px; color: #3A7D7B;">$${total.toFixed(2)}</td>
          </tr>
        </tfoot>
      </table>
    </div>
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
  const greeting = firstName ? `Hi ${firstName},` : 'Welcome!'
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
  trackingUrl?: string
) {
  const siteUrl = process.env.NEXT_PUBLIC_SITE_URL || 'https://artbyme.studio'

  const trackingBlock = trackingUrl
    ? ctaButton(trackingUrl, 'Track Your Shipment')
    : `<p style="text-align: center; color: #666; font-size: 14px;">Tracking details will be available shortly.</p>`

  const html = brandedShell(
    `
    <h2 style="font-size: 20px; font-weight: 400; text-align: center; margin-bottom: 8px;">Your Art Is On Its Way!</h2>
    <p style="text-align: center; color: #666; font-size: 14px; line-height: 1.6; margin-bottom: 24px;">
      Great news, order #${orderId.slice(0, 8).toUpperCase()} has shipped.
    </p>
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
