// Authored by DotWin
import { z } from 'zod'

export const billingCommand = z.discriminatedUnion('action', [
  z.object({ action: z.literal('begin_card_update'), requestId: z.string().uuid() }).strict(),
  z.object({ action: z.literal('finish_card_update'), setupId: z.string().regex(/^seti_[A-Za-z0-9]+$/) }).strict(),
  z.object({ action: z.literal('set_renewal'), renew: z.boolean(), requestId: z.string().uuid() }).strict(),
])
export type BillingCommand = z.infer<typeof billingCommand>
export type BillingOverview = {
  plan: { name: string; description: string | null; status: string; amount: number; currency: string;
    interval: string; intervalCount: number; periodEnd: number; cancelAtPeriodEnd: boolean; canManage: boolean }
  paymentMethod: { brand: string; last4: string; expMonth: number; expYear: number } | null
  billing: { name: string | null; email: string | null }
  invoices: { id: string; number: string | null; created: number; amount: number; currency: string; status: string | null; downloadable: boolean }[]
  payments: { id: string; created: number; amount: number; amountRefunded: number; currency: string; description: string | null }[]
}
