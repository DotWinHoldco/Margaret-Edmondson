import { createClient } from '@/lib/supabase/server'
import type { Metadata } from 'next'
import ProjectHubClient from './ProjectHubClient'

export const metadata: Metadata = {
  title: 'Project Hub',
}

export default async function AdminDashboard() {
  const supabase = await createClient()

  // Fetch all initial data in parallel
  const [feedbackResult, workRequestsResult, notesResult, funnelsResult] = await Promise.all([
    supabase
      .from('feedback_items')
      .select('*, feedback_comments(id), feedback_audit_log(id, action, old_value, new_value, created_at)')
      .order('created_at', { ascending: false }),
    supabase
      .from('work_requests')
      .select('*, work_request_comments(id), work_request_audit_log(id, action, old_value, new_value, created_at)')
      .order('created_at', { ascending: false }),
    supabase
      .from('project_notes')
      .select('*, project_note_comments(id)')
      .order('is_pinned', { ascending: false })
      .order('created_at', { ascending: false }),
    supabase
      .from('artwork_funnels')
      .select('id, slug, template, is_published, views_count, add_to_cart_count, purchase_count, product_id, products(title, slug)')
      .order('created_at', { ascending: false }),
  ])

  const feedbackItems = (feedbackResult.data || []).map((item) => ({
    ...item,
    comment_count: item.feedback_comments?.length || 0,
    audit_log: item.feedback_audit_log || [],
    feedback_comments: undefined,
    feedback_audit_log: undefined,
  }))

  const workRequests = (workRequestsResult.data || []).map((item) => ({
    ...item,
    comment_count: item.work_request_comments?.length || 0,
    audit_log: item.work_request_audit_log || [],
    work_request_comments: undefined,
    work_request_audit_log: undefined,
  }))

  const notes = (notesResult.data || []).map((item) => ({
    ...item,
    comment_count: item.project_note_comments?.length || 0,
    project_note_comments: undefined,
  }))

  const funnels = (funnelsResult.data || []).map((item) => ({
    id: item.id as string,
    slug: item.slug as string,
    template: item.template as string,
    is_published: item.is_published as boolean,
    views_count: (item.views_count || 0) as number,
    add_to_cart_count: (item.add_to_cart_count || 0) as number,
    purchase_count: (item.purchase_count || 0) as number,
    product_title: ((item.products as unknown as { title: string }) || {}).title || 'Unknown',
    product_slug: ((item.products as unknown as { slug: string }) || {}).slug || '',
  }))

  return (
    <ProjectHubClient
      initialFeedback={feedbackItems}
      initialWorkRequests={workRequests}
      initialNotes={notes}
      initialFunnels={funnels}
    />
  )
}
