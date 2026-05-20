import Link from 'next/link'
import Image from 'next/image'

const FOOTER_LINKS = {
  Shop: [
    { href: '/shop', label: 'All Artwork' },
    { href: '/shop/originals', label: 'Originals' },
    { href: '/shop/prints', label: 'Prints' },
    { href: '/shop/merchandise', label: 'Merchandise' },
  ],
  Learn: [
    { href: '/classes', label: 'Art Classes' },
    { href: '/blog', label: 'Blog' },
    { href: '/commissions', label: 'Commissions' },
  ],
  About: [
    { href: '/about', label: 'About the Artist' },
    { href: '/cv', label: 'CV' },
    { href: '/contact', label: 'Contact' },
  ],
  Legal: [
    { href: '/shipping-policy', label: 'Shipping Policy' },
    { href: '/privacy', label: 'Privacy Policy' },
    { href: '/tos', label: 'Terms of Service' },
  ],
}

export default function Footer() {
  return (
    <footer className="bg-charcoal text-white/80">
      <div className="mx-auto max-w-7xl px-4 sm:px-6 lg:px-8 py-16">
        <div className="grid grid-cols-2 gap-8 md:grid-cols-4 lg:grid-cols-5">
          {/* Brand */}
          <div className="col-span-2 md:col-span-4 lg:col-span-1 mb-4 lg:mb-0">
            <Link href="/" className="inline-block">
              <Image
                src="/logo.png"
                alt="ArtByMe"
                width={40}
                height={48}
                className="h-10 w-auto invert"
              />
            </Link>
            <p className="mt-3 text-sm font-body text-white/60 max-w-xs">
              Mixed media, painting &amp; collage by Margaret Edmondson. Original artwork, prints, and art classes.
            </p>
          </div>

          {Object.entries(FOOTER_LINKS).map(([title, links]) => (
            <div key={title}>
              <h3 className="text-xs font-body font-semibold uppercase tracking-wider text-white/40 mb-3">
                {title}
              </h3>
              <ul className="space-y-2">
                {links.map((link) => (
                  <li key={link.href}>
                    <Link
                      href={link.href}
                      className="text-sm font-body text-white/60 hover:text-gold transition-colors duration-200"
                    >
                      {link.label}
                    </Link>
                  </li>
                ))}
              </ul>
            </div>
          ))}
        </div>

        <div className="mt-12 pt-8 border-t border-white/10 flex flex-col sm:flex-row items-center justify-between gap-4">
          <p className="text-xs font-body text-white/40">
            &copy; {new Date().getFullYear()} ArtByMe. All rights reserved.
          </p>
          <p className="text-xs font-hand text-white/30">
            made with love &amp; paint
          </p>
        </div>
      </div>
    </footer>
  )
}
