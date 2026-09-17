// Authored by DotWin
// F27: Margaret's in-app help taught the pre-catalog store (a print border stood in for a mat,
// listings promised "Frame is not included", one 200-DPI rule covered every material). The store
// now lets a buyer choose the frame, the mat, the paper and the glazing on the print types that
// are turned on, so these assertions keep the help from drifting back.

import { describe, expect, it } from 'vitest'
import { helpArticles, getHelpArticle } from '@/lib/help/articles'

/** Everything a reader sees for one article, as one searchable string. */
function articleText(article: (typeof helpArticles)[number]): string {
  return JSON.stringify(article)
}

const RETIRED_PHRASES = [
  'does not order a physical mat board',
  'Frame is not included',
  'choose a frame for the buyer',
]

describe('help articles describe the print store that exists', () => {
  it('carries the Print Catalog article in the catalog group', () => {
    const article = getHelpArticle('06a-print-catalog-toggles')
    expect(article).toBeDefined()
    expect(article!.group).toBe('2. Build your catalog')
    expect(article!.title).toContain('Print Catalog')
    expect(article!.tool.href).toBe('/admin/catalog')
  })

  it('teaches the seven Print Catalog jobs', () => {
    const text = articleText(getHelpArticle('06a-print-catalog-toggles')!)
    for (const subject of ['Default', 'swatch', 'New badge', 'dry run', 'Sellable check', 'Print Coverage', 'Generate missing sizes']) {
      expect(text, subject).toContain(subject)
    }
  })

  it('never repeats a retired sentence about frames and mats', () => {
    for (const article of helpArticles) {
      const text = articleText(article)
      for (const phrase of RETIRED_PHRASES) {
        expect(text, `${article.slug} / ${phrase}`).not.toContain(phrase)
      }
    }
  })

  it('ties the required DPI to the print type, not to one material', () => {
    const text = articleText(getHelpArticle('06-print-sizes-and-variants')!)
    expect(text).toContain('DPI')
    expect(text).toContain('Each print type carries its own required DPI')
    expect(text).toContain('Paper types generally ask for more detail than canvas')
  })

  it('says a mat is added around the print and can hit the glass limit', () => {
    const text = articleText(getHelpArticle('06-print-sizes-and-variants')!)
    expect(text).toContain('the mat is added around the print')
    expect(text).toContain('glass')
  })

  it('explains why image wrap and paper bleeds are not offered', () => {
    const text = articleText(getHelpArticle('04-upload-artwork')!)
    expect(text).toContain('Image Wrap')
    expect(text).toContain('bleed')
    expect(text).toContain('Mirror Wrap')
  })

  it('promises that a later toggle cannot change a paid order', () => {
    const catalog = articleText(getHelpArticle('06a-print-catalog-toggles')!)
    expect(catalog).toContain('does not rewrite an order')
    const orders = articleText(getHelpArticle('18-manage-orders')!)
    expect(orders).toContain('does not change what this buyer paid for')
  })

  it('keeps every slug that existed before the catalog build', () => {
    const slugs = new Set(helpArticles.map((article) => article.slug))
    for (const slug of [
      '01-start-here', '02-business-details', '03-choose-fulfillment', '04-upload-artwork',
      '05-add-product', '06-print-sizes-and-variants', '07-self-fulfilled-products',
      '08-organize-collections', '09-understand-margins', '10-change-margins',
      '11-shipping-and-profit', '12-sales-tax-and-nexus', '13-texas-sales-tax-setup',
      '14-edit-page-words', '15-add-and-publish-page', '16-update-storefront-images',
      '17-test-your-store', '18-manage-orders', '19-fulfill-and-track-orders',
      '20-daily-business-routine',
    ]) {
      expect(slugs, slug).toContain(slug)
    }
    expect(slugs.size).toBe(helpArticles.length)
  })
})
