import Link from 'next/link'
import type { Metadata } from 'next'
import ClassSessionForm from '@/components/admin/ClassSessionForm'

export const metadata: Metadata = { title: 'New session' }

export default function NewClassSessionPage() {
  return (
    <div>
      <Link href="/admin/classes" className="mb-6 inline-flex items-center font-body text-sm text-charcoal/60 hover:text-charcoal transition-colors">
        ← Back to classes
      </Link>
      <ClassSessionForm />
    </div>
  )
}
