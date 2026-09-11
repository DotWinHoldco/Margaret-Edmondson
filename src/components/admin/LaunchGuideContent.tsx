'use client'

import { useEffect, useState, type ReactNode } from 'react'
import type { LaunchStepKey } from '@/lib/launch/steps'
import type { LaunchState } from '@/lib/launch/types'
import type { FulfillmentPolicy } from '@/lib/fulfillment/policy'
import StudioProductEditor from './StudioProductEditor'

export const STEP_TITLES: Record<LaunchStepKey, string> = {
  studio_partner: 'Agree the plan with your contact',
  studio_shipping: 'Choose and save your shipping costs',
  studio_prices: 'Set the prices you want to charge',
  studio_artwork: 'Approve the artwork and options',
  studio_workflow: 'Learn your order-processing queue',
  stripe_account: 'Finish your Stripe account and payments',
  studio_test_order: 'Rehearse a self-fulfilled order',
  business_details: 'Approve the shop details customers see',
  luma_login: 'Open your Lumaprints account',
  luma_billing: 'Set up Lumaprints billing',
  crops: 'Approve your print files and crops',
  prices: 'Review your Lumaprints selling prices',
  margins: 'Understand printing costs and your margin',
  luma_shipping: 'Review print and original shipping',
  luma_workflow: 'Know how Lumaprints orders are handled',
  luma_test_order: 'Rehearse the Lumaprints order path',
  go_live: 'Review your setup and open the store',
}
const field = 'mt-1 w-full rounded-lg border border-charcoal/25 bg-white px-3 py-2.5 text-base focus:outline-none focus:ring-2 focus:ring-teal'
const button = 'min-h-11 rounded-lg bg-teal px-5 py-2.5 font-semibold text-white hover:bg-deep-teal disabled:opacity-50'

/** Keep account/setup resources accessible without losing the current wizard. */
export function GuideLink({ href, children }: { href: string; children: ReactNode }) {
  return <a href={href} target="_blank" rel="noopener noreferrer" className="font-semibold text-teal underline underline-offset-4">{children}<span className="sr-only"> (opens in a new tab)</span></a>
}
function Checklist({ items }: { items: ReactNode[] }) {
  return <ol className="list-decimal space-y-3 pl-5">{items.map((item, i) => <li key={i} className="pl-1">{item}</li>)}</ol>
}
function Note({ children }: { children: ReactNode }) {
  return <div className="rounded-lg border-l-4 border-teal bg-teal/[0.06] p-4">{children}</div>
}

/** Owner decisions are saved privately; these fields never configure a third-party integration. */
function ContactSetup({ state, busy, save }: { state: LaunchState; busy: boolean; save: (notes: Record<string, string>) => Promise<void> }) {
  const [name, setName] = useState(state.notes.studio_contact_name || '')
  const [contact, setContact] = useState(state.notes.studio_contact_method || '')
  const [arrangements, setArrangements] = useState(state.notes.studio_arrangements || '')
  return <div className="space-y-5">
    <p>You stay in charge of the customer and the order. Your contact can print, frame, pack, and ship for you. Agree the details together before offering a size or frame for sale.</p>
    <Checklist items={[
      'Ask for their cost for every print size, paper or canvas, frame, packaging, and postage. Include any handling or delivery charges in your calculation.',
      'Agree which files they need, how you will send each order, how quickly they can ship, and who provides the carrier and tracking number.',
      'Decide who pays for damage, reprints, returns, lost parcels, and changes after production starts. Agree how you will pay your contact.',
      'Confirm who handles originals. An original already exists; it needs careful packing and shipping, and can only be sold once.',
    ]} />
    <form className="space-y-4" onSubmit={e => { e.preventDefault(); void save({ studio_contact_name: name, studio_contact_method: contact, studio_arrangements: arrangements }) }}>
      <label className="block font-medium">Contact’s name<input required maxLength={200} className={field} value={name} onChange={e => setName(e.target.value)} /></label>
      <label className="block font-medium">How will you send them orders?<input required maxLength={1000} className={field} placeholder="Email, phone, or your agreed messaging method" value={contact} onChange={e => setContact(e.target.value)} /></label>
      <label className="block font-medium">Agreed costs, turnaround, and responsibilities<textarea required maxLength={4000} rows={5} className={field} placeholder="Record what you have agreed, including packaging, shipping, and handling problems." value={arrangements} onChange={e => setArrangements(e.target.value)} /></label>
      <p className="text-sm text-charcoal/65">These notes are for your admin team. Saving them does not send a message, invite your contact, or give them access to your account.</p>
      <button className={button} disabled={busy}>{busy ? 'Saving…' : 'Save contact plan and continue'}</button>
    </form>
  </div>
}

export type ShippingChoice = Pick<FulfillmentPolicy, 'shipping_mode' | 'shipping_fee_cents' | 'lead_days' | 'ship_akhi'>
function ShippingSetup({ policy, busy, save, originalsOnly = false }: { policy: FulfillmentPolicy; busy: boolean; save: (choice: ShippingChoice) => Promise<void>; originalsOnly?: boolean }) {
  const [mode, setMode] = useState(policy.shipping_mode)
  const [fee, setFee] = useState((policy.shipping_fee_cents / 100).toFixed(2))
  const [days, setDays] = useState(String(policy.lead_days))
  const [akhi, setAkhi] = useState(policy.ship_akhi)
  return <div className="space-y-5">
    {originalsOnly && <Note>Lumaprints handles eligible prints. Originals and any studio-only options still need your own shipping rates and production arrangements. These defaults apply to that self-fulfilled work.</Note>}
    <p>Choose how customers pay for shipping. Printing, framing, packing, and your earnings belong in the product price. There is no separate framing or handling bill at checkout.</p>
    <form className="space-y-5" onSubmit={e => { e.preventDefault(); void save({ shipping_mode: mode, shipping_fee_cents: Math.round(Number(fee) * 100), lead_days: Number(days), ship_akhi: akhi }) }}>
      <fieldset className="grid gap-3 sm:grid-cols-2">
        <legend className="mb-2 font-semibold">Your default shipping option</legend>
        <label className={`cursor-pointer rounded-xl border-2 p-4 ${mode === 'included' ? 'border-teal bg-teal/5' : 'border-charcoal/15'}`}>
          <input type="radio" name="guide-shipping" checked={mode === 'included'} onChange={() => setMode('included')} className="mr-2 accent-teal" />
          <strong>Shipping included</strong><span className="mt-2 block text-sm">Build postage into each selling price. Customers see “Shipping included” and no extra shipping charge.</span>
        </label>
        <label className={`cursor-pointer rounded-xl border-2 p-4 ${mode === 'flat' ? 'border-teal bg-teal/5' : 'border-charcoal/15'}`}>
          <input type="radio" name="guide-shipping" checked={mode === 'flat'} onChange={() => setMode('flat')} className="mr-2 accent-teal" />
          <strong>Flat shipping fee</strong><span className="mt-2 block text-sm">Add a fixed amount for each item. A $15 fee means $15 for one item and $30 for two items.</span>
        </label>
      </fieldset>
      <div className="grid gap-4 sm:grid-cols-2">
        {mode === 'flat' && <label className="font-medium">Shipping fee per item ($)<input required type="number" min="0" max="10000" step="0.01" className={field} value={fee} onChange={e => setFee(e.target.value)} /></label>}
        <label className="font-medium">Ships within (calendar days)<input required type="number" min="0" max="365" step="1" className={field} value={days} onChange={e => setDays(e.target.value)} /></label>
      </div>
      <label className="flex items-start gap-3"><input type="checkbox" checked={akhi} onChange={e => setAkhi(e.target.checked)} className="mt-1 h-5 w-5 shrink-0 accent-teal" /><span>My studio rates also cover Alaska and Hawaii<span className="block text-sm text-charcoal/65">Leave this off if your contact’s quote only covers the contiguous United States. International shipping is not offered by this checkout.</span></span></label>
      <Note>Example before tax: a $95 print plus $15 shipping totals $110. With shipping included, set the selling price to $110 if that covers the same costs. Set a realistic dispatch time that includes printing, framing, and packing; carrier transit happens afterward.</Note>
      <p>These are store defaults. In each product’s <strong>Studio prices &amp; shipping</strong>, you can override shipping for a large original or an expensive frame. Each print option can override the product too. Previously saved overrides take priority; review them before opening the shop.</p>
      <p className="text-sm text-charcoal/65">This saves the customer’s charge. You or your contact still buy the carrier’s label and pay the actual postage; the platform does not purchase labels.</p>
      <button className={button} disabled={busy}>{busy ? 'Saving…' : 'Save shipping and continue'}</button>
    </form>
  </div>
}

/** The wizard edits the same studio price profile as the regular product editor. */
function StudioPricing() {
  const [products, setProducts] = useState<{ id: string; title: string }[]>([])
  const [selected, setSelected] = useState('')
  const [error, setError] = useState('')
  useEffect(() => {
    const controller = new AbortController()
    fetch('/api/admin/products', { signal: controller.signal }).then(async r => {
      const d = await r.json()
      if (!r.ok) throw new Error(d.error || 'Could not load products.')
      setProducts(d.data || [])
    }).catch(e => { if (!controller.signal.aborted) setError(e.message) })
    return () => controller.abort()
  }, [])
  return <div className="space-y-5">
    <p>You choose a final selling price for every size and frame. Your contact’s printing, framing, and packing costs, payment fees, and the amount you want to keep all need to fit inside that price. Add postage too when shipping is included.</p>
    <Checklist items={[
      <>Choose a product below, or open <GuideLink href="/admin/products">Products</GuideLink>. Select <strong>My studio</strong> in its pricing area.</>,
      <>For prints, enter the final price for each option and use <strong>Live in my studio</strong> only for sizes your contact can supply. Save the studio settings. Lumaprints prices stay saved separately.</>,
      <>For originals, open the product editor and set <strong>Base price</strong>, then save the product. Review the original’s shipping override. Keep sold originals unavailable; mark a physical return received before offering a refunded, returned original again.</>,
      'Check every active product, size, and frame. The copied starting prices are a starting point, not confirmation that they cover your contact’s costs.',
    ]} />
    <label className="block font-semibold">Try setting a product’s studio prices<select className={field} value={selected} onChange={e => setSelected(e.target.value)}><option value="">Choose an active product</option>{products.map(p => <option value={p.id} key={p.id}>{p.title}</option>)}</select></label>
    {error && <p role="alert" className="text-coral">{error}</p>}
    {selected && <StudioProductEditor key={selected} productId={selected} initialMode="studio"><p><GuideLink href={`/admin/products/${selected}/edit`}>Open this product’s Lumaprints pricing controls</GuideLink></p></StudioProductEditor>}
    <Note>Save each product before moving on. Mark this step complete only after reviewing all offers you plan to sell, including their shipping overrides.</Note>
  </div>
}

function PaymentSetup({ state, busy, activateLivePayments }: { state: LaunchState; busy: boolean; activateLivePayments: () => Promise<void> }) {
  const liveReady = Object.values(state.connections.stripe.live).every(Boolean)
  const rehearsalDone = state.steps[state.lumaprintsEnabled ? 'luma_test_order' : 'studio_test_order']?.done === true
  return <div className="space-y-5">
    <p>Customers pay your business through Stripe in either fulfillment path. Stripe then pays out to your bank according to your account’s payout settings. Your contact or Lumaprints is paid separately.</p>
    <Checklist items={[
      <>Open your <GuideLink href="https://dashboard.stripe.com/account/onboarding">Stripe account setup</GuideLink>. Supply your legal business or individual details, ownership information, and any identity checks Stripe requests. Only you can confirm these answers.</>,
      'In Stripe, add the bank account where you want payouts. Review your customer support details and the business name customers will recognize on their statements. Complete any outstanding account requirements.',
      <>Have DotWin connect that account’s checkout keys and payment confirmations to this website. Use Stripe’s team access if help is needed. Keep passwords, bank details, and secret keys out of this guide and ordinary messages.</>,
      <>Use the next step to rehearse with test payments. After the test works, open <GuideLink href="/admin/settings">Settings → Stripe Mode</GuideLink> or use the button below to select live payments. Opening the website and activating Stripe are separate steps.</>,
    ]} />
    <div className="rounded-xl border border-charcoal/15 p-4">
      <h4 className="font-semibold">Payment setup detected on this deployment</h4>
      <dl className="mt-3 space-y-2 text-sm">
        <div className="flex flex-wrap justify-between gap-2"><dt>Selected payment mode</dt><dd className="font-semibold">{state.stripeTestMode ? 'Test payments' : 'Live payments'}</dd></div>
        <div className="flex flex-wrap justify-between gap-2"><dt>Live checkout connection</dt><dd>{state.connections.stripe.live.secret && state.connections.stripe.live.publishable ? 'Settings present' : 'Needs connection'}</dd></div>
        <div className="flex flex-wrap justify-between gap-2"><dt>Live payment confirmations</dt><dd>{state.connections.stripe.live.webhook ? 'Settings present' : 'Needs connection'}</dd></div>
        <div className="flex flex-wrap justify-between gap-2"><dt>Test checkout and confirmations</dt><dd>{Object.values(state.connections.stripe.test).every(Boolean) ? 'Settings present' : 'Needs connection for rehearsal'}</dd></div>
      </dl>
      <p className="mt-3 text-sm text-charcoal/65">These checks detect connection settings. Your Stripe Dashboard confirms account verification and payout readiness; the order rehearsal confirms payments reach the order queue.</p>
      {!liveReady && <p className="mt-3 text-sm text-coral">Your live payment connection still needs setup. Give DotWin access to the correct Stripe account so the connection can be completed.</p>}
      {state.stripeTestMode && <button type="button" onClick={() => void activateLivePayments()} disabled={busy || !liveReady || !rehearsalDone || state.connections.preview} className={`${button} mt-4`}>Use live Stripe payments</button>}
      {state.stripeTestMode && !rehearsalDone && <p className="mt-3 text-sm">Complete the order rehearsal for your active fulfillment path, then return here to select live payments.</p>}
      {state.connections.preview && <p className="mt-3 text-sm">This preview shares store settings. Make the final live-payment change from the guide on artbyme.studio.</p>}
    </div>
    <p className="text-sm"><GuideLink href="https://docs.stripe.com/get-started/account/set-up">Stripe’s account setup guide</GuideLink></p>
    <Note>Check this step off when your account details and bank setup are complete and the correct account is connected. Missing connection settings still prevent the final launch button from opening the shop.</Note>
  </div>
}

/** Explain each owner decision next to the existing controls that save it. */
export default function LaunchGuideContent({ step, state, policy, busy, saveContact, saveShipping, activateLivePayments }: {
  step: LaunchStepKey; state: LaunchState; policy: FulfillmentPolicy; busy: boolean
  saveContact: (notes: Record<string, string>) => Promise<void>
  saveShipping: (choice: ShippingChoice) => Promise<void>
  activateLivePayments: () => Promise<void>
}) {
  if (step === 'studio_partner') return <ContactSetup state={state} busy={busy} save={saveContact} />
  if (step === 'studio_shipping' || step === 'luma_shipping') return <>
    {step === 'luma_shipping' && <div className="mb-5 space-y-3"><p>For Lumaprints offers, open the product’s Lumaprints pricing area and choose <strong>Use shipping integration</strong>, <strong>Shipping included</strong>, or a <strong>Flat fee per item</strong>. Integration shipping uses the existing provider shipping rules; review the amount customers see, including Alaska and Hawaii.</p><p>If you choose an included price or flat fee, your selling price and shipping charge must still cover what Lumaprints bills you. Confirm the available destinations and delivery expectations before advertising them.</p></div>}
    <ShippingSetup policy={policy} busy={busy} save={saveShipping} originalsOnly={step === 'luma_shipping'} />
  </>
  if (step === 'studio_prices') return <StudioPricing />
  if (step === 'stripe_account') return <PaymentSetup state={state} busy={busy} activateLivePayments={activateLivePayments} />
  if (step === 'studio_artwork' || step === 'crops') return <div className="space-y-5">
    <p>You know how each piece should look. Approve the artwork, crop, sizes, materials, and frames that customers will receive.</p>
    <Checklist items={[
      <>Open <GuideLink href="/admin/print-review">Print review</GuideLink> and inspect every offered artwork. Check orientation, edges, crop, color expectations, and whether the prepared file is ready.</>,
      step === 'studio_artwork' ? 'In each studio option, record the paper or canvas, dimensions, frame, finish, and instructions your contact needs. Approve its production source only after confirming your contact can use it. You can use the prepared master or document an agreed external source.' : 'Confirm each offered size and frame has the correct Lumaprints mapping and a ready print master. If a crop or master changes, wait for the prepared file to be ready before re-enabling that offer; ask DotWin to help prepare the file if needed.',
      'Order and inspect a physical sample through the chosen printer before approving a material or frame you have not seen. A screen preview does not confirm physical color, paper, or framing quality.',
      'Review originals separately: title, photos, dimensions, condition, included framing, price, and whether the original is actually available.',
    ]} />
    <Note>Do not enable an option until the source and production details are approved. Existing paid orders retain their purchased specifications when you later edit a product.</Note>
  </div>
  if (step === 'studio_workflow') return <div className="space-y-5">
    <p><GuideLink href="/admin/orders?view=studio">Your order queue</GuideLink> is your working list. You remain the person responsible for each customer, even when your contact does the physical work.</p>
    <Checklist items={[
      'Open a paid order and check the customer’s address, purchased size and frame, quantity, dispatch due date, and any payment or fulfillment hold. Resolve a hold before work starts.',
      'Set an assignee, due date, and private notes. Open the work ticket and the prepared production file; send the necessary order details to your contact by your agreed method. Nothing is automatically emailed to your contact.',
      'Move prints through Printing → Framing when needed → Packing. Originals can go straight to Packing. Use On hold with a reason when you need an answer.',
      'Buy the shipping label outside the site. When a parcel ships, record its item quantities, carrier, tracking, and optional actual postage. Use separate packages for split shipments; do not mark unshipped items as shipped.',
      'The platform records the package and queues the customer’s shipping update. Check notification failures and tracking, mark delivery when confirmed, and keep the remaining work moving.',
      'For problems, use the order’s refund, replacement, cancellation, and return tools. A partial refund does not cancel unfinished work. A shipped original is not available again until you record its physical return.',
    ]} />
    <Note>Share only the ticket, files, and delivery information needed for that order. Your contact does not need your admin password. A separate restricted helper login and automatic label purchasing are not part of this workflow.</Note>
  </div>
  if (step === 'luma_login') return <div className="space-y-5">
    <p>Lumaprints produces and ships eligible prints after a customer pays through your website. You choose the products, prices, and customer policies. Originals and studio-only options remain your responsibility.</p>
    <p><GuideLink href="https://dashboard.lumaprints.com">Open the Lumaprints dashboard</GuideLink> and confirm you can access the correct account and store.</p>
    <details className="rounded-lg border border-charcoal/15 p-4"><summary className="cursor-pointer font-semibold">Your saved Lumaprints sign-in details</summary><dl className="mt-3 space-y-2 break-all"><div><dt className="text-sm text-charcoal/60">Email / username</dt><dd>{state.notes.lumaprints_username || 'Ask DotWin to confirm the account owner and sign-in.'}</dd></div><div><dt className="text-sm text-charcoal/60">Saved password</dt><dd>{state.notes.lumaprints_password || 'Use your account password or the dashboard’s recovery process.'}</dd></div></dl></details>
    <p>Confirm with DotWin that the website is connected to this same Lumaprints store. Your website login and your Lumaprints login are separate. Coordinate any account-access changes so the existing connection can be verified afterward.</p>
    <Note>{state.connections.lumaprints ? 'The website’s Lumaprints connection settings are present. The rehearsal step will verify the order path.' : 'The Lumaprints connection settings are incomplete on this deployment. Your account access and store details are needed to finish that connection.'}</Note>
  </div>
  if (step === 'luma_billing') return <div className="space-y-5">
    <p>A customer’s payment goes to your Stripe account. Lumaprints charges your payment method for production and applicable shipping separately. Allow for the timing difference between that charge and your Stripe payout.</p>
    <Checklist items={['In Lumaprints billing settings, add a valid ongoing payment method and the correct billing address. Confirm it is the default for the connected store.', 'Review the current production and shipping costs for the products you plan to sell. Include those costs, payment fees, and your earnings when deciding retail prices.', 'Know how you will notice and resolve a billing failure. Orders may wait until payment is resolved; check your account and any card-expiry notices.']} />
    <p><GuideLink href="https://dashboard.lumaprints.com">Open Lumaprints billing</GuideLink></p>
  </div>
  if (step === 'prices' || step === 'margins') return <div className="space-y-5">
    <p>{step === 'prices' ? 'The starting prices are already populated. Your job is to decide what each original and print should sell for, then save those decisions.' : 'Review both the total amount a customer pays and the costs of fulfilling that order. Margin controls help calculate prices; they are not a guarantee of your take-home earnings.'}</p>
    <Checklist items={[
      <>Open <GuideLink href="/admin/products">Products</GuideLink>, choose a piece, and select its <strong>Lumaprints</strong> pricing profile.</>,
      'Set an original’s price in Base price and save the product. In the print-size table, review each size and frame; use its price override when you want to charge an exact amount.',
      'Automatic pricing can inherit a default from site settings, category, product, or an individual size. A more specific override takes priority. Check the displayed cost, price, and margin before saving; a saved manual price can override the automatic calculation.',
      'Include production, framing where offered, applicable shipping, payment fees, and the earnings you want to keep. Review whether customer shipping is included or charged separately so you do not accidentally count it twice.',
      'Refresh provider costs and prices when needed, then inspect the final storefront amounts. Keep unavailable sizes inactive. Studio prices remain independent if you change fulfillment later.',
    ]} />
  </div>
  if (step === 'luma_workflow') return <div className="space-y-5">
    <Checklist items={[
      <>A paid, eligible print is queued for Lumaprints. Watch <GuideLink href="/admin/orders?view=all">Orders</GuideLink> for submission, production, and shipment status; a payment, file, or billing issue can require attention.</>,
      'Orders containing originals or studio-only options also create work in your studio queue. Handle those items yourself and record their packages; mixed orders may arrive in separate parcels.',
      'A website refund or cancellation does not promise that an already submitted print has stopped. Check Lumaprints production status and coordinate any cancellation or customer remedy before assuming the item will not ship.',
      'Turning Lumaprints off stops new printer requests and pauses unsubmitted provider work. Already submitted or in-flight work must be reviewed. Turning it back on does not automatically reprint paid studio orders or resume every paused item.',
      'Keep your account billing, artwork sources, customer policies, and support inbox current. The integration handles the transfer; you still own the customer relationship.',
    ]} />
  </div>
  if (step === 'studio_test_order' || step === 'luma_test_order') return <div className="space-y-5">
    <p>Rehearse with DotWin before opening the shop. Use Stripe’s test setup and test cards, with a controlled email address and shipping address. Test payments do not move money, but a printer connection or email service can still perform real work.</p>
    <Checklist items={[
      'While the site is password-protected, have DotWin confirm the test checkout, payment-confirmation connection, and email setup. If any configuration is missing, finish it before starting the rehearsal.',
      'Try a print, an original, and a mixed cart. Check sizes, framing, quantities, included shipping or flat fees, destination coverage, totals, and the confirmation page.',
      step === 'studio_test_order' ? 'Verify the paid test order reaches the studio queue and no Lumaprints order is created. Practice the work ticket, production stages, and a split shipment with your contact using clearly identified test data.' : 'Coordinate a Lumaprints sandbox or agreed non-production exercise with DotWin before submitting. Stripe test mode alone does not switch the printer into a sandbox. Confirm the right items, artwork files, address, and quantities reach the expected provider account.',
      'Verify customer updates with the controlled recipient and check a refund, cancellation, and original-inventory release. Confirm that shipment tracking and any remaining quantities are clear.',
      'Finish or cancel the rehearsal work, then return Stripe to live mode only after the live connection and your account are ready. Review the first genuine customer order closely after launch.',
    ]} />
    <p><GuideLink href="https://docs.stripe.com/testing">Stripe’s test-payment instructions</GuideLink></p>
    <Note>Mark this complete after the chosen path has actually been rehearsed. A successful rehearsal of one fulfillment path does not approve the other path.</Note>
  </div>
  return <div className="space-y-5">
    <p>The storefront, checkout, and order tools are built. These final choices belong to you because you know your work, your customers, and the promises you can make.</p>
    <Checklist items={[
      <>Review the public <GuideLink href="/shop">shop</GuideLink>: titles, descriptions, dimensions, frames, original availability, prices, and the photos that represent each piece.</>,
      <>Review <GuideLink href="/shipping-policy">Shipping policy</GuideLink> and your <GuideLink href="/tos">Terms</GuideLink>. Set truthful dispatch expectations, shipping destinations, damage/return instructions, and a contact method customers can use. Ask your adviser about any business or tax questions specific to your situation.</>,
      <>In <GuideLink href="/admin/settings">Settings</GuideLink>, check the business and support details, order-notification address, pricing/tax settings, and website password. Have DotWin confirm that order emails arrive from the intended address.</>,
      'Review discounts and promotions against the prices you chose. Confirm that every active offer can be made and shipped with the selected fulfillment method.',
      'Use the final review screen to see both your completed decisions and the detected service connections. Open the public store only when both are ready.',
    ]} />
    <Note>You do not need to redesign the website or build another order system. You need to approve the business details and account information that the platform should use.</Note>
  </div>
}
