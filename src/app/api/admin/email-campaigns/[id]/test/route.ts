// Send a test render of the campaign to one address — no recipients
// materialized, no contact records touched. The To address can be any
// admin's inbox (defaults to the from_email or the admin user).

import { requireAdmin } from '@/lib/auth/require-admin'
import { apiError, apiOk, parseBody } from '@/lib/api/respond'
import { renderAndSend } from '@/lib/email/render'
import { z } from 'zod'
import { NextRequest } from 'next/server'

const Body = z.object({
  toEmail: z.string().email().optional(),
  firstName: z.string().optional(),
})

// POST /api/admin/email-campaigns/[id]/test — send a test copy of the campaign to one address; admin only.
export async function POST(request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const auth = await requireAdmin()
  if (!auth.ok) return auth.response
  const { id } = await params

  const parsed = await parseBody(request, Body)
  if (!parsed.ok) return parsed.response

  const { data: campaign, error } = await auth.supabase
    .from('email_campaigns')
    .select('*, promo_code:promo_codes(code, discount_value, discount_type, valid_until)')
    .eq('id', id)
    .maybeSingle()
  if (error || !campaign) return apiError('Campaign not found', 404, 'NOT_FOUND')

  const toEmail = parsed.data.toEmail || auth.user.email
  if (!toEmail) return apiError('No To address available', 400, 'NO_RECIPIENT')

  const promo = campaign.promo_code as { code?: string; discount_value?: number } | null

  await renderAndSend({
    to: toEmail,
    subject: `[TEST] ${campaign.subject}`,
    body: campaign.content_html || '<p>(empty campaign body)</p>',
    preheader: campaign.preheader || undefined,
    hideUnsubscribe: true,
    footerNote: 'This is a test send from the ArtByME campaign composer.',
    context: {
      first_name: parsed.data.firstName || 'friend',
      discount_code: promo?.code || null,
      discount_value: promo?.discount_value ?? null,
    },
  })

  return apiOk({ sent: true, to: toEmail })
}
