'use client'

import { useEffect, useState } from 'react'
import { festiveClass, getFestiveOffer } from './festive-class'

/** Refresh an open tab so the early offer cannot remain after the cutoff. */
export function FestiveOffer({ initialOffer }: { initialOffer: ReturnType<typeof getFestiveOffer> }) {
  const [offer, setOffer] = useState(initialOffer)
  useEffect(() => {
    const refresh = () => {
      const current = getFestiveOffer()
      setOffer(previous => previous.early === current.early && previous.ended === current.ended ? previous : current)
    }
    const timer = window.setInterval(refresh, 1000)
    window.addEventListener('focus', refresh)
    return () => {
      window.clearInterval(timer)
      window.removeEventListener('focus', refresh)
    }
  }, [])

  if (offer.ended) return <p className="me-closed">This market has ended. Thank you for painting with Margaret.</p>
  return (
    <>
      <div className="me-price"><strong>{offer.priceLabel}</strong><span>per painter<br />all materials included</span></div>
      <p className="me-save">{offer.savingsLabel}</p>
      <p className="me-price-detail">{festiveClass.priceScheduleLabel}</p>
    </>
  )
}
