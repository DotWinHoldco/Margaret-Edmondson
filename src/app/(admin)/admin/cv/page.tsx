import { redirect } from 'next/navigation'

export const dynamic = 'force-dynamic'

export default function AdminCvPage() {
  redirect('/admin/pages?slug=cv')
}
