import type { Metadata } from 'next'
import TaxReportClient from './TaxReportClient'

export const metadata: Metadata = {
  title: 'Sales Dashboard | ArtByME',
  robots: { index: false, follow: false },
}

export default function SalesDashboardPage() {
  return <TaxReportClient />
}
