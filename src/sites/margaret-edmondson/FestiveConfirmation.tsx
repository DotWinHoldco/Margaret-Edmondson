'use client'

import { useEffect, useState } from 'react'
import Link from 'next/link'
import { festiveClass, festivePaintings } from './festive-class'
import { FestivePayment, type FestivePaymentDetails } from './FestivePayment'
import type { ArtRegistration } from '@/lib/classes/festive/model'

/** Display only database-confirmed payment; returning from Stripe is not evidence of payment. */
export function FestiveConfirmation() {
  const [order, setOrder] = useState<ArtRegistration | null>(null)
  const [error, setError] = useState('')
  const [refresh, setRefresh] = useState(0)
  const [busy, setBusy] = useState(false)
  const [payment, setPayment] = useState<FestivePaymentDetails | null>(null)
  useEffect(() => {
    const [id, token] = window.location.hash.slice(1).split(':')
    if (window.location.search) window.history.replaceState(null, '', window.location.pathname + window.location.hash)
    let cancelled = false
    let timer: ReturnType<typeof setTimeout> | undefined
    let attempts = 0
    const poll = async () => {
      try {
        if (!id || !token) throw new Error('Missing private link')
        const response = await fetch('/api/classes/festive/registration', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ id, token }) })
        const data = await response.json() as { order?: ArtRegistration; error?: string }
        if (!response.ok || !data.order) throw new Error(data.error || 'We could not check payment yet. Please refresh the status.')
        if (cancelled) return
        setOrder(data.order); setError('')
        if (data.order.status === 'pending' && ++attempts < 12) timer = setTimeout(poll, 5000)
      } catch { if (!cancelled) setError('We could not check payment yet. Keep this private link and refresh the status in a moment.') }
    }
    void poll()
    return () => { cancelled = true; clearTimeout(timer) }
  }, [refresh])

  async function resume() {
    if (!order) return
    const token = window.location.hash.slice(1).split(':')[1]
    setBusy(true); setError('')
    try {
      const response = await fetch('/api/classes/festive/checkout', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ id: order.id, token, payload: order.payload, expectedPrice: order.unit_price }) })
      const data = await response.json() as Partial<FestivePaymentDetails> & { confirmation?: string; error?: string }
      if (data.confirmation) { setRefresh(value => value + 1); return }
      if (!response.ok || !data.clientSecret || !data.mode || !data.amountCents) throw new Error('Unable to resume')
      setPayment({ clientSecret: data.clientSecret, mode: data.mode, amountCents: data.amountCents, id: order.id, token })
    } catch { setError('This checkout could not be reopened. Refresh the status before starting another signup to avoid paying twice.') }
    finally { setBusy(false) }
  }

  return <div className="me-confirmation me-container">
    <p className="me-eyebrow">Festive Paint at the Market</p>
    <h1>{order?.status === 'paid' ? order.mode === 'test' ? 'Test payment received.' : 'You’re painting with us!' : order?.status === 'failed' || order?.status === 'expired' ? 'Payment not completed.' : 'Your registration.'}</h1>
    {error && <p role="alert" className="me-form-error">{error}</p>}
    {!order && !error && <p>Checking your payment…</p>}
    {order && <>
      {order.mode === 'test' && <p className="me-payment-notice">Test registration only. No real payment or class reservation.</p>}
      <p>{order.status === 'paid' ? `Payment received for ${order.payload.painters.length} ${order.payload.painters.length === 1 ? 'painter' : 'painters'}.` : order.status === 'pending' ? 'Payment has not been confirmed yet. If you just paid, keep this page open while we check. Please do not pay again.' : 'This registration is not confirmed. No successful payment has been recorded.'}</p>
      <ul>{order.payload.painters.map((painter, index) => <li key={index}><strong>{painter.name || `Painter ${index + 1}`}</strong>: {festivePaintings.find(item => item.id === painter.painting)?.name}</li>)}</ul>
      <p>Total: <strong>${(order.total / 100).toFixed(2)}</strong> · November 21 · 9 AM–12:30 PM</p>
      <p>Location: <strong>{festiveClass.marketAddress}</strong></p>
      <p>All materials and a pre-drawn 8×10 canvas for every painter are included.</p>
      <p className="me-small-note">Registration reference: {order.id}<br />Save this private page for your records.</p>
      {order.status === 'pending' && !payment && <button className="me-button" onClick={resume} disabled={busy}>{busy ? 'Opening payment…' : 'Return to unfinished checkout'}</button>}
    </>}
    {payment && order?.status !== 'paid' && <FestivePayment payment={payment} />}
    {order?.status !== 'paid' && <p><button className="me-add-painter" onClick={() => setRefresh(value => value + 1)}>Refresh payment status</button></p>}
    <p className="me-back-link"><Link href={festiveClass.path}>← Back to class details</Link></p>
  </div>
}
