'use client'

/**
 * Owner launch sequence — a guided go-live checklist that sits over the admin
 * dashboard while the site is still password-gated.
 *
 * State lives in site_settings via /api/admin/launch (steps, hidden flag) and
 * /api/admin/settings/gate (the actual go-live switch). The five prep steps
 * must be marked complete before GO LIVE unlocks — the API enforces the same
 * rule server-side, so hiding the modal or calling the endpoint directly
 * cannot skip the sequence. Print-partner credentials are fetched from the
 * admin-only API at runtime; they are never compiled into this (public)
 * client bundle.
 */

import { useCallback, useEffect, useState } from 'react'
import Link from 'next/link'

interface StepState {
  done: boolean
  at: string | null
}

interface LaunchState {
  steps: Partial<Record<string, StepState>>
  hidden: boolean
  gateEnabled: boolean
  notes: Record<string, string>
  missingPrepSteps: string[]
  readyToGoLive: boolean
}

const PREP_KEYS = ['luma_login', 'luma_billing', 'crops', 'prices', 'margins'] as const

export default function LaunchSequence() {
  const [state, setState] = useState<LaunchState | null>(null)
  const [expanded, setExpanded] = useState<string | null>('luma_login')
  const [saving, setSaving] = useState<string | null>(null)
  const [goLiveBusy, setGoLiveBusy] = useState(false)
  const [goLiveError, setGoLiveError] = useState<string | null>(null)
  const [confirmingGoLive, setConfirmingGoLive] = useState(false)
  const [wentLive, setWentLive] = useState(false)

  useEffect(() => {
    let cancelled = false
    async function load() {
      try {
        const res = await fetch('/api/admin/launch')
        if (!res.ok) return
        const json = (await res.json()) as LaunchState
        if (!cancelled) {
          setState(json)
          const firstOpen = PREP_KEYS.find((k) => json.steps[k]?.done !== true)
          setExpanded(firstOpen ?? 'go_live')
        }
      } catch {
        /* the dashboard stays usable without the modal */
      }
    }
    load()
    return () => {
      cancelled = true
    }
  }, [])

  const patchLaunch = useCallback(async (body: Record<string, unknown>, busyKey: string) => {
    setSaving(busyKey)
    try {
      const res = await fetch('/api/admin/launch', {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(body),
      })
      if (res.ok) setState((await res.json()) as LaunchState)
    } finally {
      setSaving(null)
    }
  }, [])

  async function goLive() {
    setGoLiveBusy(true)
    setGoLiveError(null)
    try {
      const res = await fetch('/api/admin/settings/gate', {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ enabled: false }),
      })
      const json = await res.json()
      if (!res.ok) {
        setGoLiveError(
          json?.code === 'LAUNCH_INCOMPLETE'
            ? 'A step above is not marked complete yet — finish the list and this button unlocks.'
            : json?.error || 'Could not go live. Please try again.',
        )
        return
      }
      setWentLive(true)
    } catch {
      setGoLiveError('Could not go live. Please try again.')
    } finally {
      setGoLiveBusy(false)
      setConfirmingGoLive(false)
    }
  }

  if (!state || (!state.gateEnabled && !wentLive)) return null

  const doneCount = PREP_KEYS.filter((k) => state.steps[k]?.done === true).length

  if (state.hidden && !wentLive) {
    return (
      <button
        type="button"
        onClick={() => patchLaunch({ hidden: false }, 'hidden')}
        className="fixed bottom-6 right-6 z-[90] flex items-center gap-2 rounded-full bg-teal px-5 py-3 font-body text-sm font-semibold text-cream shadow-lg transition-colors hover:bg-deep-teal"
      >
        <span aria-hidden>🚀</span> Launch checklist · {doneCount}/{PREP_KEYS.length}
      </button>
    )
  }

  const notes = state.notes || {}
  const lumaUrl = notes.lumaprints_dashboard_url || 'https://dashboard.lumaprints.com'

  return (
    <div className="fixed inset-0 z-[95] flex items-start justify-center overflow-y-auto bg-charcoal/45 p-4 backdrop-blur-sm sm:p-8">
      <div className="w-full max-w-2xl rounded-2xl bg-cream shadow-2xl">
        {wentLive ? (
          <div className="p-10 text-center">
            <div className="text-5xl" aria-hidden>🎉</div>
            <h2 className="mt-4 font-display text-3xl font-bold text-charcoal">You are live!</h2>
            <p className="mx-auto mt-3 max-w-md font-body text-sm text-charcoal/70">
              The password is off and your store is open to the world. It can take up to a minute
              for every visitor to see it. Congratulations, Margaret — it is a beautiful shop.
            </p>
            <div className="mt-6 flex items-center justify-center gap-3">
              <a
                href="/"
                target="_blank"
                rel="noopener noreferrer"
                className="rounded-lg bg-teal px-6 py-2.5 font-body text-sm font-semibold text-cream transition-colors hover:bg-deep-teal"
              >
                Open your live site
              </a>
              <button
                type="button"
                onClick={() => setState((s) => (s ? { ...s, gateEnabled: false } : s))}
                className="rounded-lg border border-charcoal/15 px-6 py-2.5 font-body text-sm font-medium text-charcoal hover:bg-charcoal/5"
              >
                Back to the dashboard
              </button>
            </div>
          </div>
        ) : (
          <>
            <div className="border-b border-charcoal/10 p-6 sm:p-8">
              <div className="flex items-start justify-between gap-4">
                <div>
                  <p className="font-body text-xs font-semibold uppercase tracking-[0.16em] text-teal">
                    ArtByME · Launch sequence
                  </p>
                  <h2 className="mt-1 font-display text-2xl font-bold text-charcoal sm:text-3xl">
                    Let&apos;s get you launched, Margaret
                  </h2>
                  <p className="mt-2 font-body text-sm text-charcoal/65">
                    Work through these {PREP_KEYS.length} steps at your own pace, checking each one
                    off as you finish it. When every step is done, the big button at the end opens
                    your store to the world. You can hide this any time — the little rocket in the
                    corner brings it back.
                  </p>
                </div>
                <button
                  type="button"
                  onClick={() => patchLaunch({ hidden: true }, 'hidden')}
                  disabled={saving === 'hidden'}
                  className="shrink-0 rounded-lg border border-charcoal/15 px-3 py-1.5 font-body text-xs font-medium text-charcoal/70 hover:bg-charcoal/5"
                >
                  Hide for now
                </button>
              </div>
              <div className="mt-5">
                <div className="flex items-center justify-between font-body text-xs text-charcoal/55">
                  <span>
                    {doneCount} of {PREP_KEYS.length} steps complete
                  </span>
                  <span>{state.readyToGoLive ? 'Ready to go live!' : 'Keep going — almost there'}</span>
                </div>
                <div className="mt-1.5 h-2 overflow-hidden rounded-full bg-charcoal/10">
                  <div
                    className="h-full rounded-full bg-teal transition-all"
                    style={{ width: `${(doneCount / PREP_KEYS.length) * 100}%` }}
                  />
                </div>
              </div>
            </div>

            <div className="space-y-3 p-6 sm:p-8">
              <Step
                index={1}
                stepKey="luma_login"
                title="Sign in to your print partner, Lumaprints"
                state={state}
                expanded={expanded}
                saving={saving}
                onToggleExpand={setExpanded}
                onMark={(k, done) => patchLaunch({ step: k, done }, k)}
              >
                <p>
                  Lumaprints is the professional print shop that makes and ships every print your
                  customers order. You have an account ready and waiting:
                </p>
                <div className="mt-3 space-y-1.5 rounded-lg bg-white p-4 font-body text-sm">
                  <p>
                    <span className="inline-block w-24 text-charcoal/50">Website</span>
                    <a href={lumaUrl} target="_blank" rel="noopener noreferrer" className="font-medium text-teal underline hover:text-deep-teal">
                      dashboard.lumaprints.com
                    </a>
                  </p>
                  <p>
                    <span className="inline-block w-24 text-charcoal/50">Username</span>
                    <span className="font-medium text-charcoal">{notes.lumaprints_username || '(ask Skylar)'}</span>
                  </p>
                  <p>
                    <span className="inline-block w-24 text-charcoal/50">Password</span>
                    <span className="font-medium text-charcoal">{notes.lumaprints_password || '(ask Skylar)'}</span>
                  </p>
                </div>
                <div className="mt-3 rounded-lg border border-amber-300 bg-amber-50 p-3 text-amber-900">
                  <p className="font-semibold">Please keep the email and password exactly as they are for now.</p>
                  <p className="mt-1">
                    We verify your very first real order end to end first. The moment that is
                    confirmed, you get the all-clear to change both and make the account fully
                    yours. You can go live before that — it will not hold anything up.
                  </p>
                </div>
                <p className="mt-3">Once you can see the Lumaprints dashboard, check this step off.</p>
              </Step>

              <Step
                index={2}
                stepKey="luma_billing"
                title="Add your address and a permanent payment card in Lumaprints"
                state={state}
                expanded={expanded}
                saving={saving}
                onToggleExpand={setExpanded}
                onMark={(k, done) => patchLaunch({ step: k, done }, k)}
              >
                <p>
                  Here is how the money works: a customer pays you full price on your site, and
                  Lumaprints then charges this card only the wholesale printing cost when they make
                  the print. The difference is your profit, automatically.
                </p>
                <ol className="mt-3 list-decimal space-y-1.5 pl-5">
                  <li>
                    In the Lumaprints dashboard, open the <strong>Billing</strong> (payment) settings.
                  </li>
                  <li>
                    Add your card and set it as the <strong>permanent, default</strong> payment
                    method — not a one-time payment.
                  </li>
                  <li>
                    Add your address as the account&apos;s <strong>default billing address</strong>.
                  </li>
                </ol>
                <div className="mt-3 rounded-lg border border-coral/40 bg-coral/[0.07] p-3 text-charcoal">
                  <p className="font-semibold">This step is the one that matters most.</p>
                  <p className="mt-1">
                    Without a valid default card and billing address, customer print orders park as
                    &ldquo;Pending Payment&rdquo; and nothing prints. If this card ever expires,
                    prints quietly stop until it is updated — worth a glance once a month.
                  </p>
                </div>
              </Step>

              <Step
                index={3}
                stepKey="crops"
                title="Double-check your print crops"
                state={state}
                expanded={expanded}
                saving={saving}
                onToggleExpand={setExpanded}
                onMark={(k, done) => patchLaunch({ step: k, done }, k)}
              >
                <p>
                  Every piece is currently set to print <strong>full frame</strong> — your whole
                  artwork, nothing trimmed away. Give them a once-over so you are happy with what
                  customers will receive.
                </p>
                <ol className="mt-3 list-decimal space-y-1.5 pl-5">
                  <li>
                    Open the{' '}
                    <Link href="/admin/print-review" className="font-medium text-teal underline hover:text-deep-teal">
                      print review gallery
                    </Link>{' '}
                    and look through each piece.
                  </li>
                  <li>
                    To adjust one: click it, find the <strong>Artwork source</strong> section, and
                    click <strong>Edit print crop</strong>.
                  </li>
                  <li>
                    Changing a crop pauses that piece&apos;s prints while its print file is rebuilt —
                    send Skylar a quick note and they come right back.
                  </li>
                </ol>
              </Step>

              <Step
                index={4}
                stepKey="prices"
                title="Set your prices, piece by piece"
                state={state}
                expanded={expanded}
                saving={saving}
                onToggleExpand={setExpanded}
                onMark={(k, done) => patchLaunch({ step: k, done }, k)}
              >
                <p>
                  Sensible starting prices are already in place everywhere, so nothing is broken if
                  you skip a piece — but these are your prices to own.
                </p>
                <ol className="mt-3 list-decimal space-y-1.5 pl-5">
                  <li>
                    Open{' '}
                    <Link href="/admin/products" className="font-medium text-teal underline hover:text-deep-teal">
                      Products
                    </Link>{' '}
                    and click a piece.
                  </li>
                  <li>
                    <strong>Base price</strong> is the piece&apos;s headline price — for an original
                    painting it IS the original&apos;s price. Type your number, then click{' '}
                    <strong>Save</strong> at the bottom.
                  </li>
                  <li>
                    Print sizes each have their own price in the <strong>Print sizes</strong> table
                    lower down — set an exact price with the little pencil next to any price, or
                    let the margin set it for you (next step).
                  </li>
                  <li>
                    A piece&apos;s <strong>Status</strong> controls the original: set it to{' '}
                    <strong>Sold</strong> when an original sells (prints keep selling), back to{' '}
                    <strong>Active</strong> to offer it again.
                  </li>
                </ol>
              </Step>

              <Step
                index={5}
                stepKey="margins"
                title="Know your margins (they set print prices automatically)"
                state={state}
                expanded={expanded}
                saving={saving}
                onToggleExpand={setExpanded}
                onMark={(k, done) => patchLaunch({ step: k, done }, k)}
              >
                <p>
                  Every print price is calculated as{' '}
                  <em>(printing cost + shipping) × (1 + your margin)</em>. You can set that margin
                  in four places, from broadest to most specific — and the most specific one always
                  wins:
                </p>
                <ol className="mt-3 list-decimal space-y-1.5 pl-5">
                  <li>
                    <strong>Site-wide</strong> —{' '}
                    <Link href="/admin/settings" className="font-medium text-teal underline hover:text-deep-teal">
                      Settings
                    </Link>
                    , in the <strong>Pricing</strong> section. The default for everything.
                  </li>
                  <li>
                    <strong>Per category</strong> — on{' '}
                    <Link href="/admin/products" className="font-medium text-teal underline hover:text-deep-teal">
                      Products
                    </Link>
                    , open <strong>Categories</strong>: each category can carry its own default margin.
                  </li>
                  <li>
                    <strong>Per piece</strong> — in a piece&apos;s editor, its margin field applies
                    to all of that piece&apos;s print sizes.
                  </li>
                  <li>
                    <strong>Per size</strong> — in the <strong>Print sizes</strong> table, each
                    row&apos;s <strong>Margin %</strong> box overrides everything else for just
                    that size.
                  </li>
                </ol>
                <p className="mt-3">
                  After changing margins, the <strong>Refresh all prices</strong> button on a
                  piece re-checks printing costs and recalculates. When the four levels make
                  sense to you, check this off.
                </p>
              </Step>

              {/* ── Go live ── */}
              <div
                className={`rounded-xl border-2 p-5 ${
                  state.readyToGoLive ? 'border-teal bg-teal/[0.06]' : 'border-dashed border-charcoal/20 bg-white/60'
                }`}
              >
                <div className="flex items-center gap-3">
                  <span
                    className={`flex h-8 w-8 shrink-0 items-center justify-center rounded-full font-body text-sm font-bold ${
                      state.readyToGoLive ? 'bg-teal text-cream' : 'bg-charcoal/10 text-charcoal/50'
                    }`}
                  >
                    6
                  </span>
                  <h3 className="font-display text-lg font-semibold text-charcoal">
                    Turn off the password and go live
                  </h3>
                </div>
                <p className="mt-2 pl-11 font-body text-sm text-charcoal/70">
                  Right now your site asks visitors for a password. This button removes it and
                  opens the store to everyone — payments are already live, so real cards are
                  charged for real orders from this moment. You can always re-gate the site later
                  under <strong>Settings → Site access</strong>.
                </p>
                <div className="mt-4 pl-11">
                  {!state.readyToGoLive ? (
                    <p className="font-body text-sm font-medium text-charcoal/50">
                      Complete the {PREP_KEYS.length} steps above to unlock this button.
                    </p>
                  ) : confirmingGoLive ? (
                    <div className="rounded-lg border border-teal/40 bg-white p-4">
                      <p className="font-body text-sm font-semibold text-charcoal">
                        Open your store to the world?
                      </p>
                      <p className="mt-1 font-body text-sm text-charcoal/65">
                        The password comes off and anyone can visit and buy. Ready?
                      </p>
                      <div className="mt-3 flex gap-3">
                        <button
                          type="button"
                          onClick={goLive}
                          disabled={goLiveBusy}
                          className="rounded-lg bg-teal px-5 py-2 font-body text-sm font-semibold text-cream transition-colors hover:bg-deep-teal disabled:opacity-50"
                        >
                          {goLiveBusy ? 'Going live…' : 'Yes — go live now'}
                        </button>
                        <button
                          type="button"
                          onClick={() => setConfirmingGoLive(false)}
                          disabled={goLiveBusy}
                          className="rounded-lg border border-charcoal/15 px-5 py-2 font-body text-sm font-medium text-charcoal hover:bg-charcoal/5"
                        >
                          Not yet
                        </button>
                      </div>
                    </div>
                  ) : (
                    <button
                      type="button"
                      onClick={() => setConfirmingGoLive(true)}
                      className="rounded-lg bg-teal px-6 py-3 font-body text-base font-bold text-cream shadow transition-colors hover:bg-deep-teal"
                    >
                      🚀 GO LIVE
                    </button>
                  )}
                  {goLiveError && <p className="mt-2 font-body text-sm text-coral">{goLiveError}</p>}
                </div>
              </div>
            </div>
          </>
        )}
      </div>
    </div>
  )
}

function Step({
  index,
  stepKey,
  title,
  state,
  expanded,
  saving,
  onToggleExpand,
  onMark,
  children,
}: {
  index: number
  stepKey: string
  title: string
  state: LaunchState
  expanded: string | null
  saving: string | null
  onToggleExpand: (key: string | null) => void
  onMark: (key: string, done: boolean) => void
  children: React.ReactNode
}) {
  const done = state.steps[stepKey]?.done === true
  const open = expanded === stepKey
  return (
    <div className={`rounded-xl border bg-white shadow-sm ${done ? 'border-teal/40' : 'border-charcoal/10'}`}>
      <button
        type="button"
        onClick={() => onToggleExpand(open ? null : stepKey)}
        className="flex w-full items-center gap-3 p-4 text-left"
      >
        <span
          className={`flex h-8 w-8 shrink-0 items-center justify-center rounded-full font-body text-sm font-bold ${
            done ? 'bg-teal text-cream' : 'bg-charcoal/10 text-charcoal/60'
          }`}
        >
          {done ? '✓' : index}
        </span>
        <span className={`flex-1 font-display text-base font-semibold ${done ? 'text-charcoal/60 line-through decoration-teal/50' : 'text-charcoal'}`}>
          {title}
        </span>
        <span className="font-body text-xs text-charcoal/40">{open ? '▲' : '▼'}</span>
      </button>
      {open && (
        <div className="border-t border-charcoal/8 px-4 pb-4 pl-[60px] pt-3 font-body text-sm text-charcoal/75">
          {children}
          <div className="mt-4">
            <button
              type="button"
              onClick={() => onMark(stepKey, !done)}
              disabled={saving === stepKey}
              className={`rounded-lg px-4 py-2 font-body text-sm font-semibold transition-colors disabled:opacity-50 ${
                done
                  ? 'border border-charcoal/15 text-charcoal/60 hover:bg-charcoal/5'
                  : 'bg-teal text-cream hover:bg-deep-teal'
              }`}
            >
              {saving === stepKey ? 'Saving…' : done ? 'Un-mark this step' : 'Mark this step complete'}
            </button>
          </div>
        </div>
      )}
    </div>
  )
}
