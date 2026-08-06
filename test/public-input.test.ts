import { describe, expect, it } from 'vitest'
import {
  cartTrackingInputSchema,
  commissionInputSchema,
  contactInputSchema,
  discountPreviewInputSchema,
  funnelMetricInputSchema,
  newsletterInputSchema,
  publicPixelEventSchema,
  shippingQuoteInputSchema,
} from '@/lib/api/public-input'

describe('public API input schemas', () => {
  it('bounds contact and newsletter inputs used by email/CRM integrations', () => {
    expect(contactInputSchema.safeParse({
      name: 'Shopper', email: 'shopper@example.com', message: 'Hello',
    }).success).toBe(true)
    expect(contactInputSchema.safeParse({
      name: 'Shopper\r\nBcc: victim@example.com', email: 'shopper@example.com', message: 'Hello',
    }).success).toBe(false)
    expect(newsletterInputSchema.safeParse({ email: 'not-an-email' }).success).toBe(false)
  })

  it('accepts only bounded, bucket-relative commission references', () => {
    const base = {
      client_name: 'Shopper',
      client_email: 'shopper@example.com',
      description: 'A portrait request',
    }
    expect(commissionInputSchema.safeParse({
      ...base,
      reference_images: ['pending/1722890000000-abc123/photo.jpg'],
    }).success).toBe(true)
    expect(commissionInputSchema.safeParse({
      ...base,
      reference_images: ['../../private/other-object.jpg'],
    }).success).toBe(false)
  })

  it('prevents public callers from forging Purchase events', () => {
    expect(publicPixelEventSchema.safeParse({
      eventName: 'Lead', eventId: 'event-1', sourceUrl: 'https://artbyme.studio/contact',
    }).success).toBe(true)
    expect(publicPixelEventSchema.safeParse({
      eventName: 'Purchase', eventId: 'forged-purchase', params: { value: 1000 },
    }).success).toBe(false)
  })

  it('bounds guest cart, quote, and discount-preview money-like values', () => {
    const item = {
      productId: '11111111-1111-4111-8111-111111111111',
      variantId: '33333333-3333-4333-8333-333333333333',
      quantity: 1,
    }
    expect(cartTrackingInputSchema.safeParse({ items: [item], subtotal: 125 }).success).toBe(true)
    expect(cartTrackingInputSchema.safeParse({ items: [{ ...item, quantity: -1 }] }).success).toBe(false)
    expect(shippingQuoteInputSchema.safeParse({ zip: '99501', items: [item] }).success).toBe(true)
    expect(shippingQuoteInputSchema.safeParse({ zip: '99501', items: [{ ...item, quantity: 0 }] }).success).toBe(false)
    expect(discountPreviewInputSchema.safeParse({ code: 'WELCOME10', cartSubtotal: Number.NaN }).success).toBe(false)
  })

  it('does not let public funnel traffic forge purchase counters', () => {
    expect(funnelMetricInputSchema.safeParse({ metric: 'views' }).success).toBe(true)
    expect(funnelMetricInputSchema.safeParse({ metric: 'purchase' }).success).toBe(false)
  })
})
