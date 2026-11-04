'use client'

import Image from 'next/image'
import { useEffect, useRef, useState, type FormEvent } from 'react'
import { festivePaintings, getFestiveOffer } from './festive-class'

type Painter = { key: number; name: string; painting: string }
/** One buyer, any number of painters, one independently selected canvas per painter. */
export function FestiveSignup({ initialOffer, paymentMode }: {
  initialOffer: ReturnType<typeof getFestiveOffer>
  paymentMode: 'test' | 'live' | null
}) {
  const [offer, setOffer] = useState(initialOffer)
  const [painters, setPainters] = useState<Painter[]>([{ key: 0, name: '', painting: '' }])
  const [count, setCount] = useState('1')
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState('')
  const nextKey = useRef(1)
  const retry = useRef<{ fingerprint: string; id: string; token: string } | null>(null)

  useEffect(() => {
    const refresh = () => setOffer(previous => {
      const current = getFestiveOffer()
      return previous.early === current.early && previous.ended === current.ended ? previous : current
    })
    const timer = window.setInterval(refresh, 1000)
    window.addEventListener('focus', refresh)
    return () => { window.clearInterval(timer); window.removeEventListener('focus', refresh) }
  }, [])

  function changeCount(value: string) {
    setCount(value)
    const quantity = Number(value)
    if (!Number.isSafeInteger(quantity) || quantity < 1) return
    if (quantity * offer.priceCents > 99999999) { setCount(String(painters.length)); setError('That group exceeds the amount Stripe accepts in one payment. Please split it into separate signups.'); return }
    // Add progressively so entering a quantity never removes existing choices.
    setPainters(previous => Array.from({ length: quantity }, (_, index) => previous[index] ?? { key: nextKey.current++, name: '', painting: '' }))
  }

  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault()
    if (busy || !paymentMode) return
    setError('')
    const form = new FormData(event.currentTarget)
    const payload = { name: String(form.get('name')), email: String(form.get('email')), phone: String(form.get('phone')), painters: painters.map(({ name, painting }) => ({ name, painting })) }
    if (painters.some(painter => !painter.painting)) { setError('Please choose a painting for every painter.'); return }
    const fingerprint = JSON.stringify({ payload, price: offer.priceCents })
    if (retry.current?.fingerprint !== fingerprint) retry.current = {
      fingerprint, id: crypto.randomUUID(), token: crypto.randomUUID().replaceAll('-', '') + crypto.randomUUID().replaceAll('-', ''),
    }
    setBusy(true)
    try {
      const response = await fetch('/api/classes/festive/checkout', {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ id: retry.current.id, token: retry.current.token, payload, expectedPrice: offer.priceCents }),
      })
      const result = await response.json() as { url?: string; confirmation?: string; error?: string; priceChanged?: boolean }
      if (result.confirmation) { const destination = new URL(result.confirmation); if (destination.origin === window.location.origin) { window.location.assign(destination.href); return } }
      if (!response.ok || !result.url) {
        if (result.priceChanged) setOffer(getFestiveOffer())
        throw new Error(result.error || 'We could not start payment. Your choices are still here; please try again.')
      }
      const checkout = new URL(result.url)
      if (checkout.protocol !== 'https:' || checkout.hostname !== 'checkout.stripe.com') throw new Error('Payment is temporarily unavailable. Please try again.')
      window.location.assign(checkout.href)
    } catch (failure: unknown) {
      setError(failure instanceof Error ? failure.message : 'We could not start payment. Please try again.')
      setBusy(false)
    }
  }

  if (offer.ended) return <p className="me-closed">Registration has closed for this market.</p>
  const total = new Intl.NumberFormat('en-US', { style: 'currency', currency: 'USD', maximumFractionDigits: 0 }).format(painters.length * offer.priceCents / 100)
  return (
    <form className="me-signup" onSubmit={submit}>
      <fieldset disabled={busy}>
        <legend>1. Your information</legend>
        <p>One contact for your whole group.</p>
        <label>Full name<input name="name" autoComplete="name" required minLength={2} maxLength={120} /></label>
        <div className="me-contact-grid">
          <label>Email<input name="email" type="email" autoComplete="email" required maxLength={254} /></label>
          <label>Phone<input name="phone" type="tel" autoComplete="tel" required minLength={7} maxLength={40} /></label>
        </div>
      </fieldset>
      <fieldset disabled={busy}>
        <legend>2. Who’s painting?</legend>
        <p>Bring yourself, a friend, or the family. Choose a project for each person.</p>
        <label className="me-quantity">Number of painters<input name="quantity" type="number" min={1} step={1} required value={count} onChange={event => changeCount(event.target.value)} onBlur={() => { if (!Number.isSafeInteger(Number(count)) || Number(count) < 1) setCount(String(painters.length)) }} /></label>
        {painters.map((painter, index) => (
          <fieldset className="me-painter" key={painter.key}>
            <legend>Painter {index + 1}</legend>
            <label>Painter’s name <span>(optional)</span><input maxLength={80} value={painter.name} autoComplete="off" onChange={event => setPainters(previous => previous.map(item => item.key === painter.key ? { ...item, name: event.target.value } : item))} /></label>
            <p id={`painting-label-${painter.key}`}>Choose their painting</p>
            <div className="me-painting-choices" role="radiogroup" aria-labelledby={`painting-label-${painter.key}`}>
              {festivePaintings.map(painting => (
                <label className={`me-painting-choice ${painter.painting === painting.id ? 'is-selected' : ''}`} key={painting.id}>
                  <input type="radio" name={`painting-${painter.key}`} value={painting.id} required checked={painter.painting === painting.id} onChange={() => setPainters(previous => previous.map(item => item.key === painter.key ? { ...item, painting: painting.id } : item))} />
                  <Image src={painting.image} alt={painting.alt} width={160} height={200} sizes="(max-width: 760px) 38vw, 180px" />
                  <span>{painting.name}</span>
                </label>
              ))}
            </div>
          </fieldset>
        ))}
        <button type="button" className="me-add-painter" onClick={() => changeCount(String(painters.length + 1))}>+ Add another painter</button>
      </fieldset>
      <div className="me-order-summary" aria-live="polite">
        <div><h3>3. Your total</h3><p>{painters.length} {painters.length === 1 ? 'painter' : 'painters'} × {offer.priceLabel} each</p></div><strong>{total}</strong>
      </div>
      <p className="me-price-detail">All materials included. $20 per painter through November 20; $25 on November 21.</p>
      {paymentMode === 'test' && <p className="me-payment-notice">Test checkout · No real payments. This does not reserve your class.</p>}
      {!paymentMode && <p className="me-payment-notice">Payment setup is in progress. You can choose your projects here; registration will open when checkout is connected.</p>}
      {error && <p className="me-form-error" role="alert">{error}</p>}
      <button className="me-button me-pay-button" disabled={busy || !paymentMode} type="submit">{busy ? 'Opening secure payment…' : paymentMode ? `Continue to ${paymentMode === 'test' ? 'test ' : ''}payment · ${total}` : 'Checkout being connected'}</button>
      <p className="me-small-note">Your registration is confirmed after payment. Card details are entered securely on Stripe.</p>
    </form>
  )
}
