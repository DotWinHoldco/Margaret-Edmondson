'use client'
// Authored by DotWin
// The catalog sync control surface (ADR-7).
//
// A sync is chunked on the server: one POST starts a run and walks its first chunk, and
// each subsequent POST with ?continue=<id> walks one more, so no single invocation can
// outlive a serverless ceiling. That means the DRIVING is this panel's job — it keeps
// asking for the next chunk until the run stops being 'running'.
//
// Two rules the loop exists to honour:
//   - `claimed: false` means another caller (the cron, a second tab) is walking that chunk
//     right now. The answer is to wait and ask again, never to walk it in parallel.
//   - the loop gives up after a bounded number of continues and says so. A run left
//     mid-walk is not lost: the nightly cron picks it up from the same cursor.
//
// A dry run rehearses the walk and writes nothing; its `diff` is the whole point of it.

import { useCallback, useEffect, useState } from 'react'
import { apiFetch, apiSend, errorMessage } from '@/lib/api/client'
import { shortDate } from '@/components/admin/catalog/shared'
import type { CatalogSyncRunRow } from '@/lib/catalog/types'

const SYNC_PATH = '/api/admin/lumaprints/catalog-sync'
const CONTINUE_INTERVAL_MS = 1500
const MAX_CONTINUES = 60

type ClaimedRun = CatalogSyncRunRow & { claimed?: boolean }

const wait = (ms: number) => new Promise<void>((resolve) => setTimeout(resolve, ms))

/** The sync panel: dry run, real sync, live progress, and the recent run history. */
export default function SyncPanel({ onFinished }: { onFinished: () => void }) {
  const [runs, setRuns] = useState<CatalogSyncRunRow[]>([])
  const [run, setRun] = useState<ClaimedRun | null>(null)
  const [busy, setBusy] = useState(false)
  const [note, setNote] = useState<string | null>(null)
  const [failure, setFailure] = useState<string | null>(null)
  const [showDiff, setShowDiff] = useState(false)

  const loadRuns = useCallback(async () => {
    try {
      const answer = await apiFetch<{ runs: CatalogSyncRunRow[]; running: CatalogSyncRunRow | null }>(SYNC_PATH)
      setRuns(answer.runs ?? [])
    } catch {
      // The history is a convenience; a failure here must not hide the buttons.
      setRuns([])
    }
  }, [])

  useEffect(() => {
    void loadRuns()
  }, [loadRuns])

  const drive = useCallback(
    async (dryRun: boolean) => {
      setBusy(true)
      setFailure(null)
      setNote(null)
      setShowDiff(false)
      try {
        let current = await apiSend<{ run: ClaimedRun; claimed: boolean }>(SYNC_PATH, 'POST', { dryRun })
        let latest: ClaimedRun = { ...current.run, claimed: current.claimed }
        setRun(latest)

        for (let i = 0; i < MAX_CONTINUES && latest.status === 'running'; i += 1) {
          await wait(CONTINUE_INTERVAL_MS)
          current = await apiSend<{ run: ClaimedRun; claimed: boolean }>(
            `${SYNC_PATH}?continue=${latest.id}`,
            'POST',
          )
          latest = { ...current.run, claimed: current.claimed }
          setRun(latest)
        }

        if (latest.status === 'running') {
          setNote('Still running — the nightly cron will finish it.')
        }
      } catch (err) {
        setFailure(errorMessage(err))
      } finally {
        setBusy(false)
        await loadRuns()
        onFinished()
      }
    },
    [loadRuns, onFinished],
  )

  const diff = run?.diff ?? null
  const newCount = diff ? diff.newSubcategories.length + diff.newGroups.length + diff.newOptions.length : 0
  const removedCount = diff
    ? diff.removedSubcategories.length + diff.removedGroups.length + diff.removedOptions.length
    : 0

  return (
    <section className="rounded-sm border border-charcoal/15 bg-white/60 p-4">
      <div className="flex flex-wrap items-center gap-3">
        <h2 className="font-display text-lg font-light text-charcoal">Provider sync</h2>
        <button
          type="button"
          onClick={() => void drive(true)}
          disabled={busy}
          className="rounded-sm border border-charcoal/20 px-3 py-1.5 font-body text-xs text-charcoal transition-colors hover:bg-teal/5 disabled:opacity-40"
        >
          Preview changes (dry run)
        </button>
        <button
          type="button"
          onClick={() => void drive(false)}
          disabled={busy}
          className="rounded-sm bg-teal px-3 py-1.5 font-body text-xs text-cream transition-colors hover:bg-deep-teal disabled:opacity-40"
        >
          Sync from LumaPrints
        </button>
      </div>

      {run ? (
        <p className="mt-3 font-body text-xs text-charcoal/70">
          {run.dry_run ? 'Dry run' : 'Sync'} {run.status} {'·'} {run.stats?.chunks ?? 0} chunks {'·'}{' '}
          {run.stats?.requests ?? 0} requests
          {run.claimed === false ? ' · waiting for the run in flight' : ''}
        </p>
      ) : null}

      {note ? (
        <p className="mt-2 font-body text-xs text-amber-800">{note}</p>
      ) : null}
      {failure ? (
        <p role="alert" className="mt-2 font-body text-xs text-coral">
          {failure}
        </p>
      ) : null}

      {diff ? (
        <div className="mt-3">
          <button
            type="button"
            onClick={() => setShowDiff((prev) => !prev)}
            aria-expanded={showDiff}
            className="font-body text-xs text-charcoal underline underline-offset-2"
          >
            {newCount} new {'·'} {removedCount} removed {'·'} {diff.changedBounds.length} changed
          </button>
          {showDiff ? (
            <ul className="mt-2 space-y-0.5 font-body text-[11px] text-charcoal/70">
              {diff.newSubcategories.map((item) => (
                <li key={`ns-${item.subcategory_id}`}>new subcategory {item.name} ({item.subcategory_id})</li>
              ))}
              {diff.newGroups.map((item) => (
                <li key={`ng-${item.subcategory_id}-${item.api_group_name}`}>
                  new group {item.api_group_name} on {item.subcategory_id}
                </li>
              ))}
              {diff.newOptions.map((item) => (
                <li key={`no-${item.subcategory_id}-${item.option_id}`}>
                  new option {item.api_option_name} in {item.api_group_name}
                </li>
              ))}
              {diff.removedSubcategories.map((item) => (
                <li key={`rs-${item.subcategory_id}`}>removed subcategory {item.name}</li>
              ))}
              {diff.removedGroups.map((item) => (
                <li key={`rg-${item.subcategory_id}-${item.group_key}`}>removed group {item.group_key}</li>
              ))}
              {diff.removedOptions.map((item) => (
                <li key={`ro-${item.subcategory_id}-${item.option_id}`}>
                  removed option {item.option_id} from {item.group_key}
                </li>
              ))}
              {diff.changedBounds.map((item) => (
                <li key={`cb-${item.subcategory_id}-${item.field}`}>
                  {item.field} on {item.subcategory_id}: {String(item.from)} {'→'} {String(item.to)}
                </li>
              ))}
            </ul>
          ) : null}
        </div>
      ) : null}

      {runs.length > 0 ? (
        <ul className="mt-4 space-y-1 font-body text-[11px] text-charcoal/60">
          {runs.map((item) => (
            <li key={item.id}>
              {shortDate(item.started_at)} {'·'} {item.dry_run ? 'dry run' : 'sync'} {'·'} {item.status}{' '}
              {'·'} {item.stats?.subcategories ?? 0} subcategories, {item.stats?.options ?? 0} options
            </li>
          ))}
        </ul>
      ) : null}
    </section>
  )
}
