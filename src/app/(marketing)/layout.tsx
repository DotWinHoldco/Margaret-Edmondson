import Header from '@/components/shared/Header'
import Footer from '@/components/shared/Footer'
import CartDrawer from '@/components/shared/CartDrawer'
import Providers from '@/components/shared/Providers'
import NewsletterPopup from '@/components/marketing/NewsletterPopup'
import PixelScript from '@/components/marketing/PixelScript'
import PreviewReloadBridge from '@/components/admin/page-editor/PreviewReloadBridge'

export default function MarketingLayout({
  children,
}: {
  children: React.ReactNode
}) {
  return (
    <Providers>
      <PixelScript />
      <Header />
      <main className="pt-16 lg:pt-20">{children}</main>
      <Footer />
      <CartDrawer />
      <NewsletterPopup />
      <PreviewReloadBridge />
    </Providers>
  )
}
