'use client'

import { useCallback, useEffect, useRef, useState } from 'react'
import dynamic from 'next/dynamic'
import type { BillingCommand, BillingOverview } from '@/lib/billing/contracts'

const PaymentMethodForm = dynamic(() => import('./PaymentMethodForm'), { loading: () => <p role="status">Loading secure card fields…</p> })
const date = (value: number) => new Intl.DateTimeFormat('en-US', { dateStyle: 'long', timeZone: 'America/Chicago' }).format(value * 1000)
const money = (value: number, currency: string) => new Intl.NumberFormat('en-US', { style: 'currency', currency }).format(value / 100)
const buttonClass = 'inline-flex min-h-11 items-center justify-center rounded-lg border border-charcoal/15 px-4 py-2 text-sm font-medium text-charcoal hover:bg-cream disabled:opacity-50 focus-visible:outline-2 focus-visible:outline-offset-4 focus-visible:outline-teal'

/** Manage the live subscription entirely within the existing ArtByME account. */
export default function BillingClient() {
  const [billing, setBilling] = useState<BillingOverview | null>(null)
  const [error, setError] = useState('')
  const [notice, setNotice] = useState('')
  const [busy, setBusy] = useState(false)
  const [cancelConfirm, setCancelConfirm] = useState(false)
  const [setup, setSetup] = useState<{ clientSecret: string; publishableKey: string } | null>(null)
  const requestId = useRef<string | null>(null)

  const refresh = useCallback(async () => {
    const response = await fetch('/api/admin/billing', { cache: 'no-store' })
    const data = await response.json()
    if (!response.ok) throw new Error(data.error ?? 'Billing is temporarily unavailable.')
    setBilling(data)
  }, [])

  useEffect(() => { refresh().catch(error => setError(error instanceof Error ? error.message : 'Billing is temporarily unavailable.')) }, [refresh])

  async function command(input: BillingCommand) {
    const response = await fetch('/api/admin/billing', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(input) })
    const data = await response.json()
    if (!response.ok) throw new Error(data.error ?? 'Please try again.')
    return data
  }

  async function startCardUpdate() {
    setBusy(true); setError(''); setNotice('')
    requestId.current ??= crypto.randomUUID()
    try { setSetup(await command({ action: 'begin_card_update', requestId: requestId.current })) }
    catch (error: unknown) { setError(error instanceof Error ? error.message : 'Please try again.') }
    finally { setBusy(false) }
  }

  async function setRenewal(renew: boolean) {
    setBusy(true); setError(''); setNotice('')
    try {
      await command({ action: 'set_renewal', renew, requestId: crypto.randomUUID() })
      await refresh()
      setCancelConfirm(false)
      setNotice(renew ? 'Your subscription will continue renewing.' : 'Future renewals are canceled. Your service continues through the paid period.')
    } catch (error: unknown) { setError(error instanceof Error ? error.message : 'Please try again.') }
    finally { setBusy(false) }
  }

  if (!billing) return <div className="rounded-2xl border border-charcoal/10 bg-white p-6 font-body">
    {error ? <><p role="alert">{error}</p><button className={`${buttonClass} mt-4`} onClick={() => { setError(''); refresh().catch(error => setError(error.message)) }}>Try again</button></> : <p role="status">Loading your subscription…</p>}
  </div>

  const { plan, paymentMethod, invoices, payments } = billing
  const cadence = plan.intervalCount === 1 ? plan.interval : `${plan.intervalCount} ${plan.interval}s`
  return (
    <div className="space-y-6 font-body">
      {error && <p role="alert" className="rounded-lg bg-red-50 p-4 text-sm text-red-800">{error}</p>}
      {notice && <p role="status" className="rounded-lg bg-teal/10 p-4 text-sm text-charcoal">{notice}</p>}
      <section aria-labelledby="current-plan" className="rounded-2xl border border-charcoal/10 bg-white p-6 sm:p-8">
        <div className="flex flex-wrap items-start justify-between gap-4">
          <div><p className="text-xs font-semibold uppercase tracking-wider text-teal">Your website plan</p>
            <h2 id="current-plan" className="mt-2 font-display text-2xl text-charcoal">{plan.name}</h2>
            <p className="mt-1 text-sm text-charcoal/60">Friends and Family Price</p></div>
          <span className="rounded-full bg-teal/10 px-3 py-1 text-sm capitalize text-deep-teal">{plan.cancelAtPeriodEnd ? 'Ends after this period' : plan.status.replaceAll('_', ' ')}</span>
        </div>
        <p className="mt-6 text-3xl font-medium text-charcoal">{money(plan.amount, plan.currency)}<span className="ml-2 text-base font-normal text-charcoal/60">per {cadence}</span></p>
        <p className="mt-3 text-sm text-charcoal">{plan.canManage ? (plan.cancelAtPeriodEnd ? 'Service continues through ' : 'Next payment: ') : 'Last service period ended '}<strong>{date(plan.periodEnd)}</strong></p>
        <p className="mt-2 text-sm text-charcoal/60">{plan.description}</p>
      </section>

      <section aria-labelledby="payment-method" className="rounded-2xl border border-charcoal/10 bg-white p-6 sm:p-8">
        <div className="flex flex-wrap items-center justify-between gap-4">
          <div><h2 id="payment-method" className="font-display text-xl text-charcoal">Payment method</h2>
            <p className="mt-2 text-sm capitalize text-charcoal">{paymentMethod ? `${paymentMethod.brand} ending in ${paymentMethod.last4}` : 'No card on file'}</p>
            {paymentMethod && <p className="mt-1 text-sm text-charcoal/60">Expires {String(paymentMethod.expMonth).padStart(2, '0')}/{paymentMethod.expYear}</p>}</div>
          {plan.canManage && !setup && <button className={buttonClass} disabled={busy} onClick={startCardUpdate}>{busy ? 'Opening…' : 'Update payment method'}</button>}
        </div>
        {setup && <div className="mt-6 border-t border-charcoal/10 pt-6">
          <h3 className="mb-4 font-medium text-charcoal">New payment method</h3>
          <PaymentMethodForm setup={setup} onBusyChange={setBusy} onSaved={async () => { await refresh(); setSetup(null); requestId.current = null; setNotice('Your payment method has been updated for future payments.') }} />
          <button disabled={busy} className="mt-4 min-h-11 text-sm text-charcoal/60 underline disabled:opacity-50" onClick={() => { setSetup(null); requestId.current = null }}>Close without changing your card</button>
        </div>}
        <p className="mt-5 text-sm text-charcoal/60">Billed by DotWin. Billing email: {billing.billing.email}</p>
      </section>

      <section aria-labelledby="invoices" className="rounded-2xl border border-charcoal/10 bg-white p-6 sm:p-8">
        <h2 id="invoices" className="font-display text-xl text-charcoal">Invoices</h2>
        {invoices.length ? <ul className="mt-4 divide-y divide-charcoal/10">{invoices.map(invoice => <li key={invoice.id} className="flex flex-wrap items-center justify-between gap-3 py-4">
          <div><p className="text-sm font-medium">{invoice.number ?? date(invoice.created)}</p><p className="mt-1 text-sm text-charcoal/60">{date(invoice.created)} · {money(invoice.amount, invoice.currency)} · {invoice.status}</p></div>
          {invoice.downloadable && <a className={buttonClass} href={`/api/admin/billing?invoice=${encodeURIComponent(invoice.id)}`} download>Download PDF<span className="sr-only"> for {invoice.number ?? date(invoice.created)}</span></a>}
        </li>)}</ul> : <p className="mt-3 text-sm text-charcoal/60">Your monthly invoices will appear here after your next renewal. Previous payments are listed below.</p>}
      </section>

      <section aria-labelledby="payment-history" className="rounded-2xl border border-charcoal/10 bg-white p-6 sm:p-8">
        <h2 id="payment-history" className="font-display text-xl text-charcoal">Payment history</h2>
        {payments.length ? <ul className="mt-4 divide-y divide-charcoal/10">{payments.map(payment => <li key={payment.id} className="flex flex-wrap items-center justify-between gap-3 py-4">
          <div><p className="text-sm font-medium">{date(payment.created)}</p><p className="mt-1 text-sm text-charcoal/60">{payment.description}</p></div>
          <div className="text-right"><p className="text-sm font-medium">{money(payment.amount, payment.currency)}</p><p className="mt-1 text-sm text-teal">{payment.amountRefunded ? `${money(payment.amountRefunded, payment.currency)} refunded` : 'Paid'}</p></div>
        </li>)}</ul> : <p className="mt-3 text-sm text-charcoal/60">No completed payments yet.</p>}
      </section>

      {plan.canManage && <section aria-labelledby="renewal" className="rounded-2xl border border-charcoal/10 bg-white p-6 sm:p-8">
        <h2 id="renewal" className="font-display text-xl text-charcoal">Subscription renewal</h2>
        {plan.cancelAtPeriodEnd ? <><p className="mt-3 text-sm text-charcoal/70">Your plan will end on {date(plan.periodEnd)}. You can keep it running with the same monthly billing.</p><button className={`${buttonClass} mt-4`} disabled={busy} onClick={() => setRenewal(true)}>Keep my subscription</button></>
          : cancelConfirm ? <div className="mt-4 space-y-4"><p className="text-sm text-charcoal/80">Cancel future renewals? Your website service remains active through {date(plan.periodEnd)}. There will be no further monthly charges after cancellation.</p>
            <div className="flex flex-wrap gap-3"><button className={buttonClass} disabled={busy} onClick={() => setRenewal(false)}>{busy ? 'Saving…' : 'Confirm cancellation'}</button><button className={buttonClass} disabled={busy} onClick={() => setCancelConfirm(false)}>Keep my plan</button></div></div>
            : <><p className="mt-3 text-sm text-charcoal/60">Your plan renews automatically. You can cancel future renewals while keeping the rest of your paid period.</p><button className="mt-4 min-h-11 text-sm text-charcoal/70 underline" disabled={busy} onClick={() => setCancelConfirm(true)}>Cancel subscription</button></>}
      </section>}
    </div>
  )
}
