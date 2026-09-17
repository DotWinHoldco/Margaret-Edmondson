// Authored by DotWin
// The one sentence every print-admin screen owes the person reading it: where the
// switches are, and whether shoppers can see what those switches do yet.
//
// The storefront door (`site_settings.print_configurator_enabled`, plan ADR-8) decides
// whether the configurator is shown. While it is closed, everything turned on in Print
// Catalog is staged, not sold: the store keeps offering today's default configuration per
// print type. Flipping it is a launch step, so this notice names the state plainly
// instead of letting a toggle look ignored.
//
// Presentational: the page reads the door state (`readConfiguratorDoorState`, a
// server-only read of `site_settings`) and passes the word in.

import Link from 'next/link'
import type { DoorState } from '@/lib/catalog/door-state'

const HELP_SLUG = '06a-print-catalog-toggles'

/**
 * Explains, on the Print Catalog and Print Coverage screens, where things are switched
 * on and what shoppers can currently see.
 */
export default function DoorNotice({ screen, door }: { screen: 'catalog' | 'coverage'; door: DoorState }) {
  const doorLine =
    door === 'open'
      ? 'The print configurator is ON: shoppers see every print type and option that is switched on here.'
      : door === 'closed'
        ? 'The print configurator is OFF: shoppers still see only today’s default size list per print type. Everything switched on here is staged for launch and not visible on the store yet.'
        : 'The print configurator state could not be read just now.'

  return (
    <div className="rounded-sm border border-teal/20 bg-teal/5 px-4 py-3 font-body text-sm text-charcoal/80" role="note">
      {screen === 'coverage' ? (
        <p>
          This page only reports. To offer a print type, a frame, a mat, a paper or any other option, switch it on in{' '}
          <Link href="/admin/catalog" className="underline hover:text-teal">
            Print Catalog
          </Link>
          : print type first, then its option group, then the option, and pick a default. Then come back here and
          generate the missing sizes.
        </p>
      ) : (
        <p>
          Switch a print type on, then its option groups, then the options you want to sell (frames, mats, papers,
          hardware), and pick each group&apos;s default. Sizes per artwork are created in{' '}
          <Link href="/admin/products/coverage" className="underline hover:text-teal">
            Print Coverage
          </Link>
          .
        </p>
      )}
      <p className="mt-2">
        {doorLine}{' '}
        <Link href={`/admin/help/${HELP_SLUG}`} className="underline hover:text-teal">
          Read the guide
        </Link>
        .
      </p>
    </div>
  )
}
