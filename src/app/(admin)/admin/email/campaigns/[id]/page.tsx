import { createClient } from '@/lib/supabase/server'
import CampaignComposer from '@/components/admin/email/CampaignComposer'
import { notFound } from 'next/navigation'

export const metadata = {
  title: 'Campaign',
}

export default async function CampaignEditPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params
  const supabase = await createClient()
  const { data: campaign } = await supabase
    .from('email_campaigns')
    .select('*, audience_list:contact_lists(id, slug, name), promo_code:promo_codes(id, code, discount_value, discount_type, valid_until)')
    .eq('id', id)
    .maybeSingle()

  if (!campaign) notFound()

  return <CampaignComposer mode="edit" initial={campaign} />
}
