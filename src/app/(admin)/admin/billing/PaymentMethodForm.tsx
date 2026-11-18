'use client'

import { useMemo, useState } from 'react'
import { Elements, PaymentElement, useElements, useStripe } from '@stripe/react-stripe-js'
import { loadStripe } from '@stripe/stripe-js'

function CardForm({ onSaved, onBusyChange }: { onSaved: () => Promise<void>; onBusyChange: (busy: boolean) => void }) {
  const stripe = useStripe()
  const elements = useElements()
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState('')
  const [confirmedSetup, setConfirmedSetup] = useState<string | null>(null)

  async function submit(event: React.FormEvent) {
    event.preventDefault()
    if (!stripe || !elements || busy) return
    setBusy(true)
    onBusyChange(true)
    setError('')
    try {
      let setupId = confirmedSetup
      if (!setupId) {
        const result = await stripe.confirmSetup({ elements, confirmParams: { return_url: `${window.location.origin}/admin/billing` }, redirect: 'if_required' })
        if (result.error) { setError(result.error.message ?? 'Please check your payment details.'); return }
        if (result.setupIntent?.status !== 'succeeded') { setError('Your payment method is still being verified. Please try again.'); return }
        setupId = result.setupIntent.id
        setConfirmedSetup(setupId)
      }
      const response = await fetch('/api/admin/billing', { method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ action: 'finish_card_update', setupId }) })
      const data = await response.json()
      if (!response.ok) { setError(data.error ?? 'Your card could not be saved. Please try again.'); return }
      await onSaved()
    } catch { setError('Your card could not be saved. Please try again.') }
    finally { setBusy(false); onBusyChange(false) }
  }

  return (
    <form onSubmit={submit} className="space-y-4">
      <PaymentElement options={{ layout: 'tabs' }} />
      <p className="text-sm leading-relaxed text-charcoal/60">Your new payment method will be used for future subscription payments. Saving it does not charge you today.</p>
      {error && <p role="alert" className="text-sm text-red-700">{error}</p>}
      <button type="submit" disabled={!stripe || !elements || busy} className="rounded-lg bg-teal px-5 py-3 text-sm font-medium text-white disabled:opacity-50">
        {busy ? 'Saving…' : 'Save payment method'}
      </button>
    </form>
  )
}

/** Collect card details inside ArtByME with Stripe's secure fields; card numbers never touch either server. */
export default function PaymentMethodForm({ setup, onSaved, onBusyChange }: { setup: { clientSecret: string; publishableKey: string }; onSaved: () => Promise<void>; onBusyChange: (busy: boolean) => void }) {
  const stripe = useMemo(() => loadStripe(setup.publishableKey), [setup.publishableKey])
  return (
    <Elements stripe={stripe} options={{ clientSecret: setup.clientSecret, appearance: { theme: 'stripe', variables: { colorPrimary: '#3A7D7B', colorText: '#2C2C2C', borderRadius: '8px' } } }}>
      <CardForm onSaved={onSaved} onBusyChange={onBusyChange} />
    </Elements>
  )
}
