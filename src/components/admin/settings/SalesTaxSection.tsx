'use client'

import Link from 'next/link'
import { useEffect, useRef, useState } from 'react'
import { apiFetch, apiSend, errorMessage } from '@/lib/api/client'

const STATES = [
  ['AL', 'Alabama'], ['AK', 'Alaska'], ['AZ', 'Arizona'], ['AR', 'Arkansas'],
  ['CA', 'California'], ['CO', 'Colorado'], ['CT', 'Connecticut'], ['DE', 'Delaware'],
  ['DC', 'District of Columbia'], ['FL', 'Florida'], ['GA', 'Georgia'], ['HI', 'Hawaii'],
  ['ID', 'Idaho'], ['IL', 'Illinois'], ['IN', 'Indiana'], ['IA', 'Iowa'], ['KS', 'Kansas'],
  ['KY', 'Kentucky'], ['LA', 'Louisiana'], ['ME', 'Maine'], ['MD', 'Maryland'],
  ['MA', 'Massachusetts'], ['MI', 'Michigan'], ['MN', 'Minnesota'], ['MS', 'Mississippi'],
  ['MO', 'Missouri'], ['MT', 'Montana'], ['NE', 'Nebraska'], ['NV', 'Nevada'],
  ['NH', 'New Hampshire'], ['NJ', 'New Jersey'], ['NM', 'New Mexico'], ['NY', 'New York'],
  ['NC', 'North Carolina'], ['ND', 'North Dakota'], ['OH', 'Ohio'], ['OK', 'Oklahoma'],
  ['OR', 'Oregon'], ['PA', 'Pennsylvania'], ['RI', 'Rhode Island'], ['SC', 'South Carolina'],
  ['SD', 'South Dakota'], ['TN', 'Tennessee'], ['TX', 'Texas'], ['UT', 'Utah'],
  ['VT', 'Vermont'], ['VA', 'Virginia'], ['WA', 'Washington'], ['WV', 'West Virginia'],
  ['WI', 'Wisconsin'], ['WY', 'Wyoming'],
] as const

interface TaxSettings {
  tax_enabled: boolean
  tax_included: boolean
  tax_nexus_states: string[] | null
}

interface TaxReadiness {
  ready: boolean
  mode: 'test' | 'live'
  registeredStates: string[]
  missingStates: string[]
  message: string
}

interface SettingsResponse {
  settings: TaxSettings
  taxReadiness?: TaxReadiness
}

const linkClass = 'font-medium text-teal underline decoration-teal/40 underline-offset-4 hover:text-deep-teal focus-visible:outline-2 focus-visible:outline-offset-4 focus-visible:outline-teal'
const buttonClass = 'rounded-sm bg-teal px-5 py-2.5 font-body text-sm font-medium text-cream transition-colors hover:bg-deep-teal focus-visible:outline-2 focus-visible:outline-offset-4 focus-visible:outline-teal disabled:cursor-not-allowed disabled:opacity-50'

function TaxSwitch({ id, checked, onChange, disabled, label }: {
  id: string
  checked: boolean
  onChange: (value: boolean) => void
  disabled: boolean
  label: string
}) {
  return (
    <button
      id={id}
      type="button"
      role="switch"
      aria-label={label}
      aria-checked={checked}
      disabled={disabled}
      onClick={() => onChange(!checked)}
      className={`relative inline-flex h-7 w-12 shrink-0 items-center rounded-full transition-colors focus-visible:outline-2 focus-visible:outline-offset-4 focus-visible:outline-teal disabled:cursor-not-allowed disabled:opacity-40 ${checked ? 'bg-teal' : 'bg-charcoal/30'}`}
    >
      <span className={`inline-block h-5 w-5 rounded-full bg-white shadow transition-transform ${checked ? 'translate-x-6' : 'translate-x-1'}`} />
    </button>
  )
}

function NexusHelp({ dialogRef }: { dialogRef: React.RefObject<HTMLDialogElement | null> }) {
  return (
    <dialog
      ref={dialogRef}
      id="sales-tax-help"
      aria-labelledby="sales-tax-help-title"
      className="fixed inset-0 m-auto max-h-[90dvh] w-[calc(100%-2rem)] max-w-3xl overflow-y-auto rounded-lg bg-cream p-0 text-charcoal shadow-2xl backdrop:bg-charcoal/60"
      onClick={(event) => { if (event.target === event.currentTarget) dialogRef.current?.close() }}
    >
      <div className="sticky top-0 z-10 flex items-start justify-between gap-4 border-b border-charcoal/10 bg-cream px-6 py-5 sm:px-8">
        <div>
          <p className="font-body text-xs font-semibold uppercase tracking-widest text-teal">A plain-language guide</p>
          <h2 id="sales-tax-help-title" className="mt-1 font-display text-2xl font-semibold">Sales tax, nexus, and your art business</h2>
        </div>
        <button type="button" onClick={() => dialogRef.current?.close()} aria-label="Close sales tax guide" className="rounded-sm border border-charcoal/20 px-3 py-2 font-body text-sm hover:bg-white focus-visible:outline-2 focus-visible:outline-teal">Close</button>
      </div>
      <div className="space-y-7 px-6 py-6 font-body text-sm leading-7 sm:px-8">
        <section className="space-y-2">
          <h3 className="font-display text-xl font-semibold">1. What does “nexus” mean?</h3>
          <p>Nexus means your business has a strong enough connection to a state that the state may require you to collect sales tax. Think of it as a connection on a map. A studio, office, employee, or stored products can create that connection. Selling enough to customers in another state can also create it. Each state sets its own rules.</p>
          <p>Margaret’s business is based in Texas, so Texas is the starting point. A customer visiting your website from another state does not, by itself, give your business nexus there. Review your business locations and sales before adding another state. Ask that state’s tax office or your accountant when you are unsure.</p>
        </section>
        <section className="space-y-2">
          <h3 className="font-display text-xl font-semibold">2. Get your account ready</h3>
          <ol className="list-decimal space-y-2 pl-5">
            <li><strong>Get your state permit.</strong> For Texas, open the <a className={linkClass} href="https://comptroller.texas.gov/taxes/permit/" target="_blank" rel="noopener noreferrer">Texas Comptroller sales tax registration page</a> and choose the permit application. Have your business details ready. The Comptroller lists the documents you need. Selecting Texas here does not apply for a permit.</li>
            <li><strong>Set up Stripe Tax.</strong> In the Stripe account connected to this store, confirm your business address and tax settings. Open <a className={linkClass} href="https://dashboard.stripe.com/tax/locations" target="_blank" rel="noopener noreferrer">Stripe Tax locations</a>, add your registration, and use its real start date. The registration must be active in the same Stripe mode your store uses. A test registration does not prepare live sales.</li>
            <li><strong>Choose your states below.</strong> Select the states where you have a collection duty and the required active registrations. For Margaret, start with Texas once the permit and Stripe registration are ready. Follow each additional state’s registration rules before selecting it.</li>
            <li><strong>Choose how prices show tax.</strong> Turn on Sales tax enabled. Leave Sales tax separate off to include tax in your prices, or turn it on to add tax at checkout. Press Save sales tax.</li>
            <li><strong>Check a checkout.</strong> Use Stripe test mode to try a delivery address in a selected state and one outside it. Try each pricing mode. Confirm the tax line and final total before taking live orders. Test mode and live mode need their own Stripe setup.</li>
          </ol>
          <p>See <a className={linkClass} href="https://docs.stripe.com/tax/registering" target="_blank" rel="noopener noreferrer">Stripe’s registration instructions</a> for the current dashboard steps.</p>
        </section>
        <section className="space-y-3">
          <h3 className="font-display text-xl font-semibold">3. Pick one of two ways to collect</h3>
          <div className="rounded-sm border border-teal/20 bg-white p-4">
            <h4 className="font-semibold text-teal">Sales tax included · Separate switch off</h4>
            <p>The price already holds the tax. Imagine a box with the art money and the tax money inside it. For an example rate of 8.25%, a $108.25 price contains $100 for the sale and $8.25 for tax. The buyer pays $108.25 before any shipping. You set aside the $8.25 for the state.</p>
            <p className="mt-2">To find the art portion, divide $108.25 by 1.0825. That gives $100. Subtract $100 from $108.25 to find the $8.25 tax. Do not take 8.25% of $108.25; that would count tax on the tax.</p>
            <p className="mt-2">Texas requires a written notice and prominent display when tax is included. The store uses this statement for Texas:</p>
            <blockquote className="mt-2 border-l-2 border-teal pl-3 font-medium">Texas state and local sales and use tax is included in the sales price.</blockquote>
          </div>
          <div className="rounded-sm border border-charcoal/15 bg-white p-4">
            <h4 className="font-semibold text-teal">Sales tax separate · Separate switch on</h4>
            <p>The item price comes first. Tax is added at checkout when it applies. At the same example rate, a $100 item has $8.25 in tax, so the buyer pays $108.25 before shipping. The tax line shows the extra amount.</p>
          </div>
          <p>Changing the switch does not rewrite product prices. A $100 product stays priced at $100. Included mode takes the tax out of that $100; separate mode adds the tax on top. Review your prices and profit before switching.</p>
          <p>The 8.25% rate is only a math example. Texas has a 6.25% state tax and up to 2% in local tax. Your actual rate depends on the sale and applicable local rules. Stripe uses your tax setup and the buyer’s full delivery address; this store does not apply a single rate to every Texas order. <a className={linkClass} href="https://comptroller.texas.gov/taxes/sales/" target="_blank" rel="noopener noreferrer">Read Texas sales tax basics</a>.</p>
        </section>
        <section className="space-y-2">
          <h3 className="font-display text-xl font-semibold">4. Which buyers pay the tax?</h3>
          <p>For this store’s shipped art orders, the delivery state must match a state you selected. If Texas is your only selection, an eligible order shipped to Texas gets Texas tax. An order shipped to a state you did not select gets no sales tax from this system. The buyer’s location while browsing is not used to choose the state.</p>
          <p>In included mode, applicable tax comes from the listed price. In separate mode, applicable tax is added. A sale that is not taxable can still have $0 tax. Shipping can also be taxable; the tax calculation follows the rules that apply to the order.</p>
        </section>
        <section className="space-y-2">
          <h3 className="font-display text-xl font-semibold">5. Keep the tax money separate</h3>
          <p>Tax is money you collect for the state. It is not your profit. Product costs, shipping costs, payment fees, discounts, and any included tax all reduce the money you keep.</p>
          <p>Saving these settings does not file a tax return, pay the state, or cancel a tax permit. Keep your sales records, follow the filing schedule assigned to your business, and send the tax to the right tax office. Turning this switch off also does not end your legal duty to collect.</p>
          <p><a className={linkClass} href="https://comptroller.texas.gov/taxes/sales/faq/collection.php" target="_blank" rel="noopener noreferrer">Texas tax collection and included-price rules</a> · <Link className={linkClass} href="/admin/help/12-sales-tax-and-nexus" onClick={() => dialogRef.current?.close()}>Full sales tax article</Link> · <Link className={linkClass} href="/admin/help/13-texas-sales-tax-setup" onClick={() => dialogRef.current?.close()}>Texas setup checklist</Link></p>
        </section>
      </div>
    </dialog>
  )
}

export default function SalesTaxSection() {
  const dialogRef = useRef<HTMLDialogElement>(null)
  const [loading, setLoading] = useState(true)
  const [saving, setSaving] = useState(false)
  const [loadError, setLoadError] = useState<string | null>(null)
  const [message, setMessage] = useState<{ error: boolean; text: string } | null>(null)
  const [enabled, setEnabled] = useState(false)
  const [included, setIncluded] = useState(true)
  const [states, setStates] = useState<string[]>([])
  const [search, setSearch] = useState('')
  const [retry, setRetry] = useState(0)
  const [saved, setSaved] = useState('')
  const [readiness, setReadiness] = useState<TaxReadiness | null>(null)
  const [checking, setChecking] = useState(false)

  useEffect(() => {
    let cancelled = false
    async function load() {
      setLoading(true)
      setLoadError(null)
      try {
        const data = await apiFetch<SettingsResponse>('/api/admin/settings?taxReadiness=1')
        if (cancelled) return
        const nextEnabled = data.settings.tax_enabled === true
        const nextIncluded = data.settings.tax_included !== false
        const nextStates = [...(data.settings.tax_nexus_states ?? [])].sort()
        setReadiness(data.taxReadiness ?? null)
        setEnabled(nextEnabled)
        setIncluded(nextIncluded)
        setStates(nextStates)
        setSaved(JSON.stringify([nextEnabled, nextIncluded, nextStates]))
      } catch (error) {
        if (!cancelled) setLoadError(errorMessage(error))
      } finally {
        if (!cancelled) setLoading(false)
      }
    }
    void load()
    return () => { cancelled = true }
  }, [retry])

  const dirty = saved !== JSON.stringify([enabled, included, [...states].sort()])
  const shownStates = STATES.filter(([code, name]) => `${code} ${name}`.toLowerCase().includes(search.toLowerCase().trim()))

  async function refreshReadiness() {
    setChecking(true)
    try {
      const data = await apiFetch<SettingsResponse>('/api/admin/settings?taxReadiness=1')
      setReadiness(data.taxReadiness ?? null)
    } catch (error) {
      setMessage({ error: true, text: errorMessage(error) })
    } finally {
      setChecking(false)
    }
  }

  async function save() {
    setMessage(null)
    if (enabled && states.length === 0) {
      setMessage({ error: true, text: 'Choose at least one state where you are registered to collect sales tax.' })
      return
    }
    setSaving(true)
    try {
      const data = await apiSend<SettingsResponse>('/api/admin/settings', 'PATCH', {
        tax_enabled: enabled,
        tax_included: included,
        tax_nexus_states: states,
      })
      const nextStates = [...(data.settings.tax_nexus_states ?? [])].sort()
      setReadiness(data.taxReadiness ?? null)
      setEnabled(data.settings.tax_enabled)
      setIncluded(data.settings.tax_included)
      setStates(nextStates)
      setSaved(JSON.stringify([data.settings.tax_enabled, data.settings.tax_included, nextStates]))
      setMessage({ error: false, text: 'Sales tax settings saved.' })
    } catch (error) {
      setMessage({ error: true, text: errorMessage(error) })
    } finally {
      setSaving(false)
    }
  }

  return (
    <section id="sales-tax" aria-labelledby="sales-tax-title" className="scroll-mt-8 rounded-sm border border-charcoal/10 bg-white p-6 shadow-sm">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <h2 id="sales-tax-title" className="font-display text-xl font-semibold text-charcoal">Sales tax</h2>
          <p className="mt-1 font-body text-sm text-charcoal/65">Choose where you collect tax and whether it is included in your prices.</p>
        </div>
        <button type="button" aria-haspopup="dialog" aria-controls="sales-tax-help" onClick={() => dialogRef.current?.showModal()} className="rounded-sm border border-teal/25 px-3 py-2 font-body text-sm font-medium text-teal hover:bg-teal/5 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-teal">What is nexus? · Tax guide</button>
      </div>
      <NexusHelp dialogRef={dialogRef} />
      {loading ? <p className="mt-5 font-body text-sm text-charcoal/60" role="status">Loading sales tax settings…</p> : loadError ? (
        <div className="mt-5 font-body text-sm"><p role="alert" className="text-coral">{loadError}</p><button type="button" onClick={() => setRetry(retry + 1)} className={`${buttonClass} mt-3`}>Try again</button></div>
      ) : (
        <div className="mt-6 space-y-5 font-body text-sm text-charcoal">
          <div className="flex items-center justify-between gap-4 rounded-sm border border-charcoal/15 p-4">
            <div><label htmlFor="tax-enabled" className="font-semibold">Sales tax enabled</label><p className="mt-1 text-charcoal/65">{enabled ? 'Collect applicable tax for delivery states selected below.' : 'Off. This store does not collect sales tax through these settings.'}</p></div>
            <TaxSwitch id="tax-enabled" checked={enabled} onChange={setEnabled} disabled={saving} label="Sales tax enabled" />
          </div>
          <div className="flex items-center justify-between gap-4 rounded-sm border border-charcoal/15 p-4">
            <div><label htmlFor="tax-separate" className="font-semibold">Sales tax separate</label><p className="mt-1 text-charcoal/65">{included ? 'Off · Sales tax included. Applicable tax comes out of the listed price.' : 'On · Sales tax is added to the listed price at checkout.'}</p></div>
            <TaxSwitch id="tax-separate" checked={!included} onChange={(value) => setIncluded(!value)} disabled={saving} label="Sales tax separate" />
          </div>
          <div className="rounded-sm bg-cream p-4 text-sm leading-6">
            <p className="font-semibold">{enabled ? included ? 'Selected mode: Sales tax included' : 'Selected mode: Sales tax added at checkout' : 'Collection is off. Your choices below can be saved for later.'}</p>
            <p className="mt-1">{included ? 'Example only: a $108.25 price at an 8.25% rate includes $100 for the sale and $8.25 for tax.' : 'Example only: a $100 price at an 8.25% rate becomes $108.25 at checkout.'} Shipping is excluded from these examples. Actual rates are calculated by Stripe.</p>
            {included && states.includes('TX') && <p className="mt-2 border-l-2 border-teal pl-3">Texas state and local sales and use tax is included in the sales price.</p>}
          </div>
          <fieldset disabled={saving} className="space-y-3">
            <legend className="font-semibold">States where your business has nexus</legend>
            <p className="text-charcoal/65">Select only states where you need to collect and have active tax registrations. A buyer’s delivery state must be selected for this system to apply sales tax.</p>
            <div className="flex flex-wrap gap-2" aria-label="Selected nexus states">
              {states.length ? states.map((code) => <span key={code} className="rounded-full bg-teal/10 px-3 py-1 text-xs font-medium text-deep-teal">{STATES.find(([state]) => state === code)?.[1] ?? code}</span>) : <span className="text-charcoal/55">No states selected.</span>}
            </div>
            <label htmlFor="tax-state-search" className="sr-only">Find a state</label>
            <input id="tax-state-search" type="search" value={search} onChange={(event) => setSearch(event.target.value)} placeholder="Find a state, for example Texas" className="w-full rounded-sm border border-charcoal/20 bg-cream px-3 py-2.5 text-sm focus:border-teal focus:outline-none focus:ring-1 focus:ring-teal" />
            <div className="grid max-h-64 grid-cols-1 gap-1 overflow-y-auto rounded-sm border border-charcoal/15 p-2 sm:grid-cols-2 lg:grid-cols-3">
              {shownStates.map(([code, name]) => (
                <label key={code} className={`flex cursor-pointer items-center gap-2 rounded-sm px-2 py-2 hover:bg-cream ${states.includes(code) ? 'bg-teal/5' : ''}`}>
                  <input type="checkbox" checked={states.includes(code)} onChange={(event) => setStates(event.target.checked ? [...states, code] : states.filter((state) => state !== code))} className="h-4 w-4 accent-teal" />
                  <span>{name}</span><span className="ml-auto text-xs text-charcoal/45">{code}</span>
                </label>
              ))}
              {shownStates.length === 0 && <p className="p-2 text-charcoal/60">No states match your search.</p>}
            </div>
          </fieldset>
          <div className="rounded-sm border border-teal/20 p-4 leading-6">
            <p className="font-semibold">Before you turn collection on</p>
            <p className="mt-1">Get your state permit, add the registration in Stripe Tax, and confirm your Stripe business address. Selecting a state here does not register your business. Saving with collection enabled checks your Stripe setup. Tax filing and payments to the state remain your responsibility.</p>
            <div className="mt-2 flex flex-wrap gap-x-4 gap-y-1"><a className={linkClass} href="https://comptroller.texas.gov/taxes/permit/" target="_blank" rel="noopener noreferrer">Register in Texas ↗</a><a className={linkClass} href="https://dashboard.stripe.com/tax/locations" target="_blank" rel="noopener noreferrer">Open Stripe Tax ↗</a><Link className={linkClass} href="/admin/help/13-texas-sales-tax-setup">Texas setup steps</Link></div>
          </div>
          <div className="rounded-sm border border-charcoal/15 p-4" aria-live="polite">
            <div className="flex flex-wrap items-center justify-between gap-3">
              <p className="font-semibold">Stripe Tax readiness{readiness ? ` · ${readiness.mode === 'live' ? 'Live' : 'Test'} mode` : ''}</p>
              <button type="button" onClick={refreshReadiness} disabled={checking || saving} className="rounded-sm border border-charcoal/20 px-3 py-2 text-sm font-medium hover:bg-cream focus-visible:outline-2 focus-visible:outline-teal disabled:opacity-50">{checking ? 'Checking…' : 'Check Stripe setup'}</button>
            </div>
            <p className="mt-2 text-charcoal/70">{readiness?.message ?? 'Check your Stripe setup after adding your registrations. Your setup is also checked when you save with collection enabled.'}</p>
            {readiness && <p className="mt-2 text-charcoal/60">Active state registrations: {readiness.registeredStates.length ? readiness.registeredStates.map((code) => STATES.find(([state]) => state === code)?.[1] ?? code).join(', ') : 'None found'}. {dirty ? 'Your new choices will be checked when you save.' : 'This check uses your saved state selections.'}</p>}
          </div>
          <div className="flex flex-wrap items-center gap-3">
            <button type="button" onClick={save} disabled={saving || !dirty} className={buttonClass}>{saving ? 'Saving…' : 'Save sales tax'}</button>
            {dirty && !saving && <span className="text-charcoal/55">You have unsaved changes.</span>}
            <Link className={linkClass} href="/admin/help/12-sales-tax-and-nexus">Read the full sales tax guide</Link>
          </div>
          {message && <p role={message.error ? 'alert' : 'status'} className={message.error ? 'text-coral' : 'text-teal'}>{message.text}</p>}
        </div>
      )}
    </section>
  )
}
