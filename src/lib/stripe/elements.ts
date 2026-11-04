'use client'

// Shared on-site Stripe configuration used by the shop and class checkout.
import { loadStripe, type Stripe as StripeJs, type Appearance } from '@stripe/stripe-js'
import { stripePublishableKey } from './publishable-key'

// NEXT_PUBLIC_* vars are inlined at build time — reference both literally and
// pick at runtime based on the mode the server resolved from site settings.
const PK_LIVE = process.env.NEXT_PUBLIC_STRIPE_PUBLISHABLE_KEY || ''
const PK_TEST = process.env.NEXT_PUBLIC_STRIPE_PUBLISHABLE_KEY_TEST || ''

let stripePromise: Promise<StripeJs | null> | null = null
let stripePromiseKey = ''
/** Reuse Stripe.js for the active production or sandbox publishable key. */
export function getStripeJs(mode: 'test' | 'live'): Promise<StripeJs | null> | null {
  const pk = stripePublishableKey(mode, { live: PK_LIVE, test: PK_TEST })
  if (!pk) return null
  if (!stripePromise || stripePromiseKey !== pk) {
    stripePromise = loadStripe(pk)
    stripePromiseKey = pk
  }
  return stripePromise
}

// Match the site theme (globals.css tokens) inside Stripe's iframes.
export const appearance: Appearance = {
  variables: {
    colorPrimary: '#3A7D7B', // --teal
    colorBackground: '#FFFFFF',
    colorText: '#2C2C2C', // --charcoal
    colorDanger: '#D4654A', // --coral
    borderRadius: '2px',
    fontFamily: '"Playfair Display", Georgia, serif',
    fontSizeBase: '15px',
  },
  rules: {
    '.Input': { borderColor: 'rgba(44, 44, 44, 0.15)' },
    '.Input:focus': { borderColor: '#3A7D7B', boxShadow: 'none' },
    '.Label': {
      textTransform: 'uppercase',
      letterSpacing: '0.05em',
      fontSize: '11px',
      color: 'rgba(44, 44, 44, 0.55)',
    },
  },
}

export const elementsFonts = [
  { cssSrc: 'https://fonts.googleapis.com/css2?family=Playfair+Display:wght@400;500;600&display=swap' },
]

