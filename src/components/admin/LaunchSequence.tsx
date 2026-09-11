'use client'

import { useCallback, useEffect, useRef, useState } from 'react'
import { usePathname, useRouter } from 'next/navigation'
import type { FulfillmentPolicy } from '@/lib/fulfillment/policy'
import { prepSteps, type LaunchPath, type LaunchStepKey } from '@/lib/launch/steps'
import type { LaunchState } from '@/lib/launch/types'
import LaunchGuideContent, { GuideLink, STEP_TITLES, type ShippingChoice } from './LaunchGuideContent'

async function jsonRequest(url: string, body?: unknown, signal?: AbortSignal) {
  const response = await fetch(url, body === undefined ? { signal, cache: 'no-store' } : {
    method: 'PATCH', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body), signal,
  })
  const data = await response.json()
  if (!response.ok) throw new Error(data.error || 'Could not save. Please try again.')
  return data
}

/** Available throughout the admin workspace; closing affects only this mounted visit. */
export default function LaunchSequence() {
  const pathname = usePathname()
  const router = useRouter()
  const skip = pathname.startsWith('/admin/security/mfa')
  const [state, setState] = useState<LaunchState | null>(null)
  const stateRef = useRef<LaunchState | null>(null)
  const [policy, setPolicy] = useState<FulfillmentPolicy | null>(null)
  const [inFlight, setInFlight] = useState(0)
  const [open, setOpen] = useState(true)
  const [path, setPath] = useState<LaunchPath | null>(null)
  const [cursor, setCursor] = useState(0)
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState('')
  const [message, setMessage] = useState('')
  const [confirmLaunch, setConfirmLaunch] = useState(false)
  const dialog = useRef<HTMLDialogElement>(null)
  const scroll = useRef<HTMLDivElement>(null)
  const heading = useRef<HTMLHeadingElement>(null)

  const acceptState = useCallback((next: LaunchState) => {
    stateRef.current = next
    setState(next)
  }, [])
  const load = useCallback(async (signal?: AbortSignal) => {
    const [launch, fulfillment] = await Promise.all([
      jsonRequest('/api/admin/launch', undefined, signal),
      jsonRequest('/api/admin/fulfillment-settings', undefined, signal),
    ])
    if (signal?.aborted) return
    acceptState(launch)
    setPolicy(fulfillment.policy)
    setInFlight(fulfillment.inFlight || 0)
    return launch as LaunchState
  }, [acceptState])

  useEffect(() => {
    if (skip) return
    const controller = new AbortController()
    void load(controller.signal).catch(() => {
      if (!controller.signal.aborted) setError('The launch guide could not load. Use the Launch guide button to try again.')
    })
    return () => controller.abort()
  }, [load, skip])
  useEffect(() => {
    const node = dialog.current
    if (open && state && !skip && node && !node.open) node.showModal()
  }, [open, state, skip])
  useEffect(() => {
    heading.current?.focus({ preventScroll: true })
    const panel = heading.current?.closest('section')
    if (scroll.current) {
      scroll.current.scrollTop = panel
        ? scroll.current.scrollTop + panel.getBoundingClientRect().top - scroll.current.getBoundingClientRect().top - 16
        : 0
    }
  }, [cursor, path])

  async function run(work: () => Promise<void>) {
    if (busy) return
    setBusy(true)
    setError('')
    setMessage('')
    setConfirmLaunch(false)
    try { await work() } catch (e) { setError(e instanceof Error ? e.message : 'Could not save. Please try again.') }
    finally { setBusy(false) }
  }
  async function patchLaunch(body: Record<string, unknown>) {
    const next = await jsonRequest('/api/admin/launch', { ...body, updatedAt: stateRef.current?.updatedAt })
    acceptState(next)
  }
  async function savePolicy(next: FulfillmentPolicy) {
    const result = await jsonRequest('/api/admin/fulfillment-settings', next)
    setPolicy(result.policy)
    await load()
    router.refresh()
  }
  async function mark(step: LaunchStepKey, done: boolean, advance = false) {
    await patchLaunch({ step, done })
    setMessage(done ? 'Your progress is saved.' : 'This step is ready for another review.')
    if (advance) setCursor(i => i + 1)
  }
  function choose(next: LaunchPath) {
    setPath(next)
    setCursor(0)
    setConfirmLaunch(false)
    setError('')
    setMessage('')
  }
  function close() {
    if (busy) return
    dialog.current?.close()
    setOpen(false)
    setConfirmLaunch(false)
  }
  async function reopen() {
    await run(async () => { await load(); setOpen(true) })
  }
  if (skip) return null
  if (!state || !policy || !open) return <div className="fixed bottom-6 right-4 z-[90] max-w-[calc(100%_-_2rem)] sm:right-6">
    {error && <p role="alert" className="mb-2 max-w-sm rounded-lg border border-coral/30 bg-white p-3 font-body text-sm text-charcoal">{error}</p>}
    <button type="button" disabled={busy} onClick={() => void reopen()} className="min-h-12 rounded-full bg-teal px-6 py-3 font-body font-semibold text-white shadow-lg hover:bg-deep-teal disabled:opacity-50">{busy ? 'Opening guide…' : 'Launch guide'}</button>
  </div>

  const selectedLuma = path === 'lumaprints'
  const steps = prepSteps(selectedLuma)
  const done = steps.filter(k => state.steps[k]?.done).length
  const step = steps[cursor]
  const reviewing = path !== null && !step
  const currentPath = state.lumaprintsEnabled ? 'Lumaprints fulfillment' : 'Self-fulfillment with your contact'
  const selectedIsActive = path === (state.lumaprintsEnabled ? 'lumaprints' : 'studio')
  const saveContact = async (notes: Record<string, string>) => run(async () => {
    await patchLaunch({ notes, step: 'studio_partner', done: true })
    setMessage('Your contact plan is saved.')
    setCursor(i => i + 1)
  })
  const saveShipping = async (choice: ShippingChoice) => run(async () => {
    await savePolicy({ ...policy, ...choice })
    await mark(selectedLuma ? 'luma_shipping' : 'studio_shipping', true, true)
  })
  const activateLivePayments = async () => run(async () => {
    await jsonRequest('/api/admin/settings/stripe-mode', { testMode: false })
    await load()
    setMessage('Stripe is set to live payments. Complete the launch review before opening the shop.')
    router.refresh()
  })
  const goLive = async () => run(async () => {
    await jsonRequest('/api/admin/settings/gate', { enabled: false })
    await load()
    setMessage('Your store is open. The visitor password has been removed.')
    router.refresh()
  })

  return <dialog ref={dialog} aria-labelledby="launch-guide-title" onCancel={e => { e.preventDefault(); close() }} className="m-auto max-h-[94dvh] w-[calc(100%_-_1rem)] max-w-6xl overflow-hidden rounded-2xl border-0 bg-cream p-0 text-charcoal shadow-2xl backdrop:bg-charcoal/55 sm:w-[calc(100%_-_3rem)]">
    <div className="flex max-h-[94dvh] flex-col font-body">
      <header className="shrink-0 border-b border-charcoal/15 px-5 py-5 sm:px-8">
        <div className="flex items-start justify-between gap-4">
          <div><h2 id="launch-guide-title" className="font-display text-3xl font-bold sm:text-4xl">Your website is built, Margaret.</h2></div>
          <button type="button" onClick={close} disabled={busy} className="min-h-11 shrink-0 rounded-lg border border-charcoal/20 px-3 text-sm font-semibold hover:bg-white disabled:opacity-50" aria-label="Close launch guide for this visit">Close</button>
        </div>
      </header>
      <div ref={scroll} className="min-h-0 overflow-y-auto overscroll-contain">
        <div className="border-b border-charcoal/10 px-5 pb-4 sm:px-8"><p className="mt-2 max-w-3xl text-sm leading-relaxed text-charcoal/75">Your storefront, checkout, and order tools are ready for your business setup. Only you can supply the answers about your artwork, prices, production contact, and business account. This guide helps you turn those decisions into a working shop.</p><p className="mt-3 text-xs text-charcoal/60">Closing keeps the guide available in the corner. It reopens when you start a new admin visit, and never hides it for another person.</p></div>
        <div className="border-b border-charcoal/10 bg-white px-5 py-4 sm:px-8">
          <div className="flex flex-wrap items-center justify-between gap-4">
            <div><p className="text-sm text-charcoal/65">Currently selected for new orders</p><p className="font-semibold">{currentPath}</p></div>
            <label className="flex min-h-12 cursor-pointer items-center gap-3 rounded-lg border border-teal/25 p-3 text-sm font-semibold">
              <span>Self-fulfillment with my contact</span>
              <input type="checkbox" role="switch" aria-label="Self-fulfillment with my contact" className="peer sr-only" checked={!policy.lumaprints_enabled} disabled={busy} onChange={e => {
                const studio = e.target.checked
                void run(async () => { await savePolicy({ ...policy, lumaprints_enabled: !studio }); choose(studio ? 'studio' : 'lumaprints'); setMessage(studio ? 'Self-fulfillment is on. Lumaprints requests are off.' : 'Lumaprints is on for new eligible prints.') })
              }} />
              <span aria-hidden className="relative h-7 w-12 shrink-0 rounded-full bg-charcoal/25 after:absolute after:left-1 after:top-1 after:h-5 after:w-5 after:rounded-full after:bg-white after:transition-transform peer-checked:bg-teal peer-checked:after:translate-x-5 peer-focus-visible:ring-2 peer-focus-visible:ring-teal peer-focus-visible:ring-offset-2" />
              <span>{policy.lumaprints_enabled ? 'Off' : 'On'}</span>
            </label>
          </div>
          <p className="mt-3 max-w-4xl text-sm text-charcoal/70">On: new artwork orders go to your studio queue, with no Lumaprints requests. Off: eligible prints use Lumaprints; originals stay with you. Both pricing profiles stay saved. Existing paid orders keep their fulfillment method.</p>
          {inFlight > 0 && <p className="mt-3 rounded-lg bg-gold/15 p-3 text-sm">{inFlight} printer submission{inFlight === 1 ? ' is' : 's are'} in progress. Check those orders before assigning the same work to your contact.</p>}
          {state.connections.preview && <p className="mt-3 text-sm text-charcoal/70">You are viewing a preview. Fulfillment, shipping, and product edits here save to the existing store database. The final store-opening step is available on the live website.</p>}
        </div>
        <div className="px-5 pt-4 sm:px-8">
          {error && <div role="alert" className="mb-4 rounded-lg border border-coral/40 bg-white p-4 text-sm"><p>{error}</p><button type="button" disabled={busy} onClick={() => void run(async () => { await load(); setMessage('Setup refreshed. Review your entries before saving again.') })} className="mt-2 font-semibold text-teal underline">Refresh setup</button></div>}
          {message && <p role="status" className="mb-4 rounded-lg bg-teal/10 p-3 text-sm">{message}</p>}
        </div>
        {path === null ? <div className="space-y-6 px-5 pb-8 sm:px-8">
          <h3 className="font-display text-2xl font-semibold">Two ways to run your shop</h3>
          <div className="grid gap-5 md:grid-cols-2">
            <PathCard title="1. Lumaprints fulfillment" action="Explore Lumaprints setup" busy={busy} onChoose={() => choose('lumaprints')}>
              <p>Lumaprints prints, frames where selected, and ships eligible print orders. You set the retail price and manage the customer relationship. You still handle originals.</p>
              <p className="mt-3">You need your Lumaprints account and billing method, approved files and options, prices that cover costs, and a working Stripe account.</p>
              <p className="mt-3 font-medium">Use it when you want a connected print provider to do the physical work.</p>
            </PathCard>
            <PathCard title="2. Self-fulfillment with your contact" action="Walk me through self-fulfillment" busy={busy} onChoose={() => choose('studio')}>
              <p>You receive and manage orders in your studio queue. Your contact prints, frames, packs, and ships according to the arrangements you agree. You control the process.</p>
              <p className="mt-3">You need your contact’s costs and turnaround, included shipping or flat fees, your own selling prices, approved production instructions, and Stripe.</p>
              <p className="mt-3 font-medium">Start with your contact now. Turn Lumaprints back on when the business is ready.</p>
            </PathCard>
          </div>
          <div className="rounded-lg border-l-4 border-coral bg-white p-5"><h4 className="font-semibold">The remaining work is your business setup.</h4><p className="mt-2 text-sm leading-relaxed">The platform is built. We cannot choose what your artwork should sell for, agree your contact’s fees, approve your creative work, or answer Stripe’s identity and bank questions for you. Make those decisions here, and ask DotWin for help connecting the account details you approve.</p></div>
          <p className="text-sm text-charcoal/65">Exploring a path does not change the store. The fulfillment switch above is what changes how new orders are handled. Progress is saved separately for each path.</p>
        </div> : <div className="grid md:grid-cols-[230px_minmax(0,1fr)]">
          <nav aria-label="Launch setup steps" className="border-b border-charcoal/10 px-5 pb-5 md:border-b-0 md:border-r md:py-2">
            <button type="button" disabled={busy} onClick={() => { setPath(null); setConfirmLaunch(false) }} className="mb-4 min-h-11 text-sm font-semibold text-teal underline">Compare both paths</button>
            <p className="font-semibold">{selectedLuma ? 'Lumaprints setup' : 'Your studio setup'}</p>
            <p className="mb-2 mt-1 text-xs text-charcoal/65">{done} of {steps.length} decisions complete</p>
            <progress aria-label="Setup progress" max={steps.length} value={done} className="mb-4 h-2 w-full accent-teal" />
            <label className="block text-sm font-medium md:hidden">Setup step<select value={cursor} disabled={busy} onChange={e => { setCursor(Number(e.target.value)); setConfirmLaunch(false) }} className="mt-2 w-full rounded-lg border border-charcoal/20 bg-white p-3">{[...steps, 'go_live' as const].map((key, i) => <option value={i} key={key}>{i + 1}. {STEP_TITLES[key]}{state.steps[key]?.done ? ' — complete' : ''}</option>)}</select></label>
            <ol className="hidden space-y-1 md:block">{[...steps, 'go_live' as const].map((key, i) => <li key={key}><button type="button" disabled={busy} aria-current={cursor === i ? 'step' : undefined} onClick={() => { setCursor(i); setConfirmLaunch(false) }} className={`flex w-full gap-2 rounded-lg p-2.5 text-left text-sm leading-snug ${cursor === i ? 'bg-teal text-white' : 'hover:bg-white'}`}><span className="w-5 shrink-0" aria-hidden>{state.steps[key]?.done ? '✓' : i + 1}</span><span>{STEP_TITLES[key]}</span>{state.steps[key]?.done && <span className="sr-only">Complete</span>}</button></li>)}</ol>
          </nav>
          <section aria-labelledby="launch-step-title" className="min-w-0 px-5 pb-8 pt-5 sm:px-8 md:pt-2">
            {!selectedIsActive && <div className="mb-5 rounded-lg border border-gold/50 bg-gold/10 p-4 text-sm">You are exploring the {selectedLuma ? 'Lumaprints' : 'self-fulfillment'} path. The store currently uses {currentPath.toLowerCase()}. Use the fulfillment switch above when you want to activate this path.</div>}
            <h3 ref={heading} tabIndex={-1} id="launch-step-title" className="outline-none mb-5 font-display text-3xl font-semibold">{reviewing ? STEP_TITLES.go_live : STEP_TITLES[step]}</h3>
            {reviewing ? <div className="space-y-5">
              <p>Your website is ready to use the business choices you have approved. Review your decisions and connections below, then open the store when everything is ready.</p>
              <dl className="space-y-3 rounded-xl border border-charcoal/15 bg-white p-5 text-sm">
                <div><dt className="text-charcoal/60">Fulfillment</dt><dd className="font-semibold">{currentPath}</dd></div>
                <div><dt className="text-charcoal/60">Self-fulfilled shipping defaults</dt><dd>{policy.shipping_mode === 'included' ? 'Shipping included in product prices' : `$${(policy.shipping_fee_cents / 100).toFixed(2)} per item`}; ships within {policy.lead_days} calendar days. Product and option overrides take priority.</dd></div>
                {!state.lumaprintsEnabled && <div><dt className="text-charcoal/60">Your production contact</dt><dd>{state.notes.studio_contact_name || 'Add your contact plan'}</dd></div>}
                <div><dt className="text-charcoal/60">Stripe payment mode</dt><dd>{state.stripeTestMode ? 'Test payments' : 'Live payments'}</dd></div>
                <div><dt className="text-charcoal/60">Customer emails / order processing</dt><dd>{state.connections.email ? 'Email settings present' : 'Email connection needed'}; {state.connections.worker ? 'scheduled processing configured' : 'scheduled processing needs connection'}.</dd></div>
              </dl>
              {done < steps.length && <div><h4 className="font-semibold">Your decisions still to finish</h4><ul className="mt-2 list-disc space-y-2 pl-5 text-sm">{steps.filter(k => !state.steps[k]?.done).map(k => <li key={k}><button className="text-left text-teal underline" onClick={() => setCursor(steps.indexOf(k))}>{STEP_TITLES[k]}</button></li>)}</ul></div>}
              {state.blockers.length > 0 && <div className="rounded-lg border border-gold/40 bg-gold/10 p-4"><h4 className="font-semibold">Connection steps before opening</h4><ul className="mt-2 list-disc space-y-2 pl-5 text-sm">{state.blockers.map(b => <li key={b.code}>{b.message}</li>)}</ul><button disabled={busy} onClick={() => void run(async () => { await load(); setMessage('Connection checks refreshed.') })} className="mt-4 min-h-11 font-semibold text-teal underline">Check connections again</button></div>}
              {!state.gateEnabled ? <div className="rounded-lg bg-teal/10 p-5"><h4 className="font-semibold">The visitor password is already off.</h4><p className="mt-2 text-sm">The public site is open. You can keep this guide for reference and finish any outstanding business or connection checks.</p><p className="mt-3"><GuideLink href="https://artbyme.studio">Open ArtByME</GuideLink></p></div> : <div className="rounded-xl border-2 border-teal/30 bg-white p-5">
                <h4 className="font-semibold">Open the shop when you are ready</h4><p className="mt-2 text-sm">This removes the visitor password. With Stripe set up in live mode, customers can place paid orders using the active fulfillment path. Keep an eye on your first customer order and check your queue regularly.</p>
                {confirmLaunch ? <div className="mt-4 space-y-3"><p className="font-semibold">Open ArtByME to customers now?</p><p className="text-sm">Your approved prices, shipping settings, and live payment connection will be used for new orders.</p><div className="flex flex-wrap gap-3"><button disabled={busy || !state.readyToGoLive || !selectedIsActive} onClick={() => void goLive()} className="min-h-11 rounded-lg bg-teal px-5 py-3 font-semibold text-white disabled:opacity-50">Yes, open my store</button><button disabled={busy} onClick={() => setConfirmLaunch(false)} className="min-h-11 rounded-lg border border-charcoal/20 px-5 py-3">Keep reviewing</button></div></div> : <button disabled={busy || !state.readyToGoLive || !selectedIsActive} onClick={() => setConfirmLaunch(true)} className="mt-4 min-h-12 rounded-lg bg-teal px-6 py-3 font-semibold text-white disabled:opacity-50">Open my store</button>}
                {(!state.readyToGoLive || !selectedIsActive) && <p className="mt-3 text-sm text-charcoal/65">Finish the steps for the active fulfillment path and the connection checks above to enable this button.</p>}
              </div>}
            </div> : <LaunchGuideContent key={`${path}-${step}`} step={step} state={state} policy={policy} busy={busy} saveContact={saveContact} saveShipping={saveShipping} activateLivePayments={activateLivePayments} />}
            <footer className="mt-7 flex flex-wrap items-center gap-3 border-t border-charcoal/15 pt-5">
              {cursor > 0 && <button type="button" disabled={busy} onClick={() => { setCursor(i => i - 1); setConfirmLaunch(false) }} className="min-h-11 rounded-lg border border-charcoal/20 px-4 py-2">Previous</button>}
              {step && !['studio_partner', 'studio_shipping', 'luma_shipping'].includes(step) && <button type="button" disabled={busy} onClick={() => void run(() => mark(step, !state.steps[step]?.done, !state.steps[step]?.done))} className="min-h-11 rounded-lg bg-teal px-5 py-2 font-semibold text-white disabled:opacity-50">{busy ? 'Saving…' : state.steps[step]?.done ? 'Mark this step unfinished' : 'I have completed this step'}</button>}
              {step && <button type="button" disabled={busy} onClick={() => setCursor(i => i + 1)} className="min-h-11 px-3 py-2 text-sm font-semibold text-teal underline">{cursor === steps.length - 1 ? 'Review my launch setup' : 'Next step'}</button>}
              <button type="button" disabled={busy} onClick={close} className="ml-auto min-h-11 px-3 py-2 text-sm text-charcoal/65 underline">Continue later</button>
            </footer>
          </section>
        </div>}
      </div>
    </div>
  </dialog>
}

function PathCard({ title, action, children, busy, onChoose }: { title: string; action: string; children: React.ReactNode; busy: boolean; onChoose: () => void }) {
  return <section className="flex flex-col rounded-xl border border-charcoal/20 bg-white p-5 sm:p-6"><h4 className="font-display text-2xl font-semibold">{title}</h4><div className="mb-5 mt-3 flex-1 text-sm leading-relaxed text-charcoal/80">{children}</div><button type="button" disabled={busy} onClick={onChoose} className="min-h-12 rounded-lg border border-teal bg-teal/5 px-4 py-3 text-left font-semibold text-teal hover:bg-teal/10">{action}</button></section>
}
