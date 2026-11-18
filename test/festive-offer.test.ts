import { describe, expect, it } from 'vitest'
import { festiveClass, illinoisClass, getFestiveOffer, festiveCampaignUrl } from '@/sites/margaret-edmondson/festive-class'

describe('festive class offer deadlines', () => {
  it('keeps the discount through November 19 in the market timezone, after UTC midnight', () => {
    const offer = getFestiveOffer(new Date('2026-11-20T05:59:59.999Z'))
    expect(offer.priceCents).toBe(2000)
    expect(offer.early).toBe(true)
  })
  it('changes to $25 at midnight on November 20 Central time', () => {
    expect(getFestiveOffer(new Date('2026-11-20T06:00:00Z'))).toMatchObject({ priceCents: 2500, early: false, ended: false })
  })
  it('ends the promotion at 12:30 PM without offering a past event', () => {
    expect(getFestiveOffer(new Date('2026-11-21T18:29:59Z')).ended).toBe(false)
    expect(getFestiveOffer(new Date('2026-11-21T18:30:00Z')).ended).toBe(true)
  })
  it('rejects an invalid clock value', () => {
    expect(() => getFestiveOffer(new Date('invalid'))).toThrow(RangeError)
  })
  it('builds channel links to the Artbyme class', () => {
    const url = new URL(festiveCampaignUrl('facebook', 'social'))
    expect(url.origin).toBe('https://artbyme.studio')
    expect(url.pathname).toBe(festiveClass.path)
    expect(url.searchParams.get('utm_campaign')).toBe('margaret_festive_market_2026')
  })
})

describe('Illinois class deadlines', () => {
  it('preserves $20 through Sunday and changes at Monday midnight Central', () => {
    expect(getFestiveOffer(new Date('2026-11-23T05:59:59.999Z'), illinoisClass)).toMatchObject({ priceCents: 2000, early: true })
    expect(getFestiveOffer(new Date('2026-11-23T06:00:00Z'), illinoisClass)).toMatchObject({ priceCents: 2500, early: false })
    expect(getFestiveOffer(new Date('2026-11-21T20:00:00Z'), illinoisClass).ended).toBe(false)
    expect(getFestiveOffer(new Date('2026-11-25T02:00:00Z'), illinoisClass).ended).toBe(true)
  })
})
