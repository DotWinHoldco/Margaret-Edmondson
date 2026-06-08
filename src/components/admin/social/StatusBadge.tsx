export type SocialStatus =
  | 'draft'
  | 'scheduled'
  | 'publishing'
  | 'published'
  | 'failed'
  | 'cancelled'

const STATUS_STYLES: Record<SocialStatus, { label: string; className: string }> = {
  draft: { label: 'Draft', className: 'bg-charcoal/10 text-charcoal/60' },
  scheduled: { label: 'Scheduled', className: 'bg-teal/15 text-teal' },
  publishing: { label: 'Publishing', className: 'bg-gold/20 text-[#8a6d1f]' },
  published: { label: 'Published', className: 'bg-green-100 text-green-700' },
  failed: { label: 'Failed', className: 'bg-coral/15 text-coral' },
  cancelled: { label: 'Cancelled', className: 'bg-charcoal/80 text-cream' },
}

// Dot color used for compact calendar chips.
export const STATUS_DOT: Record<SocialStatus, string> = {
  draft: 'bg-charcoal/40',
  scheduled: 'bg-teal',
  publishing: 'bg-gold',
  published: 'bg-green-600',
  failed: 'bg-coral',
  cancelled: 'bg-charcoal',
}

export default function StatusBadge({
  status,
  className = '',
}: {
  status: SocialStatus
  className?: string
}) {
  const style = STATUS_STYLES[status] ?? STATUS_STYLES.draft
  return (
    <span
      className={`inline-flex items-center rounded-sm px-2 py-0.5 font-body text-xs font-medium ${style.className} ${className}`}
    >
      {style.label}
    </span>
  )
}
