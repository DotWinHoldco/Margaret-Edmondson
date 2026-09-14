import { helpArticles } from '@/lib/help/articles'

// Maintenance: update this catalog when a working feature is added, removed, or
// renamed. Verify destination pages and actual behavior; do not restore fixed
// artwork/page/API/code counts, assume connected services are active, or describe
// planned features as delivered. The link regression test checks local routes.
export const featuresBuilt = [
  {
    title: 'Shop and artwork',
    description: 'Add original art and prints, organize products, manage sizes and prices, and choose product photos. Buyers can use a saved cart and Stripe checkout that checks product prices again before payment.',
    links: [{ label: 'Products', href: '/admin/products' }, { label: 'Media library', href: '/admin/media' }],
  },
  {
    title: 'Prices, margins, and sales tax',
    description: 'Set studio prices or cost-based markup, with shop, category, product, and size settings. Choose tax included in the price or added separately, and select nexus states. Tax collection checks your Stripe Tax setup.',
    links: [{ label: 'Pricing settings', href: '/admin/settings#pricing' }, { label: 'Sales tax settings', href: '/admin/settings#sales-tax' }, { label: 'Margin guide', href: '/admin/help/09-understand-margins' }],
  },
  {
    title: 'Sales dashboard and orders',
    description: 'Review saved live sales, recent orders, and tax by delivery state for 30 days, 90 days, 365 days, this quarter, or this year. Refund and missing-record notes explain what needs review. These figures do not show tax payments made to a state.',
    links: [{ label: 'Dashboard', href: '/admin' }, { label: 'Orders', href: '/admin/orders' }],
  },
  {
    title: 'Production and shipping',
    description: 'Choose Lumaprints or studio fulfillment, record production and shipping progress, and review orders that need attention. Provider connections include Lumaprints, Printful, and ShipStation; each needs its own setup. Failed print-provider submissions can retry and show when they need attention.',
    links: [{ label: 'Orders and studio work', href: '/admin/orders' }, { label: 'Fulfillment guide', href: '/admin/help/03-choose-fulfillment' }, { label: 'Connections', href: '/admin/settings' }],
  },
  {
    title: 'Pages and design assets',
    description: 'Edit page wording and sections, manage blog posts, and update FAQs and testimonials. Browse homepage and funnel design assets. Keep display pictures, product photos, print masters, and shared files organized.',
    links: [{ label: 'Pages', href: '/admin/pages' }, { label: 'Design assets', href: '/admin/pages/design-assets' }, { label: 'Blog', href: '/admin/blog' }, { label: 'FAQ and testimonials', href: '/admin/faq-testimonials' }, { label: 'Shared files', href: '/admin/files' }],
  },
  {
    title: 'Artwork sales funnels',
    description: 'Create and publish a sales page for an artwork, choose its design, and offer product options through the cart. Review recorded views, cart additions, and purchases for each funnel.',
    links: [{ label: 'Funnels', href: '/admin/funnels' }, { label: 'Funnel designs', href: '/admin/pages/design-assets#funnels' }],
  },
  {
    title: 'Email and customer tools',
    description: 'Manage customers and subscribers, prepare email campaigns and templates, and create promo codes. Abandoned-cart emails and Meta purchase tracking are available when their services and settings are configured.',
    links: [{ label: 'Customers', href: '/admin/customers' }, { label: 'Email', href: '/admin/email' }, { label: 'Subscribers', href: '/admin/subscribers' }, { label: 'Promo codes and connections', href: '/admin/settings' }],
  },
  {
    title: 'Commissions',
    description: 'Review custom-art requests, follow their status, and keep client messages with the commission.',
    links: [{ label: 'Commissions', href: '/admin/commissions' }],
  },
  {
    title: 'Classes and courses',
    description: 'Manage class bookings and online courses with modules and lessons. Course tools support video lessons, enrollment, student progress, and lesson comments.',
    links: [{ label: 'Classes', href: '/admin/classes' }, { label: 'Courses', href: '/admin/courses' }],
  },
  {
    title: 'Help and business settings',
    description: `${helpArticles.length} illustrated help articles walk through setup, products, margins, tax, page edits, and daily work. Settings also hold business details, site options, and connection status.`,
    links: [{ label: 'Help and guides', href: '/admin/help' }, { label: 'Start here', href: '/admin/help/01-start-here' }],
  },
] as const
