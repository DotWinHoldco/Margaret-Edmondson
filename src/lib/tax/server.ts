// Server module: imports the request/service client; never import into a client component.
import type Stripe from 'stripe'
import { getStripe, getStripeMode } from '@/lib/stripe'
import { createServiceClient } from '@/lib/supabase/server'
import { collectsTax, normalizeNexusStates, US_STATE_CODES, taxSummary, type TaxConfig } from './config'

/** Money-path read must not silently fall back to tax disabled or a stale cached election. */
export async function getCheckoutTaxConfig(): Promise<TaxConfig> {
  const db = await createServiceClient()
  const { data, error } = await db.from('site_settings').select('tax_enabled,tax_included,tax_nexus_states').eq('id', true).single()
  if (error || !data) throw new Error('Tax settings could not be verified. Please try checkout again.')
  return data
}

export async function getTaxReadiness(states: string[]) {
  const mode = await getStripeMode()
  try {
    const stripe = await getStripe()
    const [settings, registrations] = await Promise.all([
      stripe.tax.settings.retrieve(),
      stripe.tax.registrations.list({ status: 'active', limit: 100 }).autoPagingToArray({ limit: 1000 }),
    ])
    const registeredStates = [...new Set(registrations.filter(r => r.country === 'US' && r.country_options.us?.type === 'state_sales_tax').map(r => r.country_options.us!.state))]
    const missingStates = states.filter(state => !registeredStates.includes(state))
    const ready = settings.status === 'active' && !!settings.defaults.tax_code && missingStates.length === 0 && states.length > 0
    const message = settings.status !== 'active' ? 'Set your business head office address in Stripe Tax settings first.'
      : !settings.defaults.tax_code ? 'Choose the correct product tax code for your art in Stripe Tax settings first.'
      : !states.length ? 'Select the states where your business is registered to collect sales tax.'
      : missingStates.length ? `Add your existing sales tax registration in Stripe for: ${missingStates.join(', ')}. Get your state permit first.`
      : `Stripe Tax is ready in ${mode} mode for your selected states.`
    return { ready, mode, registeredStates, missingStates, message }
  } catch {
    return { ready: false, mode, registeredStates: [] as string[], missingStates: states, message: 'Stripe Tax setup could not be verified. Check the Stripe connection and Tax settings, then try again.' }
  }
}

export interface TaxDestination { country: string; zip: string; state?: string; city?: string; line1?: string; line2?: string }
export async function calculateCheckoutTax(stripe: Stripe, config: TaxConfig, destination: TaxDestination, subtotal: number, discount: number, shipping: number) {
  const state = destination.state?.trim().toUpperCase() || ''
  const applies = collectsTax(config, destination.country, state)
  const included = applies && config.tax_included === true
  if (config.tax_enabled && (!US_STATE_CODES.has(state) || !destination.line1?.trim() || !destination.city?.trim())) {
    throw new Error('Enter your full shipping address so we can calculate sales tax.')
  }
  if (!applies || (subtotal <= discount && shipping === 0)) return { ...taxSummary(subtotal, discount, shipping, 0, false), calculationId: null, taxState: null }
  if (subtotal <= discount) throw new Error('This discount leaves only shipping to pay. Please contact the studio to arrange this order.')
  normalizeNexusStates(config.tax_nexus_states)
  const readiness = await getTaxReadiness([state])
  if (!readiness.ready) throw new Error('Sales tax cannot be verified for this address yet. Please contact the studio before paying.')
  const behavior = included ? 'inclusive' as const : 'exclusive' as const
  const calculation = await stripe.tax.calculations.create({
    currency: 'usd',
    customer_details: { address: { country: 'US', state, postal_code: destination.zip, city: destination.city, line1: destination.line1, line2: destination.line2 }, address_source: 'shipping' },
    // This catalog sells physical art. Use the owner's confirmed account preset tax code.
    line_items: [{ amount: Math.max(0, subtotal - discount), reference: 'artwork', tax_behavior: behavior }],
    ...(shipping > 0 ? { shipping_cost: { amount: shipping, tax_behavior: behavior } } : {}),
  })
  if (calculation.tax_breakdown.some(b => b.taxability_reason === 'not_collecting')) {
    throw new Error('Sales tax setup needs review. Please contact the studio before paying.')
  }
  const tax = calculation.tax_amount_exclusive + calculation.tax_amount_inclusive
  const summary = taxSummary(subtotal, discount, shipping, tax, included)
  if (summary.total !== calculation.amount_total) throw new Error('The tax total could not be verified. Please try again.')
  return { ...summary, calculationId: calculation.id, taxState: state }
}
