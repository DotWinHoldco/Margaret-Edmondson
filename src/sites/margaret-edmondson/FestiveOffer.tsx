'use client'

import { useEffect, useState } from 'react'
import { festiveClass as defaultClass, getFestiveOffer, type FestiveClass } from './festive-class'

/** Refresh an open tab so the early offer cannot remain after the cutoff. */
export function FestiveOffer({ initialOffer, event: festiveClass = defaultClass }: { event?: FestiveClass; initialOffer: ReturnType<typeof getFestiveOffer> }) {
  const [offer, setOffer] = useState(initialOffer)
  useEffect(() => {
    const refresh = () => {
      const current = getFestiveOffer(new Date(), festiveClass)
      setOffer(previous => previous.early === current.early && previous.ended === current.ended ? previous : current)
    }
    const timer = window.setInterval(refresh, 1000)
    window.addEventListener('focus', refresh)
    return () => {
      window.clearInterval(timer)
      window.removeEventListener('focus', refresh)
    }
  }, [festiveClass])

  if (offer.ended) return <p className="me-closed">This class has ended. Thank you for painting with Margaret.</p>
  return (
    <>
      <div className="me-price"><strong>{offer.priceLabel}</strong><span>per painter<br />all materials included</span></div>
      <p className="me-save">{offer.savingsLabel}</p>
      <p className="me-price-detail">{festiveClass.priceScheduleLabel}</p>
    </>
  )
}
