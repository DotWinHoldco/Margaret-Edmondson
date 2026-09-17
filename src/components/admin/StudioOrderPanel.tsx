'use client'

import { useCallback, useEffect, useState } from 'react'
import { useRouter } from 'next/navigation'
import {
  remainingToShip,
  STUDIO_LABELS,
  type StudioJob,
  type StudioShipment,
  type StudioStage,
} from '@/lib/fulfillment/studio'
import {
  DESCRIBED_DETAIL_KEYS,
  asPurchaseSpec,
  describePurchaseSpec,
  shortLineHash,
  specOptionsText,
} from '@/lib/orders/print-options'

const input =
  'mt-1 w-full min-w-0 rounded-md border border-charcoal/20 bg-white px-3 py-2 font-body text-sm'
interface Event {
  id: string
  event_type: string
  detail: Record<string, string>
  created_at: string
}

function WorkItem({
  job,
  onSave,
  busy,
}: {
  job: StudioJob
  onSave: (data: Record<string, unknown>) => Promise<void>
  busy: boolean
}) {
  const [draft, setDraft] = useState(job)
  const [replacementReason, setReplacementReason] = useState('')
  const [replacementId] = useState(() => crypto.randomUUID())
  const spec = job.item.purchase_spec
  // P7: the ticket describes the FROZEN purchase, never the live catalog.
  const frozen = asPurchaseSpec(spec)
  const described = describePurchaseSpec(frozen)
  const options = specOptionsText(described.options)
  const hash = shortLineHash(frozen)
  const closed = ['shipped', 'delivered', 'cancelled'].includes(job.status)
  return (
    <div className="rounded-lg border border-charcoal/10 p-4">
      <div className="flex flex-wrap justify-between gap-2">
        <h3 className="font-display text-lg">
          {described.title} · {described.line || described.kind}
        </h3>
        <span className="font-body text-xs text-teal">
          {job.replacement_of ? 'Replacement · ' : ''}
          {STUDIO_LABELS[job.status]} · Qty {job.quantity}
        </span>
      </div>
      <p className="mt-1 font-body text-sm text-charcoal/65">
        {spec.width_in && spec.height_in
          ? `${spec.width_in} × ${spec.height_in} in`
          : spec.size_label}{' '}
        {spec.medium?.replaceAll('_', ' ')}
      </p>
      {options ? (
        <p className="mt-1 font-body text-sm text-charcoal/65">{options}</p>
      ) : null}
      {described.colorHex ? (
        <p className="mt-1 flex items-center gap-1.5 font-body text-sm text-charcoal/65">
          <span
            aria-hidden="true"
            className="inline-block h-3 w-3 rounded-sm border border-charcoal/20"
            style={{ backgroundColor: described.colorHex }}
          />
          {described.colorHex}
        </p>
      ) : null}
      {hash ? (
        <p className="mt-1 font-mono text-xs text-charcoal/45">{hash}</p>
      ) : null}
      {spec.details && (
        <dl className="mt-3 space-y-1 font-body text-sm">
          {Object.entries(spec.details)
            .filter(
              ([k, v]) =>
                v &&
                !DESCRIBED_DETAIL_KEYS.includes(k) &&
                (typeof v === 'string' || typeof v === 'number'),
            )
            .map(([k, v]) => (
              <div key={k} className="flex flex-wrap gap-2">
                <dt className="capitalize text-charcoal/60">{k}:</dt>
                <dd>{String(v)}</dd>
              </div>
            ))}
        </dl>
      )}
      {spec.kind !== 'original' && (
        <a
          href={`/api/admin/order-items/${job.order_item_id}/production-file`}
          target="_blank"
          rel="noreferrer"
          className="mt-3 inline-block font-body text-sm text-teal underline"
        >
          Open purchased production file
        </a>
      )}
      {!closed && (
        <>
          <div className="mt-4 grid gap-3 sm:grid-cols-2">
            <label className="font-body text-sm">
              Stage
              <select
                className={input}
                value={draft.status}
                onChange={(e) =>
                  setDraft({ ...draft, status: e.target.value as StudioStage })
                }
              >
                {(
                  [
                    'new',
                    ...(spec.kind === 'original'
                      ? []
                      : ['printing', 'framing']),
                    'packing',
                    'on_hold',
                    'cancelled',
                  ] as StudioStage[]
                ).map((s) => (
                  <option key={s} value={s}>
                    {STUDIO_LABELS[s]}
                  </option>
                ))}
              </select>
            </label>
            <label className="font-body text-sm">
              Assigned to
              <input
                className={input}
                value={draft.assignee}
                onChange={(e) =>
                  setDraft({ ...draft, assignee: e.target.value })
                }
              />
            </label>
            <label className="font-body text-sm">
              Promised ship date
              <input
                type="date"
                className={input}
                value={draft.due_at.slice(0, 10)}
                onChange={(e) =>
                  e.target.value &&
                  setDraft({
                    ...draft,
                    due_at: `${e.target.value}T18:00:00.000Z`,
                  })
                }
              />
            </label>
            {draft.status === 'on_hold' && (
              <label className="font-body text-sm">
                Hold reason
                <input
                  className={input}
                  value={draft.hold_reason || ''}
                  onChange={(e) =>
                    setDraft({ ...draft, hold_reason: e.target.value })
                  }
                />
              </label>
            )}
          </div>
          <label className="mt-3 block font-body text-sm">
            Internal notes
            <textarea
              rows={3}
              className={input}
              value={draft.notes}
              onChange={(e) => setDraft({ ...draft, notes: e.target.value })}
            />
          </label>
          <button
            type="button"
            disabled={busy}
            className="mt-3 rounded-md bg-teal px-4 py-2 font-body text-sm text-white disabled:opacity-50"
            onClick={() =>
              onSave({
                action: 'update',
                job_id: job.id,
                revision: job.revision,
                status: draft.status,
                assignee: draft.assignee,
                notes: draft.notes,
                due_at: draft.due_at,
                hold_reason: draft.hold_reason,
              })
            }
          >
            Save work progress
          </button>
        </>
      )}
      {spec.kind === 'original' &&
        job.item.shipped_at &&
        !job.item.returned_at && (
          <details className="mt-4">
            <summary className="cursor-pointer font-body text-sm text-teal">
              Receive a refunded original
            </summary>
            <p className="mt-2 font-body text-sm">
              Only restock after the original is physically back and available
              to sell.
            </p>
            <label className="mt-2 block font-body text-sm">
              Return condition
              <input
                className={input}
                value={replacementReason}
                onChange={(e) => setReplacementReason(e.target.value)}
              />
            </label>
            <button
              disabled={busy || !replacementReason.trim()}
              onClick={() =>
                onSave({
                  action: 'receive_return',
                  item_id: job.order_item_id,
                  reason: replacementReason,
                })
              }
              className="mt-3 rounded-md border border-teal px-4 py-2 font-body text-sm text-teal disabled:opacity-50"
            >
              Confirm received &amp; restock
            </button>
          </details>
        )}
      {['shipped', 'delivered'].includes(job.status) &&
        spec.kind !== 'original' && (
          <details className="mt-4">
            <summary className="cursor-pointer font-body text-sm text-teal">
              Create replacement work
            </summary>
            <label className="mt-3 block font-body text-sm">
              Reason
              <input
                className={input}
                value={replacementReason}
                onChange={(e) => setReplacementReason(e.target.value)}
              />
            </label>
            <button
              type="button"
              disabled={busy || !replacementReason.trim()}
              className="mt-3 rounded-md border border-teal px-4 py-2 font-body text-sm text-teal disabled:opacity-50"
              onClick={() =>
                onSave({
                  action: 'replace',
                  job_id: job.id,
                  request_id: replacementId,
                  reason: replacementReason,
                })
              }
            >
              Create replacement ticket
            </button>
          </details>
        )}
    </div>
  )
}

export default function StudioOrderPanel({ orderId }: { orderId: string }) {
  const [jobs, setJobs] = useState<StudioJob[]>([]),
    [shipments, setShipments] = useState<StudioShipment[]>([]),
    [events, setEvents] = useState<Event[]>([])
  const [paused, setPaused] = useState<
    Array<{ id: string; external_order_id: string | null }>
  >([])
  const [review, setReview] = useState<string | null>(null),
    [reviewReason, setReviewReason] = useState('')
  const [notifications, setNotifications] = useState<
    Array<{
      id: string
      studio_notifications: Array<{ status: string; last_error: string | null }>
    }>
  >([])
  const [busy, setBusy] = useState(false),
    [message, setMessage] = useState(''),
    [loaded, setLoaded] = useState(false)
  const [carrier, setCarrier] = useState(''),
    [tracking, setTracking] = useState(''),
    [url, setUrl] = useState(''),
    [postage, setPostage] = useState('')
  const [quantities, setQuantities] = useState<Record<string, number>>({}),
    [shipmentId, setShipmentId] = useState(() => crypto.randomUUID())
  const [transferReason, setTransferReason] = useState('')
  const [refundAmount, setRefundAmount] = useState(''),
    [refundReason, setRefundReason] = useState(''),
    [refundId, setRefundId] = useState(() => crypto.randomUUID())
  const router = useRouter()
  const load = useCallback(async () => {
    const r = await fetch(`/api/admin/orders/${orderId}/studio`)
    const d = await r.json()
    if (!r.ok) throw new Error(d.error || 'Could not load studio work.')
    setJobs(d.jobs || [])
    setShipments(d.shipments || [])
    setEvents(d.events || [])
    setPaused(d.paused || [])
    setReview(d.review?.fulfillment_hold_reason || null)
    setNotifications(d.notifications || [])
    setLoaded(true)
  }, [orderId])
  useEffect(() => {
    load().catch((e) => setMessage(e.message))
  }, [load])
  async function action(data: Record<string, unknown>) {
    setBusy(true)
    setMessage('')
    try {
      const r = await fetch(`/api/admin/orders/${orderId}/studio`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(data),
      })
      const d = await r.json()
      if (!r.ok) throw new Error(d.error || 'Could not save')
      await load()
      if (data.action === 'ship') {
        setShipmentId(crypto.randomUUID())
        setQuantities({})
        setTracking('')
        setUrl('')
        setPostage('')
      }
      setMessage(
        data.action === 'ship'
          ? 'Shipment saved. The customer notification is queued.'
          : 'Saved.',
      )
      router.refresh()
    } catch (e) {
      setMessage(e instanceof Error ? e.message : 'Could not save')
    } finally {
      setBusy(false)
    }
  }
  async function refund() {
    setBusy(true)
    setMessage('')
    try {
      const r = await fetch(`/api/admin/orders/${orderId}/refund`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          request_id: refundId,
          amount_cents: Math.round(Number(refundAmount) * 100),
          reason: refundReason,
        }),
      })
      const d = await r.json()
      if (!r.ok) throw new Error(d.error || 'Refund failed')
      setMessage(
        d.status === 'succeeded'
          ? 'Refund completed. Review any remaining work in the queue.'
          : 'The payment processor is processing this refund.',
      )
      setRefundId(crypto.randomUUID())
      setRefundAmount('')
      setRefundReason('')
      await load()
      router.refresh()
    } catch (e) {
      setMessage(e instanceof Error ? e.message : 'Refund failed')
    } finally {
      setBusy(false)
    }
  }
  if (loaded && !jobs.length && !paused.length && !review) return null
  return (
    <section className="rounded-xl border border-teal/20 bg-white p-5 sm:p-6">
      <div className="flex flex-wrap justify-between gap-3">
        <div>
          <h2 className="font-display text-2xl text-charcoal">Studio work</h2>
          <p className="mt-1 font-body text-sm text-charcoal/60">
            Purchased specifications stay attached to each work ticket.
          </p>
        </div>
        <div className="flex flex-wrap gap-3">
          <a
            target="_blank"
            rel="noreferrer"
            href={`/api/admin/orders/${orderId}/packet?kind=work`}
            className="font-body text-sm text-teal underline"
          >
            Print work tickets
          </a>
          <a
            target="_blank"
            rel="noreferrer"
            href={`/api/admin/orders/${orderId}/packet?kind=packing`}
            className="font-body text-sm text-teal underline"
          >
            Print packing slip
          </a>
        </div>
      </div>
      {review && (
        <div className="mt-4 rounded-md border border-coral/30 bg-coral/5 p-4">
          <h3 className="font-display text-lg">
            Payment or shipping needs review
          </h3>
          <p className="mt-2 font-body text-sm">{review}</p>
          <p className="mt-2 font-body text-sm">
            Production is stopped. Confirm the paid items and arrange any
            shipping difference with the customer before releasing this hold.
          </p>
          <label className="mt-3 block font-body text-sm">
            Resolution
            <input
              className={input}
              value={reviewReason}
              onChange={(e) => setReviewReason(e.target.value)}
            />
          </label>
          <button
            disabled={busy || !reviewReason.trim()}
            onClick={() =>
              action({ action: 'release_hold', reason: reviewReason })
            }
            className="mt-3 rounded-md border border-teal px-4 py-2 font-body text-sm text-teal disabled:opacity-50"
          >
            Confirm review &amp; release work
          </button>
        </div>
      )}
      {!!paused.length && (
        <div className="mt-4 rounded-md bg-gold/10 p-4">
          <h3 className="font-display text-lg">Paused Lumaprints work</h3>
          <p className="font-body text-sm">
            Confirm no order exists with the printer before transferring.
            Existing submitted orders cannot be transferred here.
          </p>
          <label className="mt-2 block font-body text-sm">
            Transfer reason / verification
            <input
              className={input}
              value={transferReason}
              onChange={(e) => setTransferReason(e.target.value)}
            />
          </label>
          {paused.map((i) => (
            <div key={i.id}>
              <button
                type="button"
                disabled={
                  busy || !!i.external_order_id || !transferReason.trim()
                }
                onClick={() =>
                  action({
                    action: 'transfer',
                    item_id: i.id,
                    reason: transferReason,
                  })
                }
                className="mr-2 mt-3 rounded-md border border-teal px-3 py-2 font-body text-sm text-teal disabled:opacity-50"
              >
                Move item {i.id.slice(0, 8)} to studio
              </button>
              <button
                type="button"
                disabled={
                  busy || !!i.external_order_id || !transferReason.trim()
                }
                onClick={() =>
                  action({
                    action: 'resume_provider',
                    item_id: i.id,
                    reason: transferReason,
                  })
                }
                className="mr-2 mt-3 rounded-md border border-charcoal/30 px-3 py-2 font-body text-sm disabled:opacity-50"
              >
                Resume with Lumaprints
              </button>
            </div>
          ))}
        </div>
      )}
      <div className="mt-5 space-y-4">
        {jobs.map((job) => (
          <WorkItem
            key={`${job.id}:${job.revision}`}
            job={job}
            onSave={action}
            busy={busy}
          />
        ))}
      </div>
      {jobs.some((j) => j.status === 'packing') && (
        <details open className="mt-5 rounded-lg bg-cream p-4">
          <summary className="cursor-pointer font-display text-xl">
            Record a shipment
          </summary>
          <p className="mt-2 font-body text-sm text-charcoal/65">
            Buy your label with your preferred carrier, then record the package
            here. Choose only the quantities in this package.
          </p>
          <div className="mt-3 space-y-2">
            {jobs
              .filter((j) => j.status === 'packing')
              .map((j) => {
                const packing = describePurchaseSpec(
                  asPurchaseSpec(j.item.purchase_spec),
                )
                const packingLine = packing.line || packing.title
                return (
                <label
                  key={j.id}
                  className="flex items-center justify-between gap-4 font-body text-sm"
                >
                  <span>
                    {packingLine} · {remainingToShip(j, shipments)} remaining
                  </span>
                  <input
                    aria-label={`Quantity for ${packingLine}`}
                    type="number"
                    min="0"
                    max={remainingToShip(j, shipments)}
                    value={quantities[j.id] || 0}
                    onChange={(e) =>
                      setQuantities({
                        ...quantities,
                        [j.id]: Number(e.target.value),
                      })
                    }
                    className="w-20 rounded-md border border-charcoal/20 p-2"
                  />
                </label>
                )
              })}
          </div>
          <div className="mt-4 grid gap-3 sm:grid-cols-2">
            <label className="font-body text-sm">
              Carrier
              <input
                className={input}
                placeholder="UPS, USPS, FedEx…"
                value={carrier}
                onChange={(e) => setCarrier(e.target.value)}
              />
            </label>
            <label className="font-body text-sm">
              Tracking number
              <input
                className={input}
                value={tracking}
                onChange={(e) => setTracking(e.target.value)}
              />
            </label>
            <label className="font-body text-sm">
              Tracking URL (optional)
              <input
                className={input}
                type="url"
                value={url}
                onChange={(e) => setUrl(e.target.value)}
              />
            </label>
            <label className="font-body text-sm">
              Actual postage ($, optional)
              <input
                className={input}
                type="number"
                min="0"
                step="0.01"
                value={postage}
                onChange={(e) => setPostage(e.target.value)}
              />
            </label>
          </div>
          <button
            type="button"
            disabled={
              busy ||
              !carrier.trim() ||
              !tracking.trim() ||
              !Object.values(quantities).some((q) => q > 0)
            }
            className="mt-4 rounded-md bg-teal px-4 py-2 font-body text-sm text-white disabled:opacity-50"
            onClick={() =>
              action({
                action: 'ship',
                request_id: shipmentId,
                carrier,
                tracking_number: tracking,
                tracking_url: url || null,
                postage_cents:
                  postage === '' ? null : Math.round(Number(postage) * 100),
                items: Object.entries(quantities)
                  .filter(([, q]) => q > 0)
                  .map(([job_id, quantity]) => ({ job_id, quantity })),
              })
            }
          >
            Save shipment &amp; notify customer
          </button>
        </details>
      )}
      {!!shipments.length && (
        <div className="mt-5">
          <h3 className="font-display text-xl">Packages</h3>
          {shipments.map((s) => (
            <div
              key={s.id}
              className="mt-3 flex flex-wrap items-center justify-between gap-3 border-b border-charcoal/10 pb-3 font-body text-sm"
            >
              <span>
                {s.carrier} · {s.tracking_number} ·{' '}
                {s.delivered_at ? 'Delivered' : 'Shipped'}
                {notifications
                  .find((n) => n.id === s.id)
                  ?.studio_notifications.map((n) => (
                    <small key={n.status} className="ml-2 text-charcoal/65">
                      Email: {n.status}
                      {n.last_error ? ` — ${n.last_error}` : ''}
                      {n.status === 'failed' && (
                        <button
                          disabled={busy}
                          onClick={() =>
                            action({ action: 'retry_email', shipment_id: s.id })
                          }
                          className="ml-2 text-teal underline"
                        >
                          Retry email
                        </button>
                      )}
                    </small>
                  ))}
              </span>
              {!s.delivered_at && (
                <button
                  disabled={busy}
                  onClick={() =>
                    action({ action: 'deliver', shipment_id: s.id })
                  }
                  className="rounded-md border border-teal px-3 py-2 text-teal"
                >
                  Mark delivered
                </button>
              )}
            </div>
          ))}
        </div>
      )}
      <details className="mt-5">
        <summary className="cursor-pointer font-body text-sm text-teal">
          Refund an amount
        </summary>
        <p className="mt-2 font-body text-sm text-charcoal/65">
          A partial refund leaves remaining production active. Put affected work
          on hold or cancel it separately. A full refund stops unfinished work
          when confirmed by the payment processor.
        </p>
        <div className="mt-3 grid gap-3 sm:grid-cols-2">
          <label className="font-body text-sm">
            Refund amount ($)
            <input
              className={input}
              type="number"
              min="0.01"
              step="0.01"
              value={refundAmount}
              onChange={(e) => setRefundAmount(e.target.value)}
            />
          </label>
          <label className="font-body text-sm">
            Reason
            <input
              className={input}
              value={refundReason}
              onChange={(e) => setRefundReason(e.target.value)}
            />
          </label>
        </div>
        <button
          disabled={busy || Number(refundAmount) <= 0 || !refundReason.trim()}
          onClick={refund}
          className="mt-3 rounded-md border border-coral px-4 py-2 font-body text-sm text-coral disabled:opacity-50"
        >
          Issue refund
        </button>
      </details>
      {!!events.length && (
        <details className="mt-5">
          <summary className="cursor-pointer font-body text-sm text-teal">
            Order activity
          </summary>
          <ol className="mt-3 space-y-2">
            {events.map((e) => (
              <li key={e.id} className="font-body text-xs text-charcoal/65">
                {new Date(e.created_at).toLocaleString()} ·{' '}
                {e.event_type.replaceAll('_', ' ')}{' '}
                {e.detail.to ? `· ${e.detail.from} → ${e.detail.to}` : ''}
              </li>
            ))}
          </ol>
        </details>
      )}
      {message && (
        <p
          role="status"
          className="mt-4 rounded-md border border-charcoal/10 p-3 font-body text-sm"
        >
          {message}
        </p>
      )}
    </section>
  )
}
