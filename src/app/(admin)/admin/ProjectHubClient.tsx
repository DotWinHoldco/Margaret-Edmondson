'use client'

import { useState, useRef, useEffect } from 'react'
import { motion, AnimatePresence } from 'framer-motion'
import RichTextEditor from '@/components/admin/RichTextEditor'
import SharedFilesModal, { type SharedEntity } from '@/components/admin/SharedFilesModal'
import { sanitizeHtml } from '@/lib/sanitize'
import { apiFetch, apiSend, errorMessage } from '@/lib/api/client'
import { useToast } from '@/components/shared/toast/ToastProvider'

// ─── Types ────────────────────────────────────────────────────────────
interface AuditEntry {
  id: string
  action: string
  old_value: string | null
  new_value: string | null
  created_at: string
}

interface FeedbackItem {
  id: string
  category: string
  page_or_feature: string | null
  title: string
  description: string | null
  priority: string
  status: string
  comment_count: number
  audit_log: AuditEntry[]
  created_at: string
  updated_at: string
}

interface Comment {
  id: string
  profile_id: string
  sender_role: string
  message: string
  created_at: string
}

interface WorkRequest {
  id: string
  title: string
  description: string | null
  category: string
  priority: string
  status: string
  due_date: string | null
  comment_count: number
  audit_log: AuditEntry[]
  created_at: string
  updated_at: string
}

interface ProjectNote {
  id: string
  title: string
  content: string | null
  is_pinned: boolean
  comment_count: number
  created_at: string
  updated_at: string
}

interface Props {
  initialFeedback: FeedbackItem[]
  initialWorkRequests: WorkRequest[]
  initialNotes: ProjectNote[]
}

// ─── Constants ────────────────────────────────────────────────────────

const FEEDBACK_CATEGORIES: { value: string; label: string }[] = [
  { value: 'love', label: 'I Love This' },
  { value: 'change', label: 'I Want to Change This' },
  { value: 'add', label: 'Please Add This' },
  { value: 'bug', label: 'Bug Report' },
  { value: 'general', label: 'General Feedback' },
]

const FEEDBACK_STATUSES: { value: string; label: string }[] = [
  { value: 'received', label: 'Received' },
  { value: 'reviewed', label: 'Reviewed' },
  { value: 'working', label: 'Working' },
  { value: 'completed', label: 'Completed' },
]

const PAGES_AND_FEATURES = [
  'Homepage V1',
  'Homepage V2',
  'Homepage V3',
  'Homepage V4',
  'Homepage V5',
  'Homepage V6',
  'Shop',
  'Product Page',
  'Cart',
  'Checkout',
  'Commissions',
  'Gallery',
  'Classes',
  'Blog',
  'Admin Panel',
  'About',
  'Contact',
  'Sales Funnels',
  'Other',
]

const WORK_REQUEST_CATEGORIES: { value: string; label: string }[] = [
  { value: 'feature', label: 'Feature' },
  { value: 'design', label: 'Design' },
  { value: 'content', label: 'Content' },
  { value: 'integration', label: 'Integration' },
  { value: 'fix', label: 'Fix' },
  { value: 'other', label: 'Other' },
]

const WORK_REQUEST_STATUSES: { value: string; label: string }[] = [
  { value: 'received', label: 'Received' },
  { value: 'reviewed', label: 'Reviewed' },
  { value: 'accepted', label: 'Accepted' },
  { value: 'info_requested', label: 'Info Requested' },
  { value: 'working', label: 'Working' },
  { value: 'client_review', label: 'Client Review' },
  { value: 'completed', label: 'Completed' },
]

const PRIORITIES = ['low', 'medium', 'high', 'urgent']

const FEEDBACK_STATUS_COLORS: Record<string, string> = {
  received: 'bg-gold/15 text-gold',
  reviewed: 'bg-teal/15 text-teal',
  working: 'bg-deep-teal/15 text-deep-teal',
  completed: 'bg-olive/15 text-olive',
}

const WORK_STATUS_COLORS: Record<string, string> = {
  received: 'bg-gold/15 text-gold',
  reviewed: 'bg-coral/15 text-coral',
  accepted: 'bg-teal/15 text-teal',
  info_requested: 'bg-gold/20 text-gold',
  working: 'bg-deep-teal/15 text-deep-teal',
  client_review: 'bg-coral/10 text-coral',
  completed: 'bg-olive/15 text-olive',
}

const WR_CATEGORY_LABELS: Record<string, string> = {
  feature: 'Feature',
  design: 'Design',
  content: 'Content',
  integration: 'Integration',
  fix: 'Fix',
  other: 'Other',
}

const CATEGORY_COLORS: Record<string, string> = {
  love: 'bg-coral/15 text-coral',
  change: 'bg-teal/15 text-teal',
  add: 'bg-olive/15 text-olive',
  bug: 'bg-charcoal/15 text-charcoal/70',
  general: 'bg-gold/15 text-gold',
}

const CATEGORY_LABELS: Record<string, string> = {
  love: 'I Love This',
  change: 'Change This',
  add: 'Please Add',
  bug: 'Bug Report',
  general: 'General',
}

const AUDIT_ACTION_LABELS: Record<string, string> = {
  created: 'Created',
  status_changed: 'Status changed',
  title_edited: 'Title edited',
  description_edited: 'Description edited',
  category_changed: 'Category changed',
  priority_changed: 'Priority changed',
  page_changed: 'Page/feature changed',
}

const PRIORITY_COLORS: Record<string, string> = {
  low: 'bg-charcoal/8 text-charcoal/50',
  medium: 'bg-gold/15 text-gold',
  high: 'bg-coral/15 text-coral',
  urgent: 'bg-red-100 text-red-700',
}

// ─── Helpers ──────────────────────────────────────────────────────────
function formatDate(date: string) {
  return new Intl.DateTimeFormat('en-US', {
    month: 'short',
    day: 'numeric',
    year: 'numeric',
  }).format(new Date(date))
}

function formatTimestamp(date: string) {
  return new Intl.DateTimeFormat('en-US', {
    month: 'short',
    day: 'numeric',
    hour: 'numeric',
    minute: '2-digit',
  }).format(new Date(date))
}

// ─── Section Header ───────────────────────────────────────────────────
function SectionHeader({ title, subtitle, id }: { title: string; subtitle?: string; id?: string }) {
  return (
    <div id={id} className="mb-8 scroll-mt-8">
      <div className="flex items-center gap-3 mb-2">
        <div className="h-px flex-1 bg-gradient-to-r from-gold/40 to-transparent" />
        <h2 className="font-display text-2xl lg:text-3xl font-semibold text-charcoal whitespace-nowrap">
          {title}
        </h2>
        <div className="h-px flex-1 bg-gradient-to-l from-gold/40 to-transparent" />
      </div>
      {subtitle && (
        <p className="font-body text-charcoal/50 text-center text-sm">{subtitle}</p>
      )}
    </div>
  )
}

// ─── Comment Thread ───────────────────────────────────────────────────
function CommentThread({
  comments,
  isLoading,
  newComment,
  setNewComment,
  onSubmit,
}: {
  comments: Comment[]
  isLoading: boolean
  newComment: string
  setNewComment: (v: string) => void
  onSubmit: () => void
}) {
  return (
    <div className="mt-4 pt-4 border-t border-charcoal/8">
      <p className="font-body text-xs font-medium text-charcoal/40 uppercase tracking-wider mb-3">
        Conversation
      </p>
      {isLoading ? (
        <div className="flex items-center gap-2 py-3">
          <div className="w-4 h-4 border-2 border-teal/30 border-t-teal rounded-full animate-spin" />
          <span className="font-body text-sm text-charcoal/40">Loading...</span>
        </div>
      ) : comments.length === 0 ? (
        <p className="font-body text-sm text-charcoal/30 py-2">No comments yet. Start the conversation.</p>
      ) : (
        <div className="space-y-3 mb-4">
          {comments.map((c) => (
            <div key={c.id} className={`flex ${c.sender_role === 'developer' ? 'justify-end' : 'justify-start'}`}>
              <div
                className={`max-w-[85%] rounded-xl px-4 py-2.5 ${
                  c.sender_role === 'developer'
                    ? 'bg-teal/8 border border-teal/15'
                    : 'bg-gold/8 border border-gold/15'
                }`}
              >
                <div className="flex items-center gap-2 mb-1">
                  <span className="font-body text-xs font-semibold text-charcoal/70">
                    {c.sender_role === 'developer' ? 'Dev Team' : 'Margaret'}
                  </span>
                  <span className="font-body text-xs text-charcoal/30">
                    {formatTimestamp(c.created_at)}
                  </span>
                </div>
                <p className="font-body text-sm text-charcoal/80 leading-relaxed">{c.message}</p>
              </div>
            </div>
          ))}
        </div>
      )}
      <div className="flex gap-2">
        <input
          type="text"
          value={newComment}
          onChange={(e) => setNewComment(e.target.value)}
          placeholder="Type a reply..."
          className="flex-1 rounded-lg border border-charcoal/12 bg-white px-3 py-2 font-body text-sm text-charcoal placeholder:text-charcoal/30 focus:outline-none focus:ring-2 focus:ring-teal/30 focus:border-teal/40 transition-all"
          onKeyDown={(e) => {
            if (e.key === 'Enter' && newComment.trim()) onSubmit()
          }}
        />
        <button
          onClick={onSubmit}
          disabled={!newComment.trim()}
          className="rounded-lg bg-teal px-4 py-2 font-body text-sm font-medium text-white hover:bg-deep-teal transition-colors disabled:opacity-40 disabled:cursor-not-allowed"
        >
          Send
        </button>
      </div>
    </div>
  )
}

// ─── Main Component ───────────────────────────────────────────────────
export default function ProjectHubClient({
  initialFeedback,
  initialWorkRequests,
  initialNotes,
}: Props) {
  // ── State ───────────────────────────────────────────────────────────
  const [feedbackItems, setFeedbackItems] = useState<FeedbackItem[]>(initialFeedback)
  const [workRequests, setWorkRequests] = useState<WorkRequest[]>(initialWorkRequests)
  const [notes, setNotes] = useState<ProjectNote[]>(initialNotes)

  // Shared-files modal state
  const [filesModal, setFilesModal] = useState<{
    entityType: SharedEntity
    entityId: string | null
    title: string
  } | null>(null)

  // Expanded items
  const [expandedFeedback, setExpandedFeedback] = useState<string | null>(null)
  const [expandedWork, setExpandedWork] = useState<string | null>(null)
  const [expandedNote, setExpandedNote] = useState<string | null>(null)

  // Comments cache
  const [feedbackComments, setFeedbackComments] = useState<Record<string, Comment[]>>({})
  const [workComments, setWorkComments] = useState<Record<string, Comment[]>>({})
  const [noteComments, setNoteComments] = useState<Record<string, Comment[]>>({})
  const [loadingComments, setLoadingComments] = useState<Record<string, boolean>>({})

  // New comment inputs
  const [newFeedbackComment, setNewFeedbackComment] = useState('')
  const [newWorkComment, setNewWorkComment] = useState('')
  const [newNoteComment, setNewNoteComment] = useState('')

  // Feedback form
  const [fbCategory, setFbCategory] = useState('general')
  const [fbPage, setFbPage] = useState('')
  const [fbTitle, setFbTitle] = useState('')
  const [fbDescription, setFbDescription] = useState('')
  const [fbPriority, setFbPriority] = useState('medium')
  const [fbSubmitting, setFbSubmitting] = useState(false)

  // Feedback filters & pagination
  const [fbFilterStatus, setFbFilterStatus] = useState('')
  const [fbFilterCategory, setFbFilterCategory] = useState('')
  const [fbFilterPage, setFbFilterPage] = useState('')
  const [fbPageSize, setFbPageSize] = useState(5)
  const [fbCurrentPage, setFbCurrentPage] = useState(1)

  // Feedback edit
  const [editingFeedback, setEditingFeedback] = useState<string | null>(null)
  const [editFbTitle, setEditFbTitle] = useState('')
  const [editFbDescription, setEditFbDescription] = useState('')
  const [editFbCategory, setEditFbCategory] = useState('')
  const [editFbPriority, setEditFbPriority] = useState('')
  const [editFbPage, setEditFbPage] = useState('')
  const [editFbSubmitting, setEditFbSubmitting] = useState(false)

  // Work request form
  const [wrTitle, setWrTitle] = useState('')
  const [wrCategory, setWrCategory] = useState('feature')
  const [wrDescription, setWrDescription] = useState('')
  const [wrPriority, setWrPriority] = useState('medium')
  const [wrDueDate, setWrDueDate] = useState('')
  const [wrSubmitting, setWrSubmitting] = useState(false)

  // Work request filters & pagination
  const [wrFilterStatus, setWrFilterStatus] = useState('')
  const [wrFilterCategory, setWrFilterCategory] = useState('')
  const [wrPageSize, setWrPageSize] = useState(5)
  const [wrCurrentPage, setWrCurrentPage] = useState(1)

  // Work request edit
  const [editingWr, setEditingWr] = useState<string | null>(null)
  const [editWrTitle, setEditWrTitle] = useState('')
  const [editWrDescription, setEditWrDescription] = useState('')
  const [editWrCategory, setEditWrCategory] = useState('')
  const [editWrPriority, setEditWrPriority] = useState('')
  const [editWrDueDate, setEditWrDueDate] = useState('')
  const [editWrSubmitting, setEditWrSubmitting] = useState(false)

  // Note form
  const [noteTitle, setNoteTitle] = useState('')
  const [noteContent, setNoteContent] = useState('')
  const [noteSubmitting, setNoteSubmitting] = useState(false)
  const [showNoteForm, setShowNoteForm] = useState(false)
  const [editingNote, setEditingNote] = useState<{ id: string; title: string; content: string } | null>(null)
  const [editNoteSubmitting, setEditNoteSubmitting] = useState(false)

  const feedbackRef = useRef<HTMLDivElement>(null)

  const toast = useToast()

  // A design preview can bring the owner here with the feedback topic selected.
  useEffect(() => {
    const page = new URLSearchParams(window.location.search).get('feedbackPage')
    if (!page || !PAGES_AND_FEATURES.includes(page)) return
    const frame = window.requestAnimationFrame(() => {
      setFbPage(page)
      feedbackRef.current?.scrollIntoView({ block: 'start' })
    })
    return () => window.cancelAnimationFrame(frame)
  }, [])

  // ── Fetch comments ──────────────────────────────────────────────────
  async function fetchComments(
    type: 'feedback' | 'work-requests' | 'notes',
    id: string
  ) {
    const key = `${type}-${id}`
    if (loadingComments[key]) return
    setLoadingComments((p) => ({ ...p, [key]: true }))

    try {
      const endpoint =
        type === 'feedback'
          ? `/api/admin/feedback/${id}/comments`
          : type === 'work-requests'
            ? `/api/admin/work-requests/${id}/comments`
            : `/api/admin/notes/${id}/comments`

      const data = (await apiFetch<Comment[]>(endpoint)) || []

      if (type === 'feedback') setFeedbackComments((p) => ({ ...p, [id]: data }))
      else if (type === 'work-requests') setWorkComments((p) => ({ ...p, [id]: data }))
      else setNoteComments((p) => ({ ...p, [id]: data }))
    } catch (err) {
      toast.error(errorMessage(err))
    } finally {
      setLoadingComments((p) => ({ ...p, [key]: false }))
    }
  }

  // ── Submit comment ──────────────────────────────────────────────────
  async function submitComment(
    type: 'feedback' | 'work-requests' | 'notes',
    id: string,
    message: string,
    clearFn: () => void
  ) {
    if (!message.trim()) return

    const endpoint =
      type === 'feedback'
        ? `/api/admin/feedback/${id}/comments`
        : type === 'work-requests'
          ? `/api/admin/work-requests/${id}/comments`
          : `/api/admin/notes/${id}/comments`

    try {
      const created = await apiSend<Comment>(endpoint, 'POST', { message })
      if (type === 'feedback') {
        setFeedbackComments((p) => ({ ...p, [id]: [...(p[id] || []), created] }))
      } else if (type === 'work-requests') {
        setWorkComments((p) => ({ ...p, [id]: [...(p[id] || []), created] }))
      } else {
        setNoteComments((p) => ({ ...p, [id]: [...(p[id] || []), created] }))
      }
      clearFn()
      toast.success('Reply sent.')
    } catch (err) {
      toast.error(errorMessage(err))
    }
  }

  // ── Submit feedback ─────────────────────────────────────────────────
  async function submitFeedback(e: React.FormEvent) {
    e.preventDefault()
    if (!fbTitle.trim() || fbSubmitting) return
    setFbSubmitting(true)

    try {
      const created = await apiSend<FeedbackItem>('/api/admin/feedback', 'POST', {
        category: fbCategory,
        page_or_feature: fbPage || null,
        title: fbTitle,
        description: fbDescription,
        priority: fbPriority,
      })
      setFeedbackItems((p) => [{ ...created, comment_count: 0, audit_log: [] }, ...p])
      setFbTitle('')
      setFbDescription('')
      setFbCategory('general')
      setFbPage('')
      setFbPriority('medium')
      setFbCurrentPage(1)
      toast.success('Feedback submitted.')
    } catch (err) {
      toast.error(errorMessage(err))
    } finally {
      setFbSubmitting(false)
    }
  }

  async function updateFeedbackStatus(id: string, status: string) {
    try {
      const updated = await apiSend<FeedbackItem>('/api/admin/feedback', 'PATCH', { id, status })
      setFeedbackItems((p) => p.map((item) => item.id === id ? { ...item, ...updated, comment_count: item.comment_count, audit_log: item.audit_log } : item))
      // Refresh to get updated audit log
      refreshFeedback()
      toast.success('Status updated.')
    } catch (err) {
      toast.error(errorMessage(err))
    }
  }

  async function saveFeedbackEdit(id: string) {
    if (editFbSubmitting) return
    setEditFbSubmitting(true)
    try {
      await apiSend('/api/admin/feedback', 'PATCH', {
        id,
        title: editFbTitle,
        description: editFbDescription,
        category: editFbCategory,
        priority: editFbPriority,
        page_or_feature: editFbPage,
      })
      setEditingFeedback(null)
      refreshFeedback()
      toast.success('Saved.')
    } catch (err) {
      toast.error(errorMessage(err))
    }
    finally { setEditFbSubmitting(false) }
  }

  async function deleteFeedback(id: string) {
    if (!confirm('Delete this feedback permanently?')) return
    try {
      await apiSend('/api/admin/feedback', 'DELETE', { id })
      setFeedbackItems((p) => p.filter((item) => item.id !== id))
      if (expandedFeedback === id) setExpandedFeedback(null)
      toast.success('Deleted.')
    } catch (err) {
      toast.error(errorMessage(err))
    }
  }

  async function refreshFeedback() {
    try {
      const items = await apiFetch<FeedbackItem[]>('/api/admin/feedback')
      if (items) setFeedbackItems(items)
    } catch (err) {
      toast.error(errorMessage(err))
    }
  }

  // ── Submit work request ─────────────────────────────────────────────
  async function submitWorkRequest(e: React.FormEvent) {
    e.preventDefault()
    if (!wrTitle.trim() || wrSubmitting) return
    setWrSubmitting(true)

    try {
      const created = await apiSend<WorkRequest>('/api/admin/work-requests', 'POST', {
        title: wrTitle,
        category: wrCategory,
        description: wrDescription,
        priority: wrPriority,
        due_date: wrDueDate || null,
      })
      setWorkRequests((p) => [{ ...created, comment_count: 0, audit_log: [] }, ...p])
      setWrTitle('')
      setWrDescription('')
      setWrCategory('feature')
      setWrPriority('medium')
      setWrDueDate('')
      setWrCurrentPage(1)
      toast.success('Work request submitted.')
    } catch (err) {
      toast.error(errorMessage(err))
    } finally {
      setWrSubmitting(false)
    }
  }

  async function updateWrStatus(id: string, status: string) {
    try {
      await apiSend('/api/admin/work-requests', 'PATCH', { id, status })
      refreshWorkRequests()
      toast.success('Status updated.')
    } catch (err) {
      toast.error(errorMessage(err))
    }
  }

  async function saveWrEdit(id: string) {
    if (editWrSubmitting) return
    setEditWrSubmitting(true)
    try {
      await apiSend('/api/admin/work-requests', 'PATCH', {
        id,
        title: editWrTitle,
        description: editWrDescription,
        category: editWrCategory,
        priority: editWrPriority,
        due_date: editWrDueDate || null,
      })
      setEditingWr(null)
      refreshWorkRequests()
      toast.success('Saved.')
    } catch (err) {
      toast.error(errorMessage(err))
    }
    finally { setEditWrSubmitting(false) }
  }

  async function deleteWorkRequest(id: string) {
    if (!confirm('Delete this work request permanently?')) return
    try {
      await apiSend('/api/admin/work-requests', 'DELETE', { id })
      setWorkRequests((p) => p.filter((item) => item.id !== id))
      if (expandedWork === id) setExpandedWork(null)
      toast.success('Deleted.')
    } catch (err) {
      toast.error(errorMessage(err))
    }
  }

  async function refreshWorkRequests() {
    try {
      const items = await apiFetch<WorkRequest[]>('/api/admin/work-requests')
      if (items) setWorkRequests(items)
    } catch (err) {
      toast.error(errorMessage(err))
    }
  }

  // ── Submit note ─────────────────────────────────────────────────────
  async function submitNote(e: React.FormEvent) {
    e.preventDefault()
    if (!noteTitle.trim() || noteSubmitting) return
    setNoteSubmitting(true)

    try {
      const created = await apiSend<ProjectNote>('/api/admin/notes', 'POST', {
        title: noteTitle,
        content: noteContent,
      })
      setNotes((p) => [{ ...created, comment_count: 0 }, ...p])
      setNoteTitle('')
      setNoteContent('')
      setShowNoteForm(false)
      toast.success('Note saved.')
    } catch (err) {
      toast.error(errorMessage(err))
    } finally {
      setNoteSubmitting(false)
    }
  }

  // ── Toggle pin ──────────────────────────────────────────────────────
  async function togglePin(noteId: string, currentPinned: boolean) {
    try {
      await apiSend('/api/admin/notes', 'PATCH', { id: noteId, is_pinned: !currentPinned })
      setNotes((p) => {
        const updated = p.map((n) => (n.id === noteId ? { ...n, is_pinned: !currentPinned } : n))
        return updated.sort((a, b) => {
          if (a.is_pinned !== b.is_pinned) return a.is_pinned ? -1 : 1
          return new Date(b.created_at).getTime() - new Date(a.created_at).getTime()
        })
      })
      toast.success(currentPinned ? 'Note unpinned.' : 'Note pinned.')
    } catch (err) {
      toast.error(errorMessage(err))
    }
  }

  // ── Update note ─────────────────────────────────────────────────────
  async function updateNote(e: React.FormEvent) {
    e.preventDefault()
    if (!editingNote || editNoteSubmitting) return
    setEditNoteSubmitting(true)

    const edited = editingNote
    try {
      await apiSend('/api/admin/notes', 'PATCH', {
        id: edited.id,
        title: edited.title,
        content: edited.content,
      })
      setNotes((p) =>
        p.map((n) =>
          n.id === edited.id
            ? { ...n, title: edited.title, content: edited.content }
            : n
        )
      )
      setEditingNote(null)
      toast.success('Saved.')
    } catch (err) {
      toast.error(errorMessage(err))
    } finally {
      setEditNoteSubmitting(false)
    }
  }

  // ── Delete note ────────────────────────────────────────────────────
  async function deleteNote(noteId: string) {
    if (!confirm('Delete this note? This cannot be undone.')) return

    try {
      await apiSend('/api/admin/notes', 'DELETE', { id: noteId })
      setNotes((p) => p.filter((n) => n.id !== noteId))
      if (expandedNote === noteId) setExpandedNote(null)
      toast.success('Deleted.')
    } catch (err) {
      toast.error(errorMessage(err))
    }
  }

  // ── Load comments on expand ─────────────────────────────────────────
  useEffect(() => {
    if (expandedFeedback && !feedbackComments[expandedFeedback]) {
      fetchComments('feedback', expandedFeedback)
    }
  }, [expandedFeedback]) // eslint-disable-line react-hooks/exhaustive-deps

  useEffect(() => {
    if (expandedWork && !workComments[expandedWork]) {
      fetchComments('work-requests', expandedWork)
    }
  }, [expandedWork]) // eslint-disable-line react-hooks/exhaustive-deps

  useEffect(() => {
    if (expandedNote && !noteComments[expandedNote]) {
      fetchComments('notes', expandedNote)
    }
  }, [expandedNote]) // eslint-disable-line react-hooks/exhaustive-deps

  // ── Render ──────────────────────────────────────────────────────────
  return (
    <div className="max-w-6xl mx-auto">
      <header className="mb-8 border-t border-charcoal/10 pt-8">
        <p className="font-body text-xs font-semibold uppercase tracking-widest text-teal">Work together</p>
        <h2 className="mt-2 font-display text-2xl font-semibold text-charcoal">Feedback, requests, and notes</h2>
        <p className="mt-2 font-body text-sm leading-6 text-charcoal/60">Share an idea, request a change, or keep important notes and files with your project.</p>
      </header>

      {/* ── Section 4: Feedback Tool ───────────────────────────────── */}
      <motion.section
        ref={feedbackRef}
        initial={{ opacity: 0, y: 12 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.5, delay: 0.3 }}
        className="mb-16"
        id="feedback"
      >
        <SectionHeader
          title="Feedback"
          subtitle="Share what you love, what you'd change, or report any issues."
        />

        {/* Feedback Form */}
        <form onSubmit={submitFeedback} className="bg-white rounded-xl border border-charcoal/8 p-6 mb-6">
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 mb-4">
            <div>
              <label className="block font-body text-xs font-medium text-charcoal/50 uppercase tracking-wider mb-1.5">
                Category
              </label>
              <select
                value={fbCategory}
                onChange={(e) => setFbCategory(e.target.value)}
                className="w-full rounded-lg border border-charcoal/12 bg-white px-3 py-2.5 font-body text-sm text-charcoal focus:outline-none focus:ring-2 focus:ring-teal/30 focus:border-teal/40 transition-all"
              >
                {FEEDBACK_CATEGORIES.map((cat) => (
                  <option key={cat.value} value={cat.value}>{cat.label}</option>
                ))}
              </select>
            </div>
            <div>
              <label className="block font-body text-xs font-medium text-charcoal/50 uppercase tracking-wider mb-1.5">
                Page / Feature
              </label>
              <select
                value={fbPage}
                onChange={(e) => setFbPage(e.target.value)}
                className="w-full rounded-lg border border-charcoal/12 bg-white px-3 py-2.5 font-body text-sm text-charcoal focus:outline-none focus:ring-2 focus:ring-teal/30 focus:border-teal/40 transition-all"
              >
                <option value="">Select...</option>
                {PAGES_AND_FEATURES.map((p) => (
                  <option key={p} value={p}>{p}</option>
                ))}
              </select>
            </div>
          </div>
          <div className="grid grid-cols-1 sm:grid-cols-[1fr_auto] gap-4 mb-4">
            <div>
              <label className="block font-body text-xs font-medium text-charcoal/50 uppercase tracking-wider mb-1.5">
                Title
              </label>
              <input
                type="text"
                value={fbTitle}
                onChange={(e) => setFbTitle(e.target.value)}
                placeholder="Brief summary of your feedback"
                required
                className="w-full rounded-lg border border-charcoal/12 bg-white px-3 py-2.5 font-body text-sm text-charcoal placeholder:text-charcoal/25 focus:outline-none focus:ring-2 focus:ring-teal/30 focus:border-teal/40 transition-all"
              />
            </div>
            <div>
              <label className="block font-body text-xs font-medium text-charcoal/50 uppercase tracking-wider mb-1.5">
                Priority
              </label>
              <select
                value={fbPriority}
                onChange={(e) => setFbPriority(e.target.value)}
                className="w-full rounded-lg border border-charcoal/12 bg-white px-3 py-2.5 font-body text-sm text-charcoal capitalize focus:outline-none focus:ring-2 focus:ring-teal/30 focus:border-teal/40 transition-all"
              >
                {PRIORITIES.map((p) => (
                  <option key={p} value={p} className="capitalize">{p.charAt(0).toUpperCase() + p.slice(1)}</option>
                ))}
              </select>
            </div>
          </div>
          <div className="mb-4">
            <label className="block font-body text-xs font-medium text-charcoal/50 uppercase tracking-wider mb-1.5">
              Description
            </label>
            <RichTextEditor
              content={fbDescription}
              onChange={setFbDescription}
              placeholder="Describe your feedback in detail..."
              minHeight="80px"
            />
          </div>
          <button
            type="submit"
            disabled={fbSubmitting || !fbTitle.trim()}
            className="rounded-lg bg-teal px-6 py-2.5 font-body text-sm font-medium text-white hover:bg-deep-teal transition-colors disabled:opacity-40 disabled:cursor-not-allowed"
          >
            {fbSubmitting ? 'Submitting...' : 'Submit Feedback'}
          </button>
        </form>

        {/* Feedback Filters */}
        <div className="flex flex-wrap items-center gap-3 mb-4">
          <select
            value={fbFilterStatus}
            onChange={(e) => { setFbFilterStatus(e.target.value); setFbCurrentPage(1) }}
            className="rounded-lg border border-charcoal/12 bg-white px-3 py-2 font-body text-xs text-charcoal focus:outline-none focus:ring-2 focus:ring-teal/30"
          >
            <option value="">All Statuses</option>
            {FEEDBACK_STATUSES.map((s) => (
              <option key={s.value} value={s.value}>{s.label}</option>
            ))}
          </select>
          <select
            value={fbFilterCategory}
            onChange={(e) => { setFbFilterCategory(e.target.value); setFbCurrentPage(1) }}
            className="rounded-lg border border-charcoal/12 bg-white px-3 py-2 font-body text-xs text-charcoal focus:outline-none focus:ring-2 focus:ring-teal/30"
          >
            <option value="">All Categories</option>
            {FEEDBACK_CATEGORIES.map((c) => (
              <option key={c.value} value={c.value}>{c.label}</option>
            ))}
          </select>
          <select
            value={fbFilterPage}
            onChange={(e) => { setFbFilterPage(e.target.value); setFbCurrentPage(1) }}
            className="rounded-lg border border-charcoal/12 bg-white px-3 py-2 font-body text-xs text-charcoal focus:outline-none focus:ring-2 focus:ring-teal/30"
          >
            <option value="">All Pages</option>
            {PAGES_AND_FEATURES.map((p) => (
              <option key={p} value={p}>{p}</option>
            ))}
          </select>
          {(fbFilterStatus || fbFilterCategory || fbFilterPage) && (
            <button
              onClick={() => { setFbFilterStatus(''); setFbFilterCategory(''); setFbFilterPage(''); setFbCurrentPage(1) }}
              className="font-body text-xs text-coral hover:underline"
            >
              Clear filters
            </button>
          )}
        </div>

        {/* Feedback List */}
        {(() => {
          const filtered = feedbackItems.filter((item) => {
            if (fbFilterStatus && item.status !== fbFilterStatus) return false
            if (fbFilterCategory && item.category !== fbFilterCategory) return false
            if (fbFilterPage && item.page_or_feature !== fbFilterPage) return false
            return true
          })
          const totalPages = Math.ceil(filtered.length / fbPageSize)
          const paginated = filtered.slice((fbCurrentPage - 1) * fbPageSize, fbCurrentPage * fbPageSize)

          return filtered.length === 0 ? (
            <div className="text-center py-10">
              <p className="font-body text-sm text-charcoal/30">
                {feedbackItems.length === 0 ? 'No feedback yet. Be the first to share your thoughts!' : 'No feedback matches your filters.'}
              </p>
            </div>
          ) : (
            <>
              <div className="space-y-3">
                {paginated.map((item) => (
                  <div key={item.id} className="bg-white rounded-xl border border-charcoal/8 overflow-hidden">
                    <button
                      onClick={() => setExpandedFeedback(expandedFeedback === item.id ? null : item.id)}
                      className="w-full flex items-start gap-3 px-5 py-4 text-left hover:bg-charcoal/[0.02] transition-colors"
                    >
                      <div className="flex-1 min-w-0">
                        <div className="flex flex-wrap items-center gap-2 mb-1.5">
                          <span className={`inline-flex items-center px-2 py-0.5 rounded-full text-xs font-body font-medium ${CATEGORY_COLORS[item.category] || 'bg-charcoal/8 text-charcoal/50'}`}>
                            {CATEGORY_LABELS[item.category] || item.category}
                          </span>
                          <span className={`inline-flex items-center px-2 py-0.5 rounded-full text-xs font-body font-medium capitalize ${FEEDBACK_STATUS_COLORS[item.status] || 'bg-charcoal/8 text-charcoal/50'}`}>
                            {item.status}
                          </span>
                          <span className={`inline-flex items-center px-2 py-0.5 rounded-full text-xs font-body font-medium capitalize ${PRIORITY_COLORS[item.priority] || 'bg-charcoal/8 text-charcoal/50'}`}>
                            {item.priority}
                          </span>
                        </div>
                        <h4 className="font-display text-sm font-semibold text-charcoal truncate">
                          {item.title}
                        </h4>
                        {item.page_or_feature && (
                          <p className="font-body text-xs text-charcoal/30 mt-0.5">{item.page_or_feature}</p>
                        )}
                      </div>
                      <div className="flex items-center gap-3 shrink-0 pt-1">
                        {item.comment_count > 0 && (
                          <span className="font-body text-xs text-charcoal/30 flex items-center gap-1">
                            <svg className="w-3.5 h-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5}>
                              <path strokeLinecap="round" strokeLinejoin="round" d="M7.5 8.25h9m-9 3H12m-9.75 1.51c0 1.6 1.123 2.994 2.707 3.227 1.129.166 2.27.293 3.423.379.35.026.67.21.865.501L12 21l2.755-4.133a1.14 1.14 0 0 1 .865-.501 48.172 48.172 0 0 0 3.423-.379c1.584-.233 2.707-1.626 2.707-3.228V6.741c0-1.602-1.123-2.995-2.707-3.228A48.394 48.394 0 0 0 12 3c-2.392 0-4.744.175-7.043.513C3.373 3.746 2.25 5.14 2.25 6.741v6.018Z" />
                            </svg>
                            {item.comment_count}
                          </span>
                        )}
                        <span className="font-body text-xs text-charcoal/25">{formatDate(item.created_at)}</span>
                        <motion.svg
                          animate={{ rotate: expandedFeedback === item.id ? 180 : 0 }}
                          transition={{ duration: 0.2 }}
                          className="w-4 h-4 text-charcoal/25"
                          fill="none"
                          viewBox="0 0 24 24"
                          stroke="currentColor"
                          strokeWidth={1.5}
                        >
                          <path strokeLinecap="round" strokeLinejoin="round" d="m19.5 8.25-7.5 7.5-7.5-7.5" />
                        </motion.svg>
                      </div>
                    </button>
                    <AnimatePresence>
                      {expandedFeedback === item.id && (
                        <motion.div
                          initial={{ height: 0, opacity: 0 }}
                          animate={{ height: 'auto', opacity: 1 }}
                          exit={{ height: 0, opacity: 0 }}
                          transition={{ duration: 0.25 }}
                          className="overflow-hidden"
                        >
                          <div className="px-5 pb-5 border-t border-charcoal/6">
                            {/* Status change + actions */}
                            <div className="flex flex-wrap items-center gap-2 mt-3 mb-3">
                              <span className="font-body text-xs text-charcoal/40 mr-1">Status:</span>
                              {FEEDBACK_STATUSES.map((s) => (
                                <button
                                  key={s.value}
                                  onClick={() => updateFeedbackStatus(item.id, s.value)}
                                  className={`px-2.5 py-1 rounded-full text-xs font-body font-medium transition-all ${
                                    item.status === s.value
                                      ? FEEDBACK_STATUS_COLORS[s.value]
                                      : 'bg-charcoal/5 text-charcoal/30 hover:bg-charcoal/10'
                                  }`}
                                >
                                  {s.label}
                                </button>
                              ))}
                              <div className="ml-auto flex gap-2">
                                <button
                                  onClick={() => {
                                    setEditingFeedback(item.id)
                                    setEditFbTitle(item.title)
                                    setEditFbDescription(item.description || '')
                                    setEditFbCategory(item.category)
                                    setEditFbPriority(item.priority)
                                    setEditFbPage(item.page_or_feature || '')
                                  }}
                                  className="font-body text-xs text-teal hover:underline"
                                >
                                  Edit
                                </button>
                                <button
                                  onClick={() => deleteFeedback(item.id)}
                                  className="font-body text-xs text-coral hover:underline"
                                >
                                  Delete
                                </button>
                              </div>
                            </div>

                            {/* Edit form */}
                            {editingFeedback === item.id ? (
                              <div className="bg-charcoal/[0.02] rounded-lg p-4 mb-3 space-y-3">
                                <input
                                  type="text"
                                  value={editFbTitle}
                                  onChange={(e) => setEditFbTitle(e.target.value)}
                                  className="w-full rounded-lg border border-charcoal/12 bg-white px-3 py-2 font-body text-sm text-charcoal focus:outline-none focus:ring-2 focus:ring-teal/30"
                                />
                                <div className="grid grid-cols-3 gap-2">
                                  <select
                                    value={editFbCategory}
                                    onChange={(e) => setEditFbCategory(e.target.value)}
                                    className="rounded-lg border border-charcoal/12 bg-white px-2 py-2 font-body text-xs text-charcoal"
                                  >
                                    {FEEDBACK_CATEGORIES.map((c) => (
                                      <option key={c.value} value={c.value}>{c.label}</option>
                                    ))}
                                  </select>
                                  <select
                                    value={editFbPriority}
                                    onChange={(e) => setEditFbPriority(e.target.value)}
                                    className="rounded-lg border border-charcoal/12 bg-white px-2 py-2 font-body text-xs text-charcoal capitalize"
                                  >
                                    {PRIORITIES.map((p) => (
                                      <option key={p} value={p}>{p.charAt(0).toUpperCase() + p.slice(1)}</option>
                                    ))}
                                  </select>
                                  <select
                                    value={editFbPage}
                                    onChange={(e) => setEditFbPage(e.target.value)}
                                    className="rounded-lg border border-charcoal/12 bg-white px-2 py-2 font-body text-xs text-charcoal"
                                  >
                                    <option value="">No page</option>
                                    {PAGES_AND_FEATURES.map((p) => (
                                      <option key={p} value={p}>{p}</option>
                                    ))}
                                  </select>
                                </div>
                                <RichTextEditor
                                  content={editFbDescription}
                                  onChange={setEditFbDescription}
                                  placeholder="Description..."
                                  minHeight="60px"
                                />
                                <div className="flex gap-2">
                                  <button
                                    onClick={() => saveFeedbackEdit(item.id)}
                                    disabled={editFbSubmitting}
                                    className="rounded-lg bg-teal px-4 py-1.5 font-body text-xs font-medium text-white hover:bg-deep-teal transition-colors disabled:opacity-40"
                                  >
                                    {editFbSubmitting ? 'Saving...' : 'Save'}
                                  </button>
                                  <button
                                    onClick={() => setEditingFeedback(null)}
                                    className="rounded-lg bg-charcoal/5 px-4 py-1.5 font-body text-xs font-medium text-charcoal/50 hover:bg-charcoal/10 transition-colors"
                                  >
                                    Cancel
                                  </button>
                                </div>
                              </div>
                            ) : item.description ? (
                              <div
                                className="rich-content font-body text-sm text-charcoal/60 leading-relaxed mb-3"
                                dangerouslySetInnerHTML={{ __html: sanitizeHtml(item.description) }}
                              />
                            ) : null}

                            {/* Comment thread */}
                            <CommentThread
                              comments={feedbackComments[item.id] || []}
                              isLoading={!!loadingComments[`feedback-${item.id}`]}
                              newComment={newFeedbackComment}
                              setNewComment={setNewFeedbackComment}
                              onSubmit={() =>
                                submitComment('feedback', item.id, newFeedbackComment, () =>
                                  setNewFeedbackComment('')
                                )
                              }
                            />

                            {/* Audit trail */}
                            {item.audit_log && item.audit_log.length > 0 && (
                              <div className="mt-4 pt-3 border-t border-charcoal/6">
                                <p className="font-body text-xs font-medium text-charcoal/30 uppercase tracking-wider mb-2">Activity Log</p>
                                <div className="space-y-1">
                                  {item.audit_log
                                    .sort((a: AuditEntry, b: AuditEntry) => new Date(b.created_at).getTime() - new Date(a.created_at).getTime())
                                    .map((entry: AuditEntry) => (
                                    <div key={entry.id} className="flex items-baseline gap-2 font-body text-xs text-charcoal/40">
                                      <span className="text-charcoal/25 shrink-0">{formatDate(entry.created_at)}</span>
                                      <span>
                                        {AUDIT_ACTION_LABELS[entry.action] || entry.action}
                                        {entry.old_value && entry.new_value && entry.action !== 'created' && (
                                          <span className="text-charcoal/30"> — {entry.old_value} → {entry.new_value}</span>
                                        )}
                                      </span>
                                    </div>
                                  ))}
                                </div>
                              </div>
                            )}
                          </div>
                        </motion.div>
                      )}
                    </AnimatePresence>
                  </div>
                ))}
              </div>

              {/* Pagination */}
              <div className="flex flex-wrap items-center justify-between gap-4 mt-4 px-1">
                <div className="flex items-center gap-2">
                  <span className="font-body text-xs text-charcoal/40">Show</span>
                  <select
                    value={fbPageSize}
                    onChange={(e) => { setFbPageSize(Number(e.target.value)); setFbCurrentPage(1) }}
                    className="rounded border border-charcoal/12 bg-white px-2 py-1 font-body text-xs text-charcoal"
                  >
                    {[5, 10, 25, 100].map((n) => (
                      <option key={n} value={n}>{n}</option>
                    ))}
                  </select>
                  <span className="font-body text-xs text-charcoal/40">of {filtered.length}</span>
                </div>
                {totalPages > 1 && (
                  <div className="flex items-center gap-1">
                    <button
                      onClick={() => setFbCurrentPage((p) => Math.max(1, p - 1))}
                      disabled={fbCurrentPage === 1}
                      className="px-2.5 py-1 rounded font-body text-xs text-charcoal/50 hover:bg-charcoal/5 disabled:opacity-30 disabled:cursor-not-allowed"
                    >
                      Prev
                    </button>
                    {Array.from({ length: totalPages }, (_, i) => i + 1).map((p) => (
                      <button
                        key={p}
                        onClick={() => setFbCurrentPage(p)}
                        className={`w-7 h-7 rounded font-body text-xs ${
                          fbCurrentPage === p
                            ? 'bg-teal text-white'
                            : 'text-charcoal/50 hover:bg-charcoal/5'
                        }`}
                      >
                        {p}
                      </button>
                    ))}
                    <button
                      onClick={() => setFbCurrentPage((p) => Math.min(totalPages, p + 1))}
                      disabled={fbCurrentPage === totalPages}
                      className="px-2.5 py-1 rounded font-body text-xs text-charcoal/50 hover:bg-charcoal/5 disabled:opacity-30 disabled:cursor-not-allowed"
                    >
                      Next
                    </button>
                  </div>
                )}
              </div>
            </>
          )
        })()}
      </motion.section>

      {/* ── Section 5: Work Requests ───────────────────────────────── */}
      <motion.section
        initial={{ opacity: 0, y: 12 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.5, delay: 0.4 }}
        className="mb-16"
      >
        <SectionHeader
          title="Work Requests"
          subtitle="Request new features, design changes, content updates, or fixes."
        />

        <div className="mb-4 flex justify-end">
          <button
            onClick={() =>
              setFilesModal({
                entityType: 'work_request',
                entityId: null,
                title: 'Work-request files',
              })
            }
            className="inline-flex items-center gap-2 rounded-lg border border-charcoal/15 bg-white px-4 py-2 font-body text-xs font-medium text-charcoal transition-colors hover:bg-charcoal/5"
          >
            <svg className="w-3.5 h-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5}>
              <path strokeLinecap="round" strokeLinejoin="round" d="M3.75 9.776c.112-.017.227-.026.344-.026h15.812c.117 0 .232.009.344.026m-16.5 0a2.25 2.25 0 0 0-1.883 2.542l.857 6a2.25 2.25 0 0 0 2.227 1.932H19.05a2.25 2.25 0 0 0 2.227-1.932l.857-6a2.25 2.25 0 0 0-1.883-2.542m-16.5 0V6A2.25 2.25 0 0 1 6 3.75h3.879a1.5 1.5 0 0 1 1.06.44l2.122 2.12a1.5 1.5 0 0 0 1.06.44H18A2.25 2.25 0 0 1 20.25 9v.776" />
            </svg>
            Upload / view files
          </button>
        </div>

        {/* Work Request Form */}
        <form onSubmit={submitWorkRequest} className="bg-white rounded-xl border border-charcoal/8 p-6 mb-6">
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 mb-4">
            <div>
              <label className="block font-body text-xs font-medium text-charcoal/50 uppercase tracking-wider mb-1.5">Title</label>
              <input type="text" value={wrTitle} onChange={(e) => setWrTitle(e.target.value)} placeholder="What do you need?" required className="w-full rounded-lg border border-charcoal/12 bg-white px-3 py-2.5 font-body text-sm text-charcoal placeholder:text-charcoal/25 focus:outline-none focus:ring-2 focus:ring-teal/30 focus:border-teal/40 transition-all" />
            </div>
            <div>
              <label className="block font-body text-xs font-medium text-charcoal/50 uppercase tracking-wider mb-1.5">Category</label>
              <select value={wrCategory} onChange={(e) => setWrCategory(e.target.value)} className="w-full rounded-lg border border-charcoal/12 bg-white px-3 py-2.5 font-body text-sm text-charcoal focus:outline-none focus:ring-2 focus:ring-teal/30 focus:border-teal/40 transition-all">
                {WORK_REQUEST_CATEGORIES.map((cat) => (<option key={cat.value} value={cat.value}>{cat.label}</option>))}
              </select>
            </div>
          </div>
          <div className="mb-4">
            <label className="block font-body text-xs font-medium text-charcoal/50 uppercase tracking-wider mb-1.5">Description</label>
            <RichTextEditor content={wrDescription} onChange={setWrDescription} placeholder="Describe what you need in detail..." minHeight="80px" />
          </div>
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 mb-4">
            <div>
              <label className="block font-body text-xs font-medium text-charcoal/50 uppercase tracking-wider mb-1.5">Priority</label>
              <select value={wrPriority} onChange={(e) => setWrPriority(e.target.value)} className="w-full rounded-lg border border-charcoal/12 bg-white px-3 py-2.5 font-body text-sm text-charcoal capitalize focus:outline-none focus:ring-2 focus:ring-teal/30 focus:border-teal/40 transition-all">
                {PRIORITIES.map((p) => (<option key={p} value={p}>{p.charAt(0).toUpperCase() + p.slice(1)}</option>))}
              </select>
            </div>
            <div>
              <label className="block font-body text-xs font-medium text-charcoal/50 uppercase tracking-wider mb-1.5">Due Date (optional)</label>
              <input type="date" value={wrDueDate} onChange={(e) => setWrDueDate(e.target.value)} className="w-full rounded-lg border border-charcoal/12 bg-white px-3 py-2.5 font-body text-sm text-charcoal focus:outline-none focus:ring-2 focus:ring-teal/30 focus:border-teal/40 transition-all" />
            </div>
          </div>
          <button type="submit" disabled={wrSubmitting || !wrTitle.trim()} className="rounded-lg bg-teal px-6 py-2.5 font-body text-sm font-medium text-white hover:bg-deep-teal transition-colors disabled:opacity-40 disabled:cursor-not-allowed">
            {wrSubmitting ? 'Submitting...' : 'Submit Request'}
          </button>
        </form>

        {/* Work Request Filters */}
        <div className="flex flex-wrap items-center gap-3 mb-4">
          <select value={wrFilterStatus} onChange={(e) => { setWrFilterStatus(e.target.value); setWrCurrentPage(1) }} className="rounded-lg border border-charcoal/12 bg-white px-3 py-2 font-body text-xs text-charcoal focus:outline-none focus:ring-2 focus:ring-teal/30">
            <option value="">All Statuses</option>
            {WORK_REQUEST_STATUSES.map((s) => (<option key={s.value} value={s.value}>{s.label}</option>))}
          </select>
          <select value={wrFilterCategory} onChange={(e) => { setWrFilterCategory(e.target.value); setWrCurrentPage(1) }} className="rounded-lg border border-charcoal/12 bg-white px-3 py-2 font-body text-xs text-charcoal focus:outline-none focus:ring-2 focus:ring-teal/30">
            <option value="">All Categories</option>
            {WORK_REQUEST_CATEGORIES.map((c) => (<option key={c.value} value={c.value}>{c.label}</option>))}
          </select>
          {(wrFilterStatus || wrFilterCategory) && (
            <button onClick={() => { setWrFilterStatus(''); setWrFilterCategory(''); setWrCurrentPage(1) }} className="font-body text-xs text-coral hover:underline">Clear filters</button>
          )}
        </div>

        {/* Work Request List */}
        {(() => {
          const filtered = workRequests.filter((item) => {
            if (wrFilterStatus && item.status !== wrFilterStatus) return false
            if (wrFilterCategory && item.category !== wrFilterCategory) return false
            return true
          })
          const totalPages = Math.ceil(filtered.length / wrPageSize)
          const paginated = filtered.slice((wrCurrentPage - 1) * wrPageSize, wrCurrentPage * wrPageSize)

          return filtered.length === 0 ? (
            <div className="text-center py-10">
              <p className="font-body text-sm text-charcoal/30">{workRequests.length === 0 ? 'No work requests yet. Submit your first request above.' : 'No work requests match your filters.'}</p>
            </div>
          ) : (
            <>
              <div className="space-y-3">
                {paginated.map((item) => (
                  <div key={item.id} className="bg-white rounded-xl border border-charcoal/8 overflow-hidden">
                    <button onClick={() => setExpandedWork(expandedWork === item.id ? null : item.id)} className="w-full flex items-start gap-3 px-5 py-4 text-left hover:bg-charcoal/[0.02] transition-colors">
                      <div className="flex-1 min-w-0">
                        <div className="flex flex-wrap items-center gap-2 mb-1.5">
                          <span className={`inline-flex items-center px-2 py-0.5 rounded-full text-xs font-body font-medium ${WORK_STATUS_COLORS[item.status] || 'bg-charcoal/8 text-charcoal/50'}`}>
                            {WORK_REQUEST_STATUSES.find((s) => s.value === item.status)?.label || item.status.replace('_', ' ')}
                          </span>
                          <span className="inline-flex items-center px-2 py-0.5 rounded-full text-xs font-body font-medium bg-charcoal/6 text-charcoal/50">
                            {WR_CATEGORY_LABELS[item.category] || item.category}
                          </span>
                          <span className={`inline-flex items-center px-2 py-0.5 rounded-full text-xs font-body font-medium capitalize ${PRIORITY_COLORS[item.priority] || 'bg-charcoal/8 text-charcoal/50'}`}>
                            {item.priority}
                          </span>
                        </div>
                        <h4 className="font-display text-sm font-semibold text-charcoal truncate">{item.title}</h4>
                        {item.due_date && (<p className="font-body text-xs text-charcoal/30 mt-0.5">Due: {formatDate(item.due_date)}</p>)}
                      </div>
                      <div className="flex items-center gap-3 shrink-0 pt-1">
                        {item.comment_count > 0 && (
                          <span className="font-body text-xs text-charcoal/30 flex items-center gap-1">
                            <svg className="w-3.5 h-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5}><path strokeLinecap="round" strokeLinejoin="round" d="M7.5 8.25h9m-9 3H12m-9.75 1.51c0 1.6 1.123 2.994 2.707 3.227 1.129.166 2.27.293 3.423.379.35.026.67.21.865.501L12 21l2.755-4.133a1.14 1.14 0 0 1 .865-.501 48.172 48.172 0 0 0 3.423-.379c1.584-.233 2.707-1.626 2.707-3.228V6.741c0-1.602-1.123-2.995-2.707-3.228A48.394 48.394 0 0 0 12 3c-2.392 0-4.744.175-7.043.513C3.373 3.746 2.25 5.14 2.25 6.741v6.018Z" /></svg>
                            {item.comment_count}
                          </span>
                        )}
                        <span className="font-body text-xs text-charcoal/25">{formatDate(item.created_at)}</span>
                        <motion.svg animate={{ rotate: expandedWork === item.id ? 180 : 0 }} transition={{ duration: 0.2 }} className="w-4 h-4 text-charcoal/25" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5}><path strokeLinecap="round" strokeLinejoin="round" d="m19.5 8.25-7.5 7.5-7.5-7.5" /></motion.svg>
                      </div>
                    </button>
                    <AnimatePresence>
                      {expandedWork === item.id && (
                        <motion.div initial={{ height: 0, opacity: 0 }} animate={{ height: 'auto', opacity: 1 }} exit={{ height: 0, opacity: 0 }} transition={{ duration: 0.25 }} className="overflow-hidden">
                          <div className="px-5 pb-5 border-t border-charcoal/6">
                            {/* Status toggle buttons */}
                            <div className="flex flex-wrap items-center gap-1.5 mt-3 mb-3">
                              <span className="font-body text-xs text-charcoal/40 mr-1">Status:</span>
                              {WORK_REQUEST_STATUSES.map((s) => (
                                <button key={s.value} onClick={() => updateWrStatus(item.id, s.value)} className={`px-2 py-1 rounded-full text-[11px] font-body font-medium transition-all ${item.status === s.value ? WORK_STATUS_COLORS[s.value] : 'bg-charcoal/5 text-charcoal/30 hover:bg-charcoal/10'}`}>
                                  {s.label}
                                </button>
                              ))}
                              <div className="ml-auto flex gap-2">
                                <button onClick={() => { setEditingWr(item.id); setEditWrTitle(item.title); setEditWrDescription(item.description || ''); setEditWrCategory(item.category); setEditWrPriority(item.priority); setEditWrDueDate(item.due_date || '') }} className="font-body text-xs text-teal hover:underline">Edit</button>
                                <button onClick={() => setFilesModal({ entityType: 'work_request', entityId: item.id, title: `Files for "${item.title}"` })} className="font-body text-xs text-charcoal/60 hover:underline">Files</button>
                                <button onClick={() => deleteWorkRequest(item.id)} className="font-body text-xs text-coral hover:underline">Delete</button>
                              </div>
                            </div>

                            {/* Edit form */}
                            {editingWr === item.id ? (
                              <div className="bg-charcoal/[0.02] rounded-lg p-4 mb-3 space-y-3">
                                <input type="text" value={editWrTitle} onChange={(e) => setEditWrTitle(e.target.value)} className="w-full rounded-lg border border-charcoal/12 bg-white px-3 py-2 font-body text-sm text-charcoal focus:outline-none focus:ring-2 focus:ring-teal/30" />
                                <div className="grid grid-cols-3 gap-2">
                                  <select value={editWrCategory} onChange={(e) => setEditWrCategory(e.target.value)} className="rounded-lg border border-charcoal/12 bg-white px-2 py-2 font-body text-xs text-charcoal">
                                    {WORK_REQUEST_CATEGORIES.map((c) => (<option key={c.value} value={c.value}>{c.label}</option>))}
                                  </select>
                                  <select value={editWrPriority} onChange={(e) => setEditWrPriority(e.target.value)} className="rounded-lg border border-charcoal/12 bg-white px-2 py-2 font-body text-xs text-charcoal capitalize">
                                    {PRIORITIES.map((p) => (<option key={p} value={p}>{p.charAt(0).toUpperCase() + p.slice(1)}</option>))}
                                  </select>
                                  <input type="date" value={editWrDueDate} onChange={(e) => setEditWrDueDate(e.target.value)} className="rounded-lg border border-charcoal/12 bg-white px-2 py-2 font-body text-xs text-charcoal" />
                                </div>
                                <RichTextEditor content={editWrDescription} onChange={setEditWrDescription} placeholder="Description..." minHeight="60px" />
                                <div className="flex gap-2">
                                  <button onClick={() => saveWrEdit(item.id)} disabled={editWrSubmitting} className="rounded-lg bg-teal px-4 py-1.5 font-body text-xs font-medium text-white hover:bg-deep-teal transition-colors disabled:opacity-40">{editWrSubmitting ? 'Saving...' : 'Save'}</button>
                                  <button onClick={() => setEditingWr(null)} className="rounded-lg bg-charcoal/5 px-4 py-1.5 font-body text-xs font-medium text-charcoal/50 hover:bg-charcoal/10 transition-colors">Cancel</button>
                                </div>
                              </div>
                            ) : item.description ? (
                              <div className="rich-content font-body text-sm text-charcoal/60 leading-relaxed mb-3" dangerouslySetInnerHTML={{ __html: sanitizeHtml(item.description) }} />
                            ) : null}

                            <CommentThread comments={workComments[item.id] || []} isLoading={!!loadingComments[`work-requests-${item.id}`]} newComment={newWorkComment} setNewComment={setNewWorkComment} onSubmit={() => submitComment('work-requests', item.id, newWorkComment, () => setNewWorkComment(''))} />

                            {/* Audit trail */}
                            {item.audit_log && item.audit_log.length > 0 && (
                              <div className="mt-4 pt-3 border-t border-charcoal/6">
                                <p className="font-body text-xs font-medium text-charcoal/30 uppercase tracking-wider mb-2">Activity Log</p>
                                <div className="space-y-1">
                                  {item.audit_log.sort((a: AuditEntry, b: AuditEntry) => new Date(b.created_at).getTime() - new Date(a.created_at).getTime()).map((entry: AuditEntry) => (
                                    <div key={entry.id} className="flex items-baseline gap-2 font-body text-xs text-charcoal/40">
                                      <span className="text-charcoal/25 shrink-0">{formatDate(entry.created_at)}</span>
                                      <span>{AUDIT_ACTION_LABELS[entry.action] || entry.action}{entry.old_value && entry.new_value && entry.action !== 'created' && (<span className="text-charcoal/30"> — {entry.old_value} → {entry.new_value}</span>)}</span>
                                    </div>
                                  ))}
                                </div>
                              </div>
                            )}
                          </div>
                        </motion.div>
                      )}
                    </AnimatePresence>
                  </div>
                ))}
              </div>

              {/* Pagination */}
              <div className="flex flex-wrap items-center justify-between gap-4 mt-4 px-1">
                <div className="flex items-center gap-2">
                  <span className="font-body text-xs text-charcoal/40">Show</span>
                  <select value={wrPageSize} onChange={(e) => { setWrPageSize(Number(e.target.value)); setWrCurrentPage(1) }} className="rounded border border-charcoal/12 bg-white px-2 py-1 font-body text-xs text-charcoal">
                    {[5, 10, 25, 100].map((n) => (<option key={n} value={n}>{n}</option>))}
                  </select>
                  <span className="font-body text-xs text-charcoal/40">of {filtered.length}</span>
                </div>
                {totalPages > 1 && (
                  <div className="flex items-center gap-1">
                    <button onClick={() => setWrCurrentPage((p) => Math.max(1, p - 1))} disabled={wrCurrentPage === 1} className="px-2.5 py-1 rounded font-body text-xs text-charcoal/50 hover:bg-charcoal/5 disabled:opacity-30 disabled:cursor-not-allowed">Prev</button>
                    {Array.from({ length: totalPages }, (_, i) => i + 1).map((p) => (
                      <button key={p} onClick={() => setWrCurrentPage(p)} className={`w-7 h-7 rounded font-body text-xs ${wrCurrentPage === p ? 'bg-teal text-white' : 'text-charcoal/50 hover:bg-charcoal/5'}`}>{p}</button>
                    ))}
                    <button onClick={() => setWrCurrentPage((p) => Math.min(totalPages, p + 1))} disabled={wrCurrentPage === totalPages} className="px-2.5 py-1 rounded font-body text-xs text-charcoal/50 hover:bg-charcoal/5 disabled:opacity-30 disabled:cursor-not-allowed">Next</button>
                  </div>
                )}
              </div>
            </>
          )
        })()}
      </motion.section>

      {/* ── Section 6: Project Notes ───────────────────────────────── */}
      <motion.section
        initial={{ opacity: 0, y: 12 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.5, delay: 0.5 }}
        className="mb-16"
      >
        <SectionHeader
          title="Project Notes"
          subtitle="Shared notes, ideas, and reference materials for the project."
        />

        <div className="mb-4 flex justify-end">
          <button
            onClick={() =>
              setFilesModal({
                entityType: 'note',
                entityId: null,
                title: 'Note attachments',
              })
            }
            className="inline-flex items-center gap-2 rounded-lg border border-charcoal/15 bg-white px-4 py-2 font-body text-xs font-medium text-charcoal transition-colors hover:bg-charcoal/5"
          >
            <svg className="w-3.5 h-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5}>
              <path strokeLinecap="round" strokeLinejoin="round" d="M3.75 9.776c.112-.017.227-.026.344-.026h15.812c.117 0 .232.009.344.026m-16.5 0a2.25 2.25 0 0 0-1.883 2.542l.857 6a2.25 2.25 0 0 0 2.227 1.932H19.05a2.25 2.25 0 0 0 2.227-1.932l.857-6a2.25 2.25 0 0 0-1.883-2.542m-16.5 0V6A2.25 2.25 0 0 1 6 3.75h3.879a1.5 1.5 0 0 1 1.06.44l2.122 2.12a1.5 1.5 0 0 0 1.06.44H18A2.25 2.25 0 0 1 20.25 9v.776" />
            </svg>
            Upload / view files
          </button>
        </div>

        {/* Add Note Button / Form */}
        {!showNoteForm ? (
          <button
            onClick={() => setShowNoteForm(true)}
            className="mb-6 inline-flex items-center gap-2 rounded-lg bg-white border border-charcoal/8 px-5 py-3 font-body text-sm font-medium text-charcoal/60 hover:border-teal/30 hover:text-teal transition-colors"
          >
            <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5}>
              <path strokeLinecap="round" strokeLinejoin="round" d="M12 4.5v15m7.5-7.5h-15" />
            </svg>
            Add Note
          </button>
        ) : (
          <form onSubmit={submitNote} className="bg-white rounded-xl border border-charcoal/8 p-6 mb-6">
            <div className="mb-4">
              <label className="block font-body text-xs font-medium text-charcoal/50 uppercase tracking-wider mb-1.5">
                Title
              </label>
              <input
                type="text"
                value={noteTitle}
                onChange={(e) => setNoteTitle(e.target.value)}
                placeholder="Note title"
                required
                autoFocus
                className="w-full rounded-lg border border-charcoal/12 bg-white px-3 py-2.5 font-body text-sm text-charcoal placeholder:text-charcoal/25 focus:outline-none focus:ring-2 focus:ring-teal/30 focus:border-teal/40 transition-all"
              />
            </div>
            <div className="mb-4">
              <label className="block font-body text-xs font-medium text-charcoal/50 uppercase tracking-wider mb-1.5">
                Content
              </label>
              <RichTextEditor
                content={noteContent}
                onChange={setNoteContent}
                placeholder="Write your note here..."
                minHeight="120px"
              />
            </div>
            <div className="flex gap-2">
              <button
                type="submit"
                disabled={noteSubmitting || !noteTitle.trim()}
                className="rounded-lg bg-teal px-6 py-2.5 font-body text-sm font-medium text-white hover:bg-deep-teal transition-colors disabled:opacity-40 disabled:cursor-not-allowed"
              >
                {noteSubmitting ? 'Saving...' : 'Save Note'}
              </button>
              <button
                type="button"
                onClick={() => {
                  setShowNoteForm(false)
                  setNoteTitle('')
                  setNoteContent('')
                }}
                className="rounded-lg bg-charcoal/5 px-4 py-2.5 font-body text-sm text-charcoal/50 hover:bg-charcoal/10 transition-colors"
              >
                Cancel
              </button>
            </div>
          </form>
        )}

        {/* Notes List */}
        {notes.length === 0 ? (
          <div className="text-center py-10">
            <p className="font-body text-sm text-charcoal/30">No notes yet. Create one to get started.</p>
          </div>
        ) : (
          <div className="space-y-3">
            {notes.map((note) => (
              <div key={note.id} className="bg-white rounded-xl border border-charcoal/8 overflow-hidden">
                <button
                  onClick={() => setExpandedNote(expandedNote === note.id ? null : note.id)}
                  className="w-full flex items-start gap-3 px-5 py-4 text-left hover:bg-charcoal/[0.02] transition-colors"
                >
                  {/* Pin icon */}
                  {note.is_pinned && (
                    <svg className="w-4 h-4 text-gold mt-0.5 shrink-0" fill="currentColor" viewBox="0 0 24 24">
                      <path d="M16 4a1 1 0 0 0-1.41 0L9 9.59 5.41 6A1 1 0 0 0 4 7.41L7.59 11 2 16.59 3.41 18l5.59-5.59L12.59 16A1 1 0 0 0 14 14.59L8.41 9 14 3.41 16 4Z" />
                    </svg>
                  )}
                  <div className="flex-1 min-w-0">
                    <h4 className="font-display text-sm font-semibold text-charcoal truncate">
                      {note.is_pinned && (
                        <span className="text-gold mr-1.5 text-xs font-body font-medium uppercase tracking-wider">Pinned</span>
                      )}
                      {note.title}
                    </h4>
                    {note.content && (
                      <p className="font-body text-xs text-charcoal/40 mt-0.5 truncate">
                        {note.content.replace(/<[^>]*>/g, '').slice(0, 100)}
                      </p>
                    )}
                  </div>
                  <div className="flex items-center gap-3 shrink-0 pt-1">
                    {note.comment_count > 0 && (
                      <span className="font-body text-xs text-charcoal/30 flex items-center gap-1">
                        <svg className="w-3.5 h-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5}>
                          <path strokeLinecap="round" strokeLinejoin="round" d="M7.5 8.25h9m-9 3H12m-9.75 1.51c0 1.6 1.123 2.994 2.707 3.227 1.129.166 2.27.293 3.423.379.35.026.67.21.865.501L12 21l2.755-4.133a1.14 1.14 0 0 1 .865-.501 48.172 48.172 0 0 0 3.423-.379c1.584-.233 2.707-1.626 2.707-3.228V6.741c0-1.602-1.123-2.995-2.707-3.228A48.394 48.394 0 0 0 12 3c-2.392 0-4.744.175-7.043.513C3.373 3.746 2.25 5.14 2.25 6.741v6.018Z" />
                        </svg>
                        {note.comment_count}
                      </span>
                    )}
                    <span className="font-body text-xs text-charcoal/25">{formatDate(note.created_at)}</span>
                    <motion.svg
                      animate={{ rotate: expandedNote === note.id ? 180 : 0 }}
                      transition={{ duration: 0.2 }}
                      className="w-4 h-4 text-charcoal/25"
                      fill="none"
                      viewBox="0 0 24 24"
                      stroke="currentColor"
                      strokeWidth={1.5}
                    >
                      <path strokeLinecap="round" strokeLinejoin="round" d="m19.5 8.25-7.5 7.5-7.5-7.5" />
                    </motion.svg>
                  </div>
                </button>
                <AnimatePresence>
                  {expandedNote === note.id && (
                    <motion.div
                      initial={{ height: 0, opacity: 0 }}
                      animate={{ height: 'auto', opacity: 1 }}
                      exit={{ height: 0, opacity: 0 }}
                      transition={{ duration: 0.25 }}
                      className="overflow-hidden"
                    >
                      <div className="px-5 pb-5 border-t border-charcoal/6">
                        <div className="flex items-center gap-2 mt-3 mb-3">
                          <button
                            onClick={(e) => {
                              e.stopPropagation()
                              togglePin(note.id, note.is_pinned)
                            }}
                            className={`inline-flex items-center gap-1.5 rounded-lg px-3 py-1.5 font-body text-xs font-medium transition-colors ${
                              note.is_pinned
                                ? 'bg-gold/10 text-gold hover:bg-gold/20'
                                : 'bg-charcoal/5 text-charcoal/40 hover:bg-charcoal/10'
                            }`}
                          >
                            <svg className="w-3.5 h-3.5" fill={note.is_pinned ? 'currentColor' : 'none'} viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5}>
                              <path strokeLinecap="round" strokeLinejoin="round" d="M17.593 3.322c1.1.128 1.907 1.077 1.907 2.185V21L12 17.25 4.5 21V5.507c0-1.108.806-2.057 1.907-2.185a48.507 48.507 0 0 1 11.186 0Z" />
                            </svg>
                            {note.is_pinned ? 'Unpin' : 'Pin'}
                          </button>
                          <button
                            onClick={(e) => {
                              e.stopPropagation()
                              setEditingNote({ id: note.id, title: note.title, content: note.content || '' })
                            }}
                            className="inline-flex items-center gap-1.5 rounded-lg px-3 py-1.5 font-body text-xs font-medium bg-charcoal/5 text-charcoal/40 hover:bg-charcoal/10 transition-colors"
                          >
                            <svg className="w-3.5 h-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5}>
                              <path strokeLinecap="round" strokeLinejoin="round" d="m16.862 4.487 1.687-1.688a1.875 1.875 0 1 1 2.652 2.652L10.582 16.07a4.5 4.5 0 0 1-1.897 1.13L6 18l.8-2.685a4.5 4.5 0 0 1 1.13-1.897l8.932-8.931Zm0 0L19.5 7.125" />
                            </svg>
                            Edit
                          </button>
                          <button
                            onClick={(e) => {
                              e.stopPropagation()
                              setFilesModal({ entityType: 'note', entityId: note.id, title: `Files for "${note.title}"` })
                            }}
                            className="inline-flex items-center gap-1.5 rounded-lg px-3 py-1.5 font-body text-xs font-medium bg-charcoal/5 text-charcoal/40 hover:bg-charcoal/10 transition-colors"
                          >
                            <svg className="w-3.5 h-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5}>
                              <path strokeLinecap="round" strokeLinejoin="round" d="m18.375 12.739-7.693 7.693a4.5 4.5 0 0 1-6.364-6.364l10.94-10.94A3 3 0 1 1 19.5 7.372L8.552 18.32m.009-.01-.01.01m5.699-9.941-7.81 7.81a1.5 1.5 0 0 0 2.112 2.13" />
                            </svg>
                            Files
                          </button>
                          <button
                            onClick={(e) => {
                              e.stopPropagation()
                              deleteNote(note.id)
                            }}
                            className="inline-flex items-center gap-1.5 rounded-lg px-3 py-1.5 font-body text-xs font-medium bg-coral/8 text-coral hover:bg-coral/15 transition-colors"
                          >
                            <svg className="w-3.5 h-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5}>
                              <path strokeLinecap="round" strokeLinejoin="round" d="m14.74 9-.346 9m-4.788 0L9.26 9m9.968-3.21c.342.052.682.107 1.022.166m-1.022-.165L18.16 19.673a2.25 2.25 0 0 1-2.244 2.077H8.084a2.25 2.25 0 0 1-2.244-2.077L4.772 5.79m14.456 0a48.108 48.108 0 0 0-3.478-.397m-12 .562c.34-.059.68-.114 1.022-.165m0 0a48.11 48.11 0 0 1 3.478-.397m7.5 0v-.916c0-1.18-.91-2.164-2.09-2.201a51.964 51.964 0 0 0-3.32 0c-1.18.037-2.09 1.022-2.09 2.201v.916m7.5 0a48.667 48.667 0 0 0-7.5 0" />
                            </svg>
                            Delete
                          </button>
                        </div>
                        {editingNote?.id === note.id ? (
                          <form onSubmit={updateNote} className="mb-4">
                            <div className="mb-3">
                              <label className="block font-body text-xs font-medium text-charcoal/50 uppercase tracking-wider mb-1.5">
                                Title
                              </label>
                              <input
                                type="text"
                                value={editingNote.title}
                                onChange={(e) => setEditingNote({ ...editingNote, title: e.target.value })}
                                className="w-full rounded-lg border border-charcoal/12 bg-white px-3 py-2.5 font-body text-sm text-charcoal focus:outline-none focus:ring-2 focus:ring-teal/30 focus:border-teal/40 transition-all"
                              />
                            </div>
                            <div className="mb-3">
                              <label className="block font-body text-xs font-medium text-charcoal/50 uppercase tracking-wider mb-1.5">
                                Content
                              </label>
                              <RichTextEditor
                                content={editingNote.content}
                                onChange={(html) => setEditingNote({ ...editingNote, content: html })}
                                placeholder="Edit note content..."
                                minHeight="120px"
                              />
                            </div>
                            <div className="flex gap-2">
                              <button
                                type="submit"
                                disabled={editNoteSubmitting || !editingNote.title.trim()}
                                className="rounded-lg bg-teal px-5 py-2 font-body text-sm font-medium text-white hover:bg-deep-teal transition-colors disabled:opacity-40"
                              >
                                {editNoteSubmitting ? 'Saving...' : 'Save Changes'}
                              </button>
                              <button
                                type="button"
                                onClick={() => setEditingNote(null)}
                                className="rounded-lg bg-charcoal/5 px-4 py-2 font-body text-sm text-charcoal/50 hover:bg-charcoal/10 transition-colors"
                              >
                                Cancel
                              </button>
                            </div>
                          </form>
                        ) : note.content ? (
                          <div
                            className="rich-content font-body text-sm text-charcoal/60 leading-relaxed"
                            dangerouslySetInnerHTML={{ __html: sanitizeHtml(note.content) }}
                          />
                        ) : null}
                        <CommentThread
                          comments={noteComments[note.id] || []}
                          isLoading={!!loadingComments[`notes-${note.id}`]}
                          newComment={newNoteComment}
                          setNewComment={setNewNoteComment}
                          onSubmit={() =>
                            submitComment('notes', note.id, newNoteComment, () =>
                              setNewNoteComment('')
                            )
                          }
                        />
                      </div>
                    </motion.div>
                  )}
                </AnimatePresence>
              </div>
            ))}
          </div>
        )}
      </motion.section>

      {/* ── Footer ─────────────────────────────────────────────────── */}
      <div className="text-center pb-8">
        <p className="font-body text-xs text-charcoal/20">
          ArtByME Project Hub — Built with care for Margaret
        </p>
      </div>

      <SharedFilesModal
        open={filesModal !== null}
        onClose={() => setFilesModal(null)}
        entityType={filesModal?.entityType ?? 'general'}
        entityId={filesModal?.entityId ?? null}
        defaultTag={filesModal?.entityType ?? 'general'}
        title={filesModal?.title}
      />
    </div>
  )
}
