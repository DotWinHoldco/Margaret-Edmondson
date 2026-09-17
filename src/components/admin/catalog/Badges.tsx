'use client'
// Authored by DotWin
// The four things a catalog row can be flagged as, in one place so a subcategory, a group
// and an option say them identically:
//   NEW            the sync found it and nobody has looked at it yet (acknowledged_at null)
//   Removed        the provider stopped listing it (a tombstone; its toggle is history now)
//   BLOCKED        its geometry cannot be sold from our masters at all (ADR-4)
//   needs swatch   it is live in a swatch group with nothing to show (the V7.4 launch gate)

interface NewBadgeProps {
  /** Marks it acknowledged; the badge disappears on the refetched tree, not optimistically. */
  onAcknowledge: () => void
  busy: boolean
  /** What is being acknowledged, for the button's accessible name. */
  label: string
}

/** The NEW badge and its Acknowledge button, shown while `acknowledged_at` is null. */
export function NewBadge({ onAcknowledge, busy, label }: NewBadgeProps) {
  return (
    <span className="inline-flex items-center gap-1.5">
      <span className="rounded-sm bg-teal/10 px-1.5 py-0.5 font-body text-[11px] font-medium tracking-wide text-teal uppercase">
        New
      </span>
      <button
        type="button"
        onClick={onAcknowledge}
        disabled={busy}
        aria-label={`Acknowledge ${label}`}
        className="font-body text-[11px] text-charcoal/60 underline underline-offset-2 transition-colors hover:text-charcoal disabled:opacity-40"
      >
        Acknowledge
      </button>
    </span>
  )
}

/** The provider no longer lists this row. It stays visible so an admin can see why it vanished. */
export function RemovedBadge() {
  return (
    <span className="rounded-sm bg-coral/10 px-1.5 py-0.5 font-body text-[11px] font-medium tracking-wide text-coral uppercase">
      Removed by provider
    </span>
  )
}

/** ADR-4: the option cannot be enabled at all, and the reason is the admin's own sentence. */
export function BlockedBadge({ reason }: { reason: string }) {
  return (
    <span className="inline-flex items-start gap-1.5">
      <span className="rounded-sm bg-charcoal/10 px-1.5 py-0.5 font-body text-[11px] font-medium tracking-wide text-charcoal/70 uppercase">
        {'◼'} Blocked
      </span>
      <span className="font-body text-[11px] leading-snug text-charcoal/60">{reason}</span>
    </span>
  )
}

/** A live frame or mat option a customer would be asked to choose sight unseen. */
export function NeedsSwatchBadge() {
  return (
    <span className="rounded-sm bg-amber-100 px-1.5 py-0.5 font-body text-[11px] font-medium tracking-wide text-amber-800 uppercase">
      Needs swatch
    </span>
  )
}
