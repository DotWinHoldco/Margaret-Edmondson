import { describe, it, expect } from 'vitest'
import { carrierTrackingUrl } from '@/lib/fulfillment/tracking'

// P4-2: a clickable carrier tracking URL for the shipping email.
describe('carrierTrackingUrl', () => {
  it('builds known-carrier URLs containing the encoded number', () => {
    expect(carrierTrackingUrl('UPS', '1Z999')).toBe('https://www.ups.com/track?tracknum=1Z999')
    expect(carrierTrackingUrl('FedEx', '392964503590')).toContain('fedex.com/fedextrack')
    expect(carrierTrackingUrl('USPS', '9400100000')).toContain('tools.usps.com')
    expect(carrierTrackingUrl('DHL', 'JD0123')).toContain('dhl.com')
  })

  it('is case-insensitive and matches a carrier substring (e.g. "FedEx Ground")', () => {
    expect(carrierTrackingUrl('fedex ground', '123')).toContain('fedex.com')
  })

  it('URL-encodes spaces in the tracking number', () => {
    expect(carrierTrackingUrl('USPS', '9400 1000')).toContain('9400%201000')
  })

  it('returns null for an unknown carrier or a missing/empty number', () => {
    expect(carrierTrackingUrl('OnTrac', '123')).toBeNull()
    expect(carrierTrackingUrl('UPS', null)).toBeNull()
    expect(carrierTrackingUrl(null, '123')).toBeNull()
    expect(carrierTrackingUrl('UPS', '   ')).toBeNull()
  })
})
