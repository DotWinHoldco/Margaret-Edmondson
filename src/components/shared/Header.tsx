'use client'

import Link from 'next/link'
import Image from 'next/image'
import { useState } from 'react'
import { useCart } from '@/lib/cart/context'

const NAV_LINKS = [
  { href: '/shop', label: 'Shop' },
  { href: '/commissions', label: 'Commissions' },
  { href: '/classes', label: 'Classes' },
  { href: '/blog', label: 'Blog' },
  { href: '/about', label: 'About' },
  { href: '/contact', label: 'Contact' },
]

export default function Header() {
  const [mobileOpen, setMobileOpen] = useState(false)
  const { dispatch, itemCount } = useCart()

  return (
    <header className="fixed top-0 left-0 right-0 z-50 bg-cream/90 backdrop-blur-md border-b border-charcoal/5">
      <div className="mx-auto max-w-7xl px-4 sm:px-6 lg:px-8">
        <div className="flex h-16 items-center justify-between lg:h-20">
          {/* Logo */}
          <Link href="/" className="flex items-center gap-2">
            <Image
              src="/margaret edmondson logo with art by prefix.png"
              alt="ArtByME — Margaret Edmondson"
              width={2365}
              height={892}
              className="h-10 w-auto lg:h-12"
              priority
            />
          </Link>

          {/* Desktop Nav */}
          <nav className="hidden lg:flex items-center gap-8">
            {NAV_LINKS.map((link) => (
              <Link
                key={link.href}
                href={link.href}
                className="text-sm font-body font-medium text-charcoal/70 hover:text-teal transition-colors duration-200"
              >
                {link.label}
              </Link>
            ))}
          </nav>

          {/* Right actions */}
          <div className="flex items-center gap-4">
            <Link
              href="/account"
              className="hidden sm:block text-sm font-body font-medium text-charcoal/70 hover:text-teal transition-colors"
            >
              Account
            </Link>
            <button
              onClick={() => dispatch({ type: 'TOGGLE_CART' })}
              className="relative p-2 text-charcoal/70 hover:text-teal transition-colors"
              aria-label="Open cart"
            >
              <svg className="h-5 w-5" fill="none" viewBox="0 0 24 24" strokeWidth={1.5} stroke="currentColor">
                <path strokeLinecap="round" strokeLinejoin="round" d="M15.75 10.5V6a3.75 3.75 0 1 0-7.5 0v4.5m11.356-1.993 1.263 12c.07.665-.45 1.243-1.119 1.243H4.25a1.125 1.125 0 0 1-1.12-1.243l1.264-12A1.125 1.125 0 0 1 5.513 7.5h12.974c.576 0 1.059.435 1.119 1.007ZM8.625 10.5a.375.375 0 1 1-.75 0 .375.375 0 0 1 .75 0Zm7.5 0a.375.375 0 1 1-.75 0 .375.375 0 0 1 .75 0Z" />
              </svg>
              {itemCount > 0 && (
                <span className="absolute -top-1 -right-1 flex h-4 w-4 items-center justify-center rounded-full bg-teal text-[10px] font-bold text-white">
                  {itemCount}
                </span>
              )}
            </button>

            {/* Mobile menu button */}
            <button
              onClick={() => setMobileOpen(!mobileOpen)}
              className="lg:hidden p-2 text-charcoal/70"
              aria-label="Toggle menu"
            >
              <svg className="h-5 w-5" fill="none" viewBox="0 0 24 24" strokeWidth={1.5} stroke="currentColor">
                {mobileOpen ? (
                  <path strokeLinecap="round" strokeLinejoin="round" d="M6 18 18 6M6 6l12 12" />
                ) : (
                  <path strokeLinecap="round" strokeLinejoin="round" d="M3.75 6.75h16.5M3.75 12h16.5m-16.5 5.25h16.5" />
                )}
              </svg>
            </button>
          </div>
        </div>
      </div>

      {/* Mobile Nav */}
      {mobileOpen && (
        <div className="lg:hidden border-t border-charcoal/5 bg-cream">
          <nav className="flex flex-col px-4 py-4 gap-1">
            {NAV_LINKS.map((link) => (
              <Link
                key={link.href}
                href={link.href}
                onClick={() => setMobileOpen(false)}
                className="py-2 text-base font-body font-medium text-charcoal/70 hover:text-teal transition-colors"
              >
                {link.label}
              </Link>
            ))}
            <Link
              href="/account"
              onClick={() => setMobileOpen(false)}
              className="py-2 text-base font-body font-medium text-charcoal/70 hover:text-teal transition-colors"
            >
              Account
            </Link>
          </nav>
        </div>
      )}
    </header>
  )
}
