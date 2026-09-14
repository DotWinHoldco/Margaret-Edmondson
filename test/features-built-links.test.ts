import { existsSync, readFileSync } from 'node:fs'
import path from 'node:path'
import { expect, it } from 'vitest'
import { createElement } from 'react'
import { renderToStaticMarkup } from 'react-dom/server'
import { DashboardQuickLinks } from '@/components/admin/DashboardOverview'
import { featuresBuilt } from '@/lib/admin/features-built'
import { getHelpArticle } from '@/lib/help/articles'

it('keeps the Settings feature catalog linked to existing pages and help articles', () => {
  for (const feature of featuresBuilt) {
    for (const link of feature.links) {
      const pathname = link.href.split(/[?#]/)[0]
      if (pathname.startsWith('/admin/help/')) {
        expect(getHelpArticle(pathname.split('/').at(-1)!), link.href).toBeDefined()
      } else {
        expect(existsSync(path.join(process.cwd(), 'src/app/(admin)', pathname, 'page.tsx')), link.href).toBe(true)
      }
    }
  }
})


it('renders dashboard shortcuts to existing tools and the complete order list', () => {
  const container = document.createElement('div')
  container.innerHTML = renderToStaticMarkup(createElement(DashboardQuickLinks))
  const links = [...container.querySelectorAll<HTMLAnchorElement>('a[href]')]
  expect(links.length).toBeGreaterThan(0)
  for (const link of links) {
    const href = link.getAttribute('href')!
    const pathname = href.split(/[?#]/)[0]
    if (pathname.startsWith('/admin/help/')) {
      expect(getHelpArticle(pathname.split('/').at(-1)!), href).toBeDefined()
    } else {
      expect(existsSync(path.join(process.cwd(), 'src/app/(admin)', pathname, 'page.tsx')), href).toBe(true)
    }
  }
  expect(links.find(link => link.textContent === 'All orders')?.getAttribute('href')).toBe('/admin/orders?view=all')
  expect(links.some(link => link.getAttribute('href') === '/admin/pages/design-assets')).toBe(true)
  expect(links.some(link => link.getAttribute('href') === '/admin/help/09-understand-margins')).toBe(true)
})

it('keeps relocated guide links connected to the dashboard, settings, and design anchors', () => {
  const anchors: Record<string, string> = {
    '/admin#sales-tax': 'src/app/(admin)/admin/sales/TaxReportClient.tsx',
    '/admin/settings#features-built': 'src/components/admin/FeaturesBuilt.tsx',
    '/admin/pages/design-assets#homepages': 'src/app/(admin)/admin/pages/design-assets/DesignAssetsView.tsx',
    '/admin/pages/design-assets#funnels': 'src/app/(admin)/admin/pages/design-assets/DesignAssetsView.tsx',
  }
  const guides = ['01-start-here', '12-sales-tax-and-nexus', '13-texas-sales-tax-setup', '20-daily-business-routine'].map(slug => getHelpArticle(slug)!)
  const links = guides.flatMap(guide => [guide.tool, ...(guide.relatedTools || [])])
  for (const [href, component] of Object.entries(anchors)) {
    expect(links.some(link => link.href === href), href).toBe(true)
    expect(readFileSync(path.join(process.cwd(), component), 'utf8'), href).toContain(`id="${href.split('#')[1]}"`)
  }
  expect(links.some(link => link.href.startsWith('/admin/sales'))).toBe(false)
})
