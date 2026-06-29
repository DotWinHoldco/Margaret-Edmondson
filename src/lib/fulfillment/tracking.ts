// P4-2: build a clickable carrier tracking URL from the carrier name + tracking
// number, so the shipping email links to real tracking instead of stating a bare
// number (the status cron previously always passed trackingUrl:null). Returns null
// for an unknown carrier or a missing number; the email then omits the button.
export function carrierTrackingUrl(
  carrier: string | null | undefined,
  trackingNumber: string | null | undefined,
): string | null {
  if (!trackingNumber) return null
  const n = encodeURIComponent(trackingNumber.trim())
  if (!n) return null
  const c = (carrier || '').toLowerCase()
  if (c.includes('ups')) return `https://www.ups.com/track?tracknum=${n}`
  if (c.includes('usps')) return `https://tools.usps.com/go/TrackConfirmAction?tLabels=${n}`
  if (c.includes('fedex')) return `https://www.fedex.com/fedextrack/?trknbr=${n}`
  if (c.includes('dhl')) return `https://www.dhl.com/us-en/home/tracking.html?tracking-id=${n}`
  return null
}
