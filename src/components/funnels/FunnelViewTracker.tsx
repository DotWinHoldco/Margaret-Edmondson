'use client'

import { useEffect, useRef } from 'react'
import { trackEvent } from '@/lib/meta/pixel'
import { rememberFunnelAttribution } from '@/lib/funnels/attribution'

interface FunnelViewTrackerProps {
  funnelId: string
  productId: string
  productTitle: string
  basePrice: number
}

export default function FunnelViewTracker({ funnelId, productId, productTitle, basePrice }: FunnelViewTrackerProps) {
  const tracked = useRef(false)

  useEffect(() => {
    if (tracked.current) return
    tracked.current = true

    // Last-touch attribution: a purchase started within a day of this visit
    // credits this funnel (verified server-side, counted only by the webhook).
    rememberFunnelAttribution(funnelId)

    // Increment views_count via public SECURITY DEFINER RPC
    fetch(`/api/funnels/${funnelId}/track`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ metric: 'views' }),
    }).catch(() => {})

    // Meta pixel ViewContent
    trackEvent('ViewContent', {
      content_name: productTitle,
      content_ids: [productId],
      content_type: 'product',
      value: basePrice,
      currency: 'USD',
    }, `funnel_view_${funnelId}_${Date.now()}`)
  }, [funnelId, productId, productTitle, basePrice])

  return null
}
