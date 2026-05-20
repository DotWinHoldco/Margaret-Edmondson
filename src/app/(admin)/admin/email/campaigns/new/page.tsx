import CampaignComposer from '@/components/admin/email/CampaignComposer'

export const metadata = {
  title: 'New Campaign',
}

export default function NewCampaignPage() {
  return <CampaignComposer mode="create" />
}
