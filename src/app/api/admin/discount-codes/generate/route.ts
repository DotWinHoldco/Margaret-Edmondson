import { requireAdmin } from '@/lib/auth/require-admin'
import { apiError, apiFail, apiOk, parseBody } from '@/lib/api/respond'
import { generateDiscountCode } from '@/lib/discounts/generate'
import { z } from 'zod'

const Body = z.object({
  kind: z.enum(['manual', 'campaign', 'newsletter_signup', 'cart_abandon', 'automation']).default('campaign'),
  percentOff: z.number().int().min(1).max(100).optional(),
  fixedOffCents: z.number().int().min(1).optional(),
  prefix: z.string().trim().regex(/^[A-Z0-9]{2,10}$/i).optional(),
  expiresInHours: z.number().int().min(1).max(24 * 365).nullable().optional(),
  audienceListId: z.string().uuid().nullable().optional(),
  contactId: z.string().uuid().nullable().optional(),
  cartId: z.string().uuid().nullable().optional(),
  singleUsePerContact: z.boolean().optional(),
  minOrderAmount: z.number().nullable().optional(),
  usageLimit: z.number().int().nullable().optional(),
  description: z.string().nullable().optional(),
})

// POST /api/admin/discount-codes/generate — generate a discount/promo code; admin only.
export async function POST(request: Request) {
  const auth = await requireAdmin()
  if (!auth.ok) return auth.response

  const parsed = await parseBody(request, Body)
  if (!parsed.ok) return parsed.response

  if (!parsed.data.percentOff && !parsed.data.fixedOffCents) {
    return apiError('percentOff or fixedOffCents is required', 400, 'MISSING_DISCOUNT')
  }

  try {
    const created = await generateDiscountCode(
      {
        ...parsed.data,
        createdBy: auth.user.id,
      },
      auth.supabase
    )
    return apiOk({ promoCode: created }, 201)
  } catch (err) {
    return apiFail(err, {
      context: 'admin/discount-codes/generate POST',
      code: 'GENERATE_FAILED',
      publicMessage: 'We could not generate that code. Please check the details and try again.',
    })
  }
}
