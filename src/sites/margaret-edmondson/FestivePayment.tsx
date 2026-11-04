'use client'

import { useState, type FormEvent } from 'react'
import { Elements, PaymentElement, useElements, useStripe } from '@stripe/react-stripe-js'
import { appearance, elementsFonts, getStripeJs } from '@/lib/stripe/elements'
import { festiveClass } from './festive-class'

export type FestivePaymentDetails = { clientSecret: string; mode: 'test' | 'live'; amountCents: number; id: string; token: string }

/** The class uses the shop's exact Stripe theme and runtime account selection. */
export function FestivePayment({ payment }: { payment: FestivePaymentDetails }) {
  const stripe = getStripeJs(payment.mode)
  if (!stripe) return <p role="alert" className="me-form-error">Secure payment is temporarily unavailable. Please refresh this page.</p>
  return <div className="me-signup me-embedded-payment">
    <h3>Secure payment</h3>
    <p>Total: <strong>${(payment.amountCents / 100).toFixed(2)}</strong></p>
    {payment.mode === 'test' && <p className="me-payment-notice">Test payment only. No real payment or class reservation.</p>}
    <Elements stripe={stripe} options={{ clientSecret: payment.clientSecret, appearance, fonts: elementsFonts }}>
      <PaymentForm payment={payment} />
    </Elements>
  </div>
}

function PaymentForm({ payment }: { payment: FestivePaymentDetails }) {
  const stripe = useStripe()
  const elements = useElements()
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState('')
  async function pay(event: FormEvent) {
    event.preventDefault()
    if (!stripe || !elements || busy) return
    setBusy(true); setError('')
    try {
      const confirmation = `${window.location.origin}${festiveClass.path}/confirmation#${payment.id}:${payment.token}`
      const result = await stripe.confirmPayment({ elements, confirmParams: { return_url: confirmation }, redirect: 'if_required' })
      if (result.error) throw new Error(result.error.message || 'Payment could not be completed. Please try again.')
      // Reload also refreshes settlement polling when resuming on the confirmation page.
      // eslint-disable-next-line @next/next/no-location-assign-relative-destination
      window.location.assign(confirmation)
    } catch (failure) { setError(failure instanceof Error ? failure.message : 'Payment could not be completed. Please try again.'); setBusy(false) }
  }
  return <form onSubmit={pay}>
    <PaymentElement />
    {error && <p className="me-form-error" role="alert">{error}</p>}
    <button type="submit" className="me-button me-pay-button" disabled={!stripe || !elements || busy}>{busy ? 'Processing payment…' : `Pay $${(payment.amountCents / 100).toFixed(2)}`}</button>
    <p className="me-small-note">Your registration is confirmed after payment.</p>
  </form>
}
