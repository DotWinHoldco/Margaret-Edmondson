import Header from '@/components/shared/Header'
import Footer from '@/components/shared/Footer'
import CartDrawer from '@/components/shared/CartDrawer'
import Providers from '@/components/shared/Providers'
import NewsletterPopup from '@/components/marketing/NewsletterPopup'

export default function MarketingLayout({
  children,
}: {
  children: React.ReactNode
}) {
  return (
    <Providers>
      <Header />
      <main className="pt-16 lg:pt-20">{children}</main>
      <Footer />
      <CartDrawer />
      <NewsletterPopup />
    </Providers>
  )
}
