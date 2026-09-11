import Link from 'next/link'
import { createClient } from '@/lib/supabase/server'
import FulfillmentSettings from './FulfillmentSettings'
import {
  STUDIO_LABELS,
  STUDIO_STAGES,
  type StudioJob,
  type StudioStage,
} from '@/lib/fulfillment/studio'

export default async function StudioQueue({
  stage,
  search,
  page = 0,
}: {
  stage?: string
  search?: string
  page?: number
}) {
  const client = await createClient()
  const validStage =
    stage && STUDIO_STAGES.includes(stage as StudioStage) ? stage : null
  const [{ data, error }, { data: paused }, { data: held }] = await Promise.all(
    [
      client.rpc('list_studio_jobs', {
        p_stage: validStage,
        p_search: search || '',
        p_offset: page * 50,
      }),
      client
        .from('order_items')
        .select('id,order_id,purchase_spec,fulfillment_status')
        .eq('fulfillment_type', 'lumaprints')
        .in('fulfillment_status', ['paused', 'submitting'])
        .limit(50),
      client
        .from('orders')
        .select('id,fulfillment_hold_reason')
        .not('fulfillment_hold_reason', 'is', null)
        .in('status', ['processing', 'partially_fulfilled'])
        .limit(50),
    ],
  )
  if (error)
    throw new Error(
      'The studio queue could not be loaded. Verify the studio migration.',
    )
  const visible = (data || []).map(
    (row: { job: StudioJob }) => row.job,
  ) as StudioJob[]
  const count = data?.[0]?.total || 0
  return (
    <div className="mx-auto max-w-7xl space-y-6 px-4 py-8 sm:px-6">
      <FulfillmentSettings compact />
      <div className="flex flex-wrap items-end justify-between gap-4">
        <div>
          <h1 className="font-display text-3xl text-charcoal">
            My order queue
          </h1>
          <p className="mt-1 font-body text-sm text-charcoal/65">
            Paid studio work, ordered by promised ship date.
          </p>
        </div>
        <Link
          className="font-body text-sm text-teal underline"
          href="/admin/orders?view=all"
        >
          All orders &amp; payments
        </Link>
      </div>
      {!!held?.length && (
        <div className="rounded-lg border border-coral/30 bg-coral/5 p-4">
          <h2 className="font-display text-lg">
            Orders waiting for payment or shipping review
          </h2>
          {held.map((o) => (
            <p key={o.id} className="mt-2 font-body text-sm">
              <Link
                href={`/admin/orders/${o.id}`}
                className="text-teal underline"
              >
                #{o.id.slice(0, 8)}
              </Link>{' '}
              · {o.fulfillment_hold_reason}
            </p>
          ))}
        </div>
      )}
      {!!paused?.length && (
        <div className="rounded-lg border border-gold/30 bg-gold/10 p-4">
          <h2 className="font-display text-lg">Provider orders need review</h2>
          <p className="mt-1 font-body text-sm">
            Paused orders can be moved to the studio after checking they have
            not been submitted. In-progress submissions must be reconciled
            first.
          </p>
          <div className="mt-2 flex flex-wrap gap-3">
            {[...new Set(paused.map((i) => i.order_id))].map((id) => (
              <Link
                key={id}
                href={`/admin/orders/${id}`}
                className="font-body text-sm text-teal underline"
              >
                #{id.slice(0, 8).toUpperCase()}
              </Link>
            ))}
          </div>
        </div>
      )}
      <nav aria-label="Work stages" className="flex flex-wrap gap-2">
        <Link
          href="/admin/orders?view=studio"
          className={`rounded-md px-3 py-2 font-body text-sm ${!stage ? 'bg-teal text-white' : 'bg-white text-charcoal'}`}
        >
          Open work
        </Link>
        {STUDIO_STAGES.map((s) => (
          <Link
            key={s}
            href={`/admin/orders?view=studio&stage=${s}`}
            className={`rounded-md px-3 py-2 font-body text-sm ${stage === s ? 'bg-teal text-white' : 'bg-white text-charcoal'}`}
          >
            {STUDIO_LABELS[s]}
          </Link>
        ))}
      </nav>
      <form className="flex gap-2">
        <input type="hidden" name="view" value="studio" />
        {stage && <input type="hidden" name="stage" value={stage} />}
        <input
          name="q"
          defaultValue={search}
          aria-label="Search the order queue"
          placeholder="Find artwork, order, customer, or assignee"
          className="min-w-0 flex-1 rounded-md border border-charcoal/20 bg-white px-3 py-2 font-body text-sm"
        />
        <button className="rounded-md bg-charcoal px-4 py-2 font-body text-sm text-white">
          Find
        </button>
      </form>
      <div className="divide-y divide-charcoal/10 rounded-xl border border-charcoal/10 bg-white">
        {visible.length === 0 ? (
          <p className="p-8 font-body text-charcoal/60">
            No work in this view. Paid studio orders will appear here
            automatically.
          </p>
        ) : (
          visible.map((job) => (
            <Link
              key={job.id}
              href={`/admin/orders/${job.order_id}`}
              className="grid gap-3 p-5 transition-colors hover:bg-cream sm:grid-cols-[1fr_auto]"
            >
              <div>
                <p className="font-body text-xs text-charcoal/60">
                  #
                  {job.order?.order_number ||
                    job.order_id.slice(0, 8).toUpperCase()}{' '}
                  · {job.order?.email}
                </p>
                <h2 className="mt-1 font-display text-xl">
                  {job.item.purchase_spec.title || 'Artwork'}
                  {job.replacement_of ? ' · Replacement' : ''}
                </h2>
                <p className="mt-1 font-body text-sm text-charcoal/70">
                  {job.item.purchase_spec.option_name ||
                    job.item.purchase_spec.kind ||
                    'Artwork'}{' '}
                  · Qty {job.quantity}
                </p>
                <p className="mt-1 font-body text-xs text-charcoal/60">
                  Assigned to {job.assignee}
                </p>
              </div>
              <div className="sm:text-right">
                <span className="inline-block rounded-full bg-teal/10 px-3 py-1 font-body text-xs text-teal">
                  {STUDIO_LABELS[job.status]}
                </span>
                <p
                  className={`mt-2 font-body text-sm ${job.is_overdue ? 'text-coral' : 'text-charcoal/70'}`}
                >
                  Ship by{' '}
                  {new Date(job.due_at).toLocaleDateString('en-US', {
                    month: 'short',
                    day: 'numeric',
                    timeZone: 'America/Chicago',
                  })}
                </p>
                {job.hold_reason && (
                  <p className="mt-1 max-w-sm font-body text-xs text-coral">
                    {job.hold_reason}
                  </p>
                )}
              </div>
            </Link>
          ))
        )}
      </div>
      <div className="flex items-center justify-between font-body text-sm text-charcoal/60">
        <span>
          {count || 0} work items · Page {page + 1}
        </span>
        <div className="flex gap-4">
          {page > 0 && (
            <Link
              href={`/admin/orders?view=studio&stage=${stage || ''}&q=${encodeURIComponent(search || '')}&page=${page - 1}`}
            >
              Previous
            </Link>
          )}
          {(count || 0) > (page + 1) * 50 && (
            <Link
              href={`/admin/orders?view=studio&stage=${stage || ''}&q=${encodeURIComponent(search || '')}&page=${page + 1}`}
            >
              Next
            </Link>
          )}
        </div>
      </div>
    </div>
  )
}
