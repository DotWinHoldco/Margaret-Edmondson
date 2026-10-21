import CampaignComposer from '@/components/admin/email/CampaignComposer'

import { getSiteSettings } from '@/lib/settings/accessor'

export const metadata = {
  title: 'New Campaign',
}

export default async function NewCampaignPage() {
  const settings = await getSiteSettings()
  return <CampaignComposer mode="create" initial={{ from_email: settings.email_from_address || undefined, from_name: settings.email_from_name || undefined }} />
}
