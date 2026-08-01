import { createClient } from '@/lib/supabase/server'
import type { Metadata } from 'next'
import Link from 'next/link'
import Image from 'next/image'

export const metadata: Metadata = {
  title: 'Print Review',
}

export const dynamic = 'force-dynamic'

interface MasterRow {
  print_status: string | null
  crop_box: { x: number; y: number; w: number; h: number } | null
  border_mode: string | null
  print_width_px: number | null
  print_height_px: number | null
  width_px: number | null
  height_px: number | null
}

interface ProductRow {
  id: string
  title: string
  slug: string
  status: string
  master_artwork: MasterRow | MasterRow[] | null
  product_images: Array<{ url: string; sort_order: number }> | null
  product_variants: Array<{ id: string; medium: string | null; is_active: boolean }> | null
}

const EPS = 0.005

function isFullFrame(box: MasterRow['crop_box']): boolean {
  if (!box) return true
  return (
    Math.abs(box.x) < EPS && Math.abs(box.y) < EPS && Math.abs(box.w - 1) < EPS && Math.abs(box.h - 1) < EPS
  )
}

function orientation(w: number, h: number): string {
  const r = w / h
  if (Math.abs(r - 1) < 0.05) return 'Square'
  return r > 1 ? 'Landscape' : 'Portrait'
}

// /admin/print-review — the owner's crop double-check gallery: every artwork
// with its print area, print-file status, and a jump into that piece's editor.
// Reads through the cookie client so admin RLS governs visibility.
export default async function PrintReviewPage() {
  const supabase = await createClient()

  const { data } = await supabase
    .from('products')
    .select(
      `id, title, slug, status,
       master_artwork:master_artworks ( print_status, crop_box, border_mode, print_width_px, print_height_px, width_px, height_px ),
       product_images ( url, sort_order ),
       product_variants ( id, medium, is_active )`,
    )
    .not('master_artwork_id', 'is', null)
    .neq('status', 'archived')
    .order('title')

  const rows = (data || []) as unknown as ProductRow[]
  const pieces = rows.map((p) => {
    const master = Array.isArray(p.master_artwork) ? p.master_artwork[0] : p.master_artwork
    const img = (p.product_images || []).slice().sort((a, b) => a.sort_order - b.sort_order)[0]?.url || null
    const livePrints = (p.product_variants || []).filter((v) => v.medium && v.is_active).length
    const pxW = master?.print_width_px ?? master?.width_px ?? null
    const pxH = master?.print_height_px ?? master?.height_px ?? null
    return {
      id: p.id,
      title: p.title,
      image: img,
      status: p.status,
      printStatus: master?.print_status ?? 'none',
      fullFrame: isFullFrame(master?.crop_box ?? null),
      cropBox: master?.crop_box ?? null,
      borderMode: master?.border_mode === 'matte' ? 'Matte' : 'Full bleed',
      shape: pxW && pxH ? orientation(pxW, pxH) : null,
      livePrints,
    }
  })

  const ready = pieces.filter((a) => a.printStatus === 'ready').length
  const fullFrame = pieces.filter((a) => a.fullFrame).length

  return (
    <div>
      <div className="mb-2 flex items-center gap-2 font-body text-xs text-charcoal/50">
        <Link href="/admin" className="hover:text-charcoal">Dashboard</Link>
        <span>/</span>
        <span>Print review</span>
      </div>
      <h1 className="font-display text-3xl font-bold text-charcoal">Print review</h1>
      <p className="mt-2 max-w-3xl font-body text-sm text-charcoal/60">
        Every artwork below is set up for printing. The print area is what customers receive.
        Pieces marked <span className="font-medium text-charcoal">Full frame</span> print your
        entire artwork with nothing cropped out.
      </p>

      <div className="mt-4 flex flex-wrap gap-3">
        <span className="rounded-full bg-teal/10 px-3 py-1 font-body text-xs font-semibold text-deep-teal">
          {ready} of {pieces.length} print-ready
        </span>
        <span className="rounded-full bg-charcoal/5 px-3 py-1 font-body text-xs font-semibold text-charcoal/70">
          {fullFrame} full frame
        </span>
      </div>

      <div className="mt-5 rounded-lg border border-teal/25 bg-teal/[0.05] p-4">
        <p className="font-body text-sm font-semibold text-charcoal">To change a crop</p>
        <ol className="mt-2 list-decimal space-y-1 pl-5 font-body text-sm text-charcoal/70">
          <li>Click the piece below to open it, then find the <span className="font-medium text-charcoal">Artwork source</span> section.</li>
          <li>Click <span className="font-medium text-charcoal">Edit print crop</span>, drag the box to the area you want printed, and save.</li>
          <li>That piece&apos;s prints pause while its print file is rebuilt — send a quick note so it can be rebuilt right away, and the prints come back automatically.</li>
        </ol>
      </div>

      <div className="mt-6 grid grid-cols-2 gap-4 sm:grid-cols-3 lg:grid-cols-4">
        {pieces.map((a) => (
          <Link
            key={a.id}
            href={`/admin/products/${a.id}/edit`}
            className="group overflow-hidden rounded-xl border border-charcoal/10 bg-white shadow-sm transition-shadow hover:shadow-md"
          >
            <div className="relative aspect-square bg-charcoal/[0.04]">
              {a.image ? (
                <Image
                  src={a.image}
                  alt={a.title}
                  fill
                  sizes="(max-width: 640px) 50vw, (max-width: 1024px) 33vw, 25vw"
                  className="object-contain p-2"
                />
              ) : (
                <div className="flex h-full items-center justify-center font-body text-xs text-charcoal/40">
                  No image
                </div>
              )}
              {/* Print-area outline: the edge of what prints. */}
              <div
                className="pointer-events-none absolute border-2 border-teal/70"
                style={
                  a.cropBox && !a.fullFrame
                    ? {
                        left: `${a.cropBox.x * 100}%`,
                        top: `${a.cropBox.y * 100}%`,
                        width: `${a.cropBox.w * 100}%`,
                        height: `${a.cropBox.h * 100}%`,
                      }
                    : { inset: '8px' }
                }
              />
            </div>
            <div className="p-3">
              <p className="truncate font-display text-sm font-semibold text-charcoal group-hover:text-teal">
                {a.title}
              </p>
              <div className="mt-1.5 flex flex-wrap items-center gap-1.5">
                <span
                  className={`rounded-full px-2 py-0.5 font-body text-[10px] font-semibold uppercase tracking-wider ${
                    a.printStatus === 'ready'
                      ? 'bg-teal/15 text-deep-teal'
                      : 'bg-amber-100 text-amber-800'
                  }`}
                >
                  {a.printStatus === 'ready' ? 'Print-ready' : `Print file: ${a.printStatus}`}
                </span>
                <span className="rounded-full bg-charcoal/5 px-2 py-0.5 font-body text-[10px] font-semibold uppercase tracking-wider text-charcoal/60">
                  {a.fullFrame ? 'Full frame' : 'Custom crop'}
                </span>
              </div>
              <p className="mt-1.5 font-body text-[11px] text-charcoal/50">
                {[a.shape, a.borderMode, a.livePrints > 0 ? `${a.livePrints} print sizes live` : 'No print sizes live']
                  .filter(Boolean)
                  .join(' · ')}
              </p>
            </div>
          </Link>
        ))}
      </div>
    </div>
  )
}
