'use client'

import { CartProvider } from '@/lib/cart/context'
import ToastProvider from '@/components/shared/toast/ToastProvider'
import type { ReactNode } from 'react'

export default function Providers({ children }: { children: ReactNode }) {
  return (
    <ToastProvider>
      <CartProvider>{children}</CartProvider>
    </ToastProvider>
  )
}
