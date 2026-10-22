import Link from 'next/link'
import Image from 'next/image'
import FooterNewsletter from './FooterNewsletter'
import { getSiteSettings } from '@/lib/settings/accessor'

// Simple official-glyph paths (24×24 viewBox), drawn with currentColor.
const SOCIAL_ICON_PATHS: Record<string, string> = {
  Instagram:
    'M12 2.163c3.204 0 3.584.012 4.85.07 3.252.148 4.771 1.691 4.919 4.919.058 1.265.069 1.645.069 4.849 0 3.205-.012 3.584-.069 4.849-.149 3.225-1.664 4.771-4.919 4.919-1.266.058-1.644.07-4.85.07-3.204 0-3.584-.012-4.849-.07-3.26-.149-4.771-1.699-4.919-4.92-.058-1.265-.07-1.644-.07-4.849 0-3.204.013-3.583.07-4.849.149-3.227 1.664-4.771 4.919-4.919 1.266-.057 1.645-.069 4.849-.069zm0-2.163c-3.259 0-3.667.014-4.947.072-4.358.2-6.78 2.618-6.98 6.98-.059 1.281-.073 1.689-.073 4.948 0 3.259.014 3.668.072 4.948.2 4.358 2.618 6.78 6.98 6.98 1.281.058 1.689.072 4.948.072 3.259 0 3.668-.014 4.948-.072 4.354-.2 6.782-2.618 6.979-6.98.059-1.28.073-1.689.073-4.948 0-3.259-.014-3.667-.072-4.947-.196-4.354-2.617-6.78-6.979-6.98-1.281-.059-1.69-.073-4.949-.073zm0 5.838c-3.403 0-6.162 2.759-6.162 6.162s2.759 6.163 6.162 6.163 6.162-2.759 6.162-6.163c0-3.403-2.759-6.162-6.162-6.162zm0 10.162c-2.209 0-4-1.79-4-4 0-2.209 1.791-4 4-4s4 1.791 4 4c0 2.21-1.791 4-4 4zm6.406-11.845c-.796 0-1.441.645-1.441 1.44s.645 1.44 1.441 1.44c.795 0 1.439-.645 1.439-1.44s-.644-1.44-1.439-1.44z',
  Facebook:
    'M24 12.073c0-6.627-5.373-12-12-12s-12 5.373-12 12c0 5.99 4.388 10.954 10.125 11.854v-8.385H7.078v-3.47h3.047V9.43c0-3.007 1.792-4.669 4.533-4.669 1.312 0 2.686.235 2.686.235v2.953H15.83c-1.491 0-1.956.925-1.956 1.874v2.25h3.328l-.532 3.47h-2.796v8.385C19.612 23.027 24 18.062 24 12.073z',
  LinkedIn:
    'M20.447 20.452h-3.554v-5.569c0-1.328-.027-3.037-1.852-3.037-1.853 0-2.136 1.445-2.136 2.939v5.667H9.351V9h3.414v1.561h.049c.476-.9 1.637-1.85 3.37-1.85 3.601 0 4.267 2.37 4.267 5.455v6.286zM5.337 7.433a2.062 2.062 0 1 1 0-4.124 2.062 2.062 0 0 1 0 4.124zM7.119 20.452H3.555V9h3.564v11.452zM22.225 0H1.771C.792 0 0 .774 0 1.729v20.542C0 23.227.792 24 1.771 24h20.451C23.2 24 24 23.227 24 22.271V1.729C24 .774 23.2 0 22.222 0h.003z',
  Pinterest:
    'M12 0c-6.627 0-12 5.372-12 12 0 5.084 3.163 9.426 7.627 11.174-.105-.949-.2-2.405.042-3.441.218-.937 1.407-5.965 1.407-5.965s-.359-.719-.359-1.782c0-1.668.967-2.914 2.171-2.914 1.023 0 1.518.769 1.518 1.69 0 1.029-.655 2.568-.994 3.995-.283 1.194.599 2.169 1.777 2.169 2.133 0 3.772-2.249 3.772-5.495 0-2.873-2.064-4.882-5.012-4.882-3.414 0-5.418 2.561-5.418 5.207 0 1.031.397 2.138.893 2.738.098.119.112.224.083.345l-.333 1.36c-.053.22-.174.267-.402.161-1.499-.698-2.436-2.889-2.436-4.649 0-3.785 2.75-7.262 7.929-7.262 4.163 0 7.398 2.967 7.398 6.931 0 4.136-2.607 7.464-6.227 7.464-1.216 0-2.359-.631-2.75-1.378l-.748 2.853c-.271 1.043-1.002 2.35-1.492 3.146 1.124.347 2.317.535 3.554.535 6.627 0 12-5.373 12-12 0-6.628-5.373-12-12-12z',
}

const FOOTER_LINKS = {
  Shop: [
    { href: '/shop', label: 'Shop' },
    { href: '/commissions', label: 'Commissions' },
    { href: '/cart', label: 'Cart' },
  ],
  Learn: [
    { href: '/classes', label: 'Classes & Courses' },
    { href: '/classes#online-courses', label: 'Learn at Home' },
  ],
  About: [
    { href: '/about', label: 'About the Artist' },
    { href: '/reviews', label: 'Reviews' },
    { href: '/contact', label: 'Contact' },
  ],
  Legal: [
    { href: '/shipping-policy', label: 'Shipping Policy' },
    { href: '/privacy', label: 'Privacy Policy' },
    { href: '/tos', label: 'Terms of Service' },
  ],
}

export default async function Footer() {
  // Social links come from site settings; fail-soft to no icons.
  let socialLinks: Array<{ label: string; href: string }> = []
  try {
    const s = await getSiteSettings()
    socialLinks = [
      { label: 'Instagram', href: s.instagram_url || '' },
      { label: 'Facebook', href: s.facebook_url || '' },
      { label: 'LinkedIn', href: s.linkedin_url || '' },
      { label: 'Pinterest', href: s.pinterest_url || '' },
    ].filter((l) => !!l.href)
  } catch {
    socialLinks = []
  }

  return (
    <footer className="bg-charcoal text-white/80">
      <div className="mx-auto max-w-7xl px-4 sm:px-6 lg:px-8 py-16">
        <FooterNewsletter />
        <div className="grid grid-cols-2 gap-8 md:grid-cols-4 lg:grid-cols-5">
          {/* Brand */}
          <div className="col-span-2 md:col-span-4 lg:col-span-1 mb-4 lg:mb-0">
            <Link href="/" className="inline-block">
              <Image
                src="/logo.png"
                alt="ArtByME"
                width={40}
                height={48}
                className="h-10 w-auto invert"
              />
            </Link>
            <p className="mt-3 text-sm font-body text-white/60 max-w-xs">
              Mixed media, painting &amp; collage by Margaret Edmondson. Original artwork, prints, and art classes.
            </p>
            {socialLinks.length > 0 && (
              <div className="mt-4 flex flex-wrap items-center gap-2">
                {socialLinks.map((link) => (
                  <a
                    key={link.label}
                    href={link.href}
                    target="_blank"
                    rel="noopener"
                    aria-label={link.label}
                    title={link.label}
                    className="flex h-11 w-11 items-center justify-center rounded-full border border-white/20 text-white/80 hover:text-gold hover:border-gold focus-visible:outline-2 focus-visible:outline-gold transition-colors duration-200"
                  >
                    <svg
                      className="h-5 w-5"
                      viewBox="0 0 24 24"
                      fill="currentColor"
                      aria-hidden="true"
                    >
                      <path d={SOCIAL_ICON_PATHS[link.label]} />
                    </svg>
                  </a>
                ))}
              </div>
            )}
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
            &copy; {new Date().getFullYear()} ArtByME. All rights reserved.
          </p>
          <p className="text-xs font-hand text-white/30">
            made with love &amp; paint
          </p>
        </div>
      </div>
    </footer>
  )
}
