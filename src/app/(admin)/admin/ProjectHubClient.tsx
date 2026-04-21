'use client'

import { useState, useRef, useEffect } from 'react'
import { useRouter } from 'next/navigation'
import { motion, AnimatePresence } from 'framer-motion'
import Link from 'next/link'
import RichTextEditor from '@/components/admin/RichTextEditor'
import SharedFilesModal, { type SharedEntity } from '@/components/admin/SharedFilesModal'

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

interface Funnel {
  id: string
  slug: string
  template: string
  is_published: boolean
  views_count: number
  add_to_cart_count: number
  purchase_count: number
  product_title: string
  product_slug: string
}

interface Props {
  initialFeedback: FeedbackItem[]
  initialWorkRequests: WorkRequest[]
  initialNotes: ProjectNote[]
  initialFunnels?: Funnel[]
}

// ─── Constants ────────────────────────────────────────────────────────
const HOMEPAGE_VARIANTS = [
  {
    number: 1,
    name: 'Gallery Immersion',
    path: '/',
    accent: 'bg-[#F5F0E8]',
    accentBorder: 'border-[#F5F0E8]',
    description: 'Warm minimalism with parallax hero, featured grid, and block-based CMS.',
  },
  {
    number: 2,
    name: 'Studio Energy',
    path: '/v2',
    accent: 'bg-coral',
    accentBorder: 'border-coral',
    description: 'Bold editorial magazine layout with torn-edge dividers and coral accents.',
  },
  {
    number: 3,
    name: 'Immersive Collage',
    path: '/v3',
    accent: 'bg-olive',
    accentBorder: 'border-olive',
    description: 'Textured maximalism with stamp frames, washi tape, and collage aesthetics.',
  },
  {
    number: 4,
    name: 'Kinetic Gallery',
    path: '/v4',
    accent: 'bg-charcoal',
    accentBorder: 'border-charcoal',
    description: 'Dark cinematic experience with horizontal scroll gallery and spotlit artwork.',
  },
  {
    number: 5,
    name: 'Editorial Canvas',
    path: '/v5',
    accent: 'bg-gold',
    accentBorder: 'border-gold',
    description: 'Magazine masthead with oversized typography and clip-path image reveals.',
  },
  {
    number: 6,
    name: 'Living Studio',
    path: '/v6',
    accent: 'bg-teal',
    accentBorder: 'border-teal',
    description: 'Playful paint splashes, polaroid cards, draggable carousel, and sketchbook sections.',
  },
]

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

const FEATURES_DATA = [
  {
    title: 'Shop & Ecommerce',
    icon: (
      <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5}>
        <path strokeLinecap="round" strokeLinejoin="round" d="M15.75 10.5V6a3.75 3.75 0 1 0-7.5 0v4.5m11.356-1.993 1.263 12c.07.665-.45 1.243-1.119 1.243H4.25a1.125 1.125 0 0 1-1.12-1.243l1.264-12A1.125 1.125 0 0 1 5.513 7.5h12.974c.576 0 1.059.435 1.119 1.007ZM8.625 10.5a.375.375 0 1 1-.75 0 .375.375 0 0 1 .75 0Zm7.5 0a.375.375 0 1 1-.75 0 .375.375 0 0 1 .75 0Z" />
      </svg>
    ),
    items: [
      'Product catalog with 36 artworks across 5 collections',
      'Canvas print ordering with 8 sizes (8x10 to 30x40)',
      'Frame add-on option for all print sizes',
      '65% margin pricing engine (automatic from Lumaprints wholesale costs)',
      'Original artwork purchasing (1-of-1 with sold tracking)',
      'Dynamic product pages with hover zoom, lightbox, thumbnail gallery',
      'Variant dropdown with Original / Print / Framed separation',
      'Shopping cart with persistent state',
      'Stripe checkout with server-side price validation',
      'Order management in admin panel',
    ],
  },
  {
    title: 'Fulfillment & Integrations',
    icon: (
      <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5}>
        <path strokeLinecap="round" strokeLinejoin="round" d="M8.25 18.75a1.5 1.5 0 0 1-3 0m3 0a1.5 1.5 0 0 0-3 0m3 0h6m-9 0H3.375a1.125 1.125 0 0 1-1.125-1.125V14.25m17.25 4.5a1.5 1.5 0 0 1-3 0m3 0a1.5 1.5 0 0 0-3 0m3 0h1.125c.621 0 1.129-.504 1.09-1.124a17.902 17.902 0 0 0-3.213-9.193 2.056 2.056 0 0 0-1.58-.86H14.25M16.5 18.75h-2.25m0-11.177v-.958c0-.568-.422-1.048-.987-1.106a48.554 48.554 0 0 0-10.026 0 1.106 1.106 0 0 0-.987 1.106v7.635m12-6.677v6.677m0 4.5v-4.5m0 0h-12" />
      </svg>
    ),
    items: [
      'Lumaprints integration (canvas prints, automatic order routing)',
      'Printful integration (merchandise, apparel)',
      'ShipStation integration (self-shipped originals, label generation)',
      'Automated fulfillment routing (orders auto-route to correct provider)',
      'Webhook handlers for tracking updates from all 3 providers',
      'Fulfillment retry system for failed submissions',
    ],
  },
  {
    title: 'Art Classes / LMS',
    icon: (
      <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5}>
        <path strokeLinecap="round" strokeLinejoin="round" d="M4.26 10.147a60.438 60.438 0 0 0-.491 6.347A48.62 48.62 0 0 1 12 20.904a48.62 48.62 0 0 1 8.232-4.41 60.46 60.46 0 0 0-.491-6.347m-15.482 0a50.636 50.636 0 0 0-2.658-.813A59.906 59.906 0 0 1 12 3.493a59.903 59.903 0 0 1 10.399 5.84c-.896.248-1.783.52-2.658.814m-15.482 0A50.717 50.717 0 0 1 12 13.489a50.702 50.702 0 0 1 7.74-3.342M6.75 15a.75.75 0 1 0 0-1.5.75.75 0 0 0 0 1.5Zm0 0v-3.675A55.378 55.378 0 0 1 12 8.443m-7.007 11.55A5.981 5.981 0 0 0 6.75 15.75v-1.5" />
      </svg>
    ),
    items: [
      'Course creation and management',
      'Module and lesson organization',
      'Video lesson support',
      'Student enrollment (free or paid via Stripe)',
      'Lesson progress tracking with video resume',
      'Discussion / comments per lesson',
    ],
  },
  {
    title: 'Content Management',
    icon: (
      <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5}>
        <path strokeLinecap="round" strokeLinejoin="round" d="m16.862 4.487 1.687-1.688a1.875 1.875 0 1 1 2.652 2.652L10.582 16.07a4.5 4.5 0 0 1-1.897 1.13L6 18l.8-2.685a4.5 4.5 0 0 1 1.13-1.897l8.932-8.931Zm0 0L19.5 7.125M18 14v4.75A2.25 2.25 0 0 1 15.75 21H5.25A2.25 2.25 0 0 1 3 18.75V8.25A2.25 2.25 0 0 1 5.25 6H10" />
      </svg>
    ),
    items: [
      'Page builder for custom pages (About, Privacy, Terms, etc.)',
      'Blog with full CRUD editor',
      'FAQ management with categories',
      'Testimonial management with featured toggle',
      'Site content editor for page-level text swaps',
      'Block-based section management',
    ],
  },
  {
    title: 'Commission Portal',
    icon: (
      <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5}>
        <path strokeLinecap="round" strokeLinejoin="round" d="M9.53 16.122a3 3 0 0 0-5.78 1.128 2.25 2.25 0 0 1-2.4 2.245 4.5 4.5 0 0 0 8.4-2.245c0-.399-.078-.78-.22-1.128Zm0 0a15.998 15.998 0 0 0 3.388-1.62m-5.043-.025a15.994 15.994 0 0 1 1.622-3.395m3.42 3.42a15.995 15.995 0 0 0 4.764-4.648l3.876-5.814a1.151 1.151 0 0 0-1.597-1.597L14.146 6.32a15.996 15.996 0 0 0-4.649 4.763m3.42 3.42a6.776 6.776 0 0 0-3.42-3.42" />
      </svg>
    ),
    items: [
      'Commission request form (multi-step)',
      'Commission tracking with status pipeline',
      'Message thread between artist and client',
      'Admin commission management',
    ],
  },
  {
    title: 'Marketing & Analytics',
    icon: (
      <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5}>
        <path strokeLinecap="round" strokeLinejoin="round" d="M3 13.125C3 12.504 3.504 12 4.125 12h2.25c.621 0 1.125.504 1.125 1.125v6.75C7.5 20.496 6.996 21 6.375 21h-2.25A1.125 1.125 0 0 1 3 19.875v-6.75ZM9.75 8.625c0-.621.504-1.125 1.125-1.125h2.25c.621 0 1.125.504 1.125 1.125v11.25c0 .621-.504 1.125-1.125 1.125h-2.25a1.125 1.125 0 0 1-1.125-1.125V8.625ZM16.5 4.125c0-.621.504-1.125 1.125-1.125h2.25C20.496 3 21 3.504 21 4.125v15.75c0 .621-.504 1.125-1.125 1.125h-2.25a1.125 1.125 0 0 1-1.125-1.125V4.125Z" />
      </svg>
    ),
    items: [
      'Newsletter subscriber management',
      'Email template system',
      'Abandoned cart automation (3-step sequence)',
      'Meta Pixel (client-side) + Conversions API (server-side)',
      'Promo code system',
    ],
  },
  {
    title: 'Admin Panel',
    icon: (
      <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5}>
        <path strokeLinecap="round" strokeLinejoin="round" d="M10.5 6h9.75M10.5 6a1.5 1.5 0 1 1-3 0m3 0a1.5 1.5 0 1 0-3 0M3.75 6H7.5m3 12h9.75m-9.75 0a1.5 1.5 0 0 1-3 0m3 0a1.5 1.5 0 0 0-3 0m-3.75 0H7.5m9-6h3.75m-3.75 0a1.5 1.5 0 0 1-3 0m3 0a1.5 1.5 0 0 0-3 0m-9.75 0h9.75" />
      </svg>
    ),
    items: [
      'Dashboard with revenue summary',
      'Product CRUD with variant management',
      'Order management with status tracking',
      'Customer management',
      'Commission management',
      'Class / LMS management',
      'Blog editor',
      'Page builder',
      'Email campaign management',
      'FAQ & Testimonials',
      'Subscriber management',
      'Settings with integration status',
      'Promo codes',
    ],
  },
  {
    title: 'PASTOR Sales Funnels',
    icon: (
      <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5}>
        <path strokeLinecap="round" strokeLinejoin="round" d="M10.34 15.84c-.688-.06-1.386-.09-2.09-.09H7.5a4.5 4.5 0 1 1 0-9h.75c.704 0 1.402-.03 2.09-.09m0 9.18c.253.962.584 1.892.985 2.783.247.55.06 1.21-.463 1.511l-.657.38c-.551.318-1.26.117-1.527-.461a20.845 20.845 0 0 1-1.44-4.282m3.102.069a18.03 18.03 0 0 1-.59-4.59c0-1.586.205-3.124.59-4.59m0 9.18a23.848 23.848 0 0 1 8.835 2.535M10.34 6.66a23.847 23.847 0 0 0 8.835-2.535m0 0A23.74 23.74 0 0 0 18.795 3m.38 1.125a23.91 23.91 0 0 1 1.014 5.395m-1.014 8.855c-.118.38-.245.754-.38 1.125m.38-1.125a23.91 23.91 0 0 0 1.014-5.395m0-3.46c.495.413.811 1.035.811 1.73 0 .695-.316 1.317-.811 1.73m0-3.46a24.347 24.347 0 0 1 0 3.46" />
      </svg>
    ),
    items: [
      '3 PASTOR sales funnel templates (Gallery Spotlight, Intimate Journal, Bold Showcase)',
      'Dedicated single-artwork landing pages at /art/[slug]',
      'Full PASTOR copywriting framework: Problem → Amplify → Story → Transformation → Offer → Risk Reversal',
      'Cart integration with variant selection on funnel pages',
      'Admin funnel builder: create, edit, publish funnels per artwork',
      'Analytics per funnel: views, add-to-cart, purchases',
      'SEO-optimized with custom OG images per funnel',
      'Ken Burns hero animations, parallax, scroll reveals',
    ],
  },
  {
    title: 'Design & Frontend',
    icon: (
      <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5}>
        <path strokeLinecap="round" strokeLinejoin="round" d="M9.813 15.904 9 18.75l-.813-2.846a4.5 4.5 0 0 0-3.09-3.09L2.25 12l2.846-.813a4.5 4.5 0 0 0 3.09-3.09L9 5.25l.813 2.846a4.5 4.5 0 0 0 3.09 3.09L15.75 12l-2.846.813a4.5 4.5 0 0 0-3.09 3.09ZM18.259 8.715 18 9.75l-.259-1.035a3.375 3.375 0 0 0-2.455-2.456L14.25 6l1.036-.259a3.375 3.375 0 0 0 2.455-2.456L18 2.25l.259 1.035a3.375 3.375 0 0 0 2.455 2.456L21.75 6l-1.036.259a3.375 3.375 0 0 0-2.455 2.456ZM16.894 20.567 16.5 21.75l-.394-1.183a2.25 2.25 0 0 0-1.423-1.423L13.5 18.75l1.183-.394a2.25 2.25 0 0 0 1.423-1.423l.394-1.183.394 1.183a2.25 2.25 0 0 0 1.423 1.423l1.183.394-1.183.394a2.25 2.25 0 0 0-1.423 1.423Z" />
      </svg>
    ),
    items: [
      '6 unique homepage designs',
      'Responsive across all devices',
      'Framer Motion animations throughout',
      '7 custom font families',
      'Warm gallery-editorial aesthetic',
      'Artwork-first product pages',
    ],
  },
]

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

function todayFormatted() {
  return new Intl.DateTimeFormat('en-US', {
    weekday: 'long',
    month: 'long',
    day: 'numeric',
    year: 'numeric',
  }).format(new Date())
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
const TEMPLATE_LABELS: Record<string, { label: string; accent: string }> = {
  gallery_spotlight: { label: 'Gallery Spotlight', accent: 'bg-charcoal' },
  intimate_journal: { label: 'Intimate Journal', accent: 'bg-gold' },
  bold_showcase: { label: 'Bold Showcase', accent: 'bg-coral' },
}

export default function ProjectHubClient({
  initialFeedback,
  initialWorkRequests,
  initialNotes,
  initialFunnels = [],
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
  const [expandedFeature, setExpandedFeature] = useState<number | null>(null)

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

  const router = useRouter()

  // Welcome gate + tutorial
  const [tutorialStep, setTutorialStep] = useState<number | null>(null)
  useEffect(() => {
    // Redirect to welcome letter unless permanently dismissed or just entered from welcome
    const permanent = localStorage.getItem('artbyme_welcome_dismissed') === 'permanent'
    const fromWelcome = sessionStorage.getItem('artbyme_entered_from_welcome')
    if (!permanent && !fromWelcome) {
      router.replace('/welcome')
      return
    }

    // Start tutorial if coming from welcome page
    const params = new URLSearchParams(window.location.search)
    if (params.get('tutorial') === '1' && !localStorage.getItem('artbyme_tutorial_hidden')) {
      setTutorialStep(0)
      window.history.replaceState({}, '', window.location.pathname)
    }
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

      const res = await fetch(endpoint)
      const json = await res.json()
      const data = json.data || []

      if (type === 'feedback') setFeedbackComments((p) => ({ ...p, [id]: data }))
      else if (type === 'work-requests') setWorkComments((p) => ({ ...p, [id]: data }))
      else setNoteComments((p) => ({ ...p, [id]: data }))
    } catch {
      /* silently fail */
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
      const res = await fetch(endpoint, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ message }),
      })
      const json = await res.json()

      if (json.data) {
        if (type === 'feedback') {
          setFeedbackComments((p) => ({ ...p, [id]: [...(p[id] || []), json.data] }))
        } else if (type === 'work-requests') {
          setWorkComments((p) => ({ ...p, [id]: [...(p[id] || []), json.data] }))
        } else {
          setNoteComments((p) => ({ ...p, [id]: [...(p[id] || []), json.data] }))
        }
        clearFn()
      }
    } catch {
      /* silently fail */
    }
  }

  // ── Submit feedback ─────────────────────────────────────────────────
  async function submitFeedback(e: React.FormEvent) {
    e.preventDefault()
    if (!fbTitle.trim() || fbSubmitting) return
    setFbSubmitting(true)

    try {
      const res = await fetch('/api/admin/feedback', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          category: fbCategory,
          page_or_feature: fbPage || null,
          title: fbTitle,
          description: fbDescription,
          priority: fbPriority,
        }),
      })
      const json = await res.json()

      if (json.data) {
        setFeedbackItems((p) => [{ ...json.data, comment_count: 0, audit_log: [] }, ...p])
        setFbTitle('')
        setFbDescription('')
        setFbCategory('general')
        setFbPage('')
        setFbPriority('medium')
        setFbCurrentPage(1)
      }
    } catch {
      /* silently fail */
    } finally {
      setFbSubmitting(false)
    }
  }

  async function updateFeedbackStatus(id: string, status: string) {
    try {
      const res = await fetch('/api/admin/feedback', {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ id, status }),
      })
      const json = await res.json()
      if (json.data) {
        setFeedbackItems((p) => p.map((item) => item.id === id ? { ...item, ...json.data, comment_count: item.comment_count, audit_log: item.audit_log } : item))
        // Refresh to get updated audit log
        refreshFeedback()
      }
    } catch { /* silently fail */ }
  }

  async function saveFeedbackEdit(id: string) {
    if (editFbSubmitting) return
    setEditFbSubmitting(true)
    try {
      const res = await fetch('/api/admin/feedback', {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          id,
          title: editFbTitle,
          description: editFbDescription,
          category: editFbCategory,
          priority: editFbPriority,
          page_or_feature: editFbPage,
        }),
      })
      const json = await res.json()
      if (json.data) {
        setEditingFeedback(null)
        refreshFeedback()
      }
    } catch { /* silently fail */ }
    finally { setEditFbSubmitting(false) }
  }

  async function deleteFeedback(id: string) {
    if (!confirm('Delete this feedback permanently?')) return
    try {
      await fetch('/api/admin/feedback', {
        method: 'DELETE',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ id }),
      })
      setFeedbackItems((p) => p.filter((item) => item.id !== id))
      if (expandedFeedback === id) setExpandedFeedback(null)
    } catch { /* silently fail */ }
  }

  async function refreshFeedback() {
    try {
      const res = await fetch('/api/admin/feedback')
      const json = await res.json()
      if (json.data) setFeedbackItems(json.data)
    } catch { /* silently fail */ }
  }

  // ── Submit work request ─────────────────────────────────────────────
  async function submitWorkRequest(e: React.FormEvent) {
    e.preventDefault()
    if (!wrTitle.trim() || wrSubmitting) return
    setWrSubmitting(true)

    try {
      const res = await fetch('/api/admin/work-requests', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          title: wrTitle,
          category: wrCategory,
          description: wrDescription,
          priority: wrPriority,
          due_date: wrDueDate || null,
        }),
      })
      const json = await res.json()

      if (json.data) {
        setWorkRequests((p) => [{ ...json.data, comment_count: 0, audit_log: [] }, ...p])
        setWrTitle('')
        setWrDescription('')
        setWrCategory('feature')
        setWrPriority('medium')
        setWrDueDate('')
        setWrCurrentPage(1)
      }
    } catch {
      /* silently fail */
    } finally {
      setWrSubmitting(false)
    }
  }

  async function updateWrStatus(id: string, status: string) {
    try {
      const res = await fetch('/api/admin/work-requests', {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ id, status }),
      })
      const json = await res.json()
      if (json.data) refreshWorkRequests()
    } catch { /* silently fail */ }
  }

  async function saveWrEdit(id: string) {
    if (editWrSubmitting) return
    setEditWrSubmitting(true)
    try {
      const res = await fetch('/api/admin/work-requests', {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          id,
          title: editWrTitle,
          description: editWrDescription,
          category: editWrCategory,
          priority: editWrPriority,
          due_date: editWrDueDate || null,
        }),
      })
      const json = await res.json()
      if (json.data) { setEditingWr(null); refreshWorkRequests() }
    } catch { /* silently fail */ }
    finally { setEditWrSubmitting(false) }
  }

  async function deleteWorkRequest(id: string) {
    if (!confirm('Delete this work request permanently?')) return
    try {
      await fetch('/api/admin/work-requests', {
        method: 'DELETE',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ id }),
      })
      setWorkRequests((p) => p.filter((item) => item.id !== id))
      if (expandedWork === id) setExpandedWork(null)
    } catch { /* silently fail */ }
  }

  async function refreshWorkRequests() {
    try {
      const res = await fetch('/api/admin/work-requests')
      const json = await res.json()
      if (json.data) setWorkRequests(json.data)
    } catch { /* silently fail */ }
  }

  // ── Submit note ─────────────────────────────────────────────────────
  async function submitNote(e: React.FormEvent) {
    e.preventDefault()
    if (!noteTitle.trim() || noteSubmitting) return
    setNoteSubmitting(true)

    try {
      const res = await fetch('/api/admin/notes', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          title: noteTitle,
          content: noteContent,
        }),
      })
      const json = await res.json()

      if (json.data) {
        setNotes((p) => [{ ...json.data, comment_count: 0 }, ...p])
        setNoteTitle('')
        setNoteContent('')
        setShowNoteForm(false)
      }
    } catch {
      /* silently fail */
    } finally {
      setNoteSubmitting(false)
    }
  }

  // ── Toggle pin ──────────────────────────────────────────────────────
  async function togglePin(noteId: string, currentPinned: boolean) {
    try {
      const res = await fetch('/api/admin/notes', {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ id: noteId, is_pinned: !currentPinned }),
      })
      const json = await res.json()

      if (json.data) {
        setNotes((p) => {
          const updated = p.map((n) => (n.id === noteId ? { ...n, is_pinned: !currentPinned } : n))
          return updated.sort((a, b) => {
            if (a.is_pinned !== b.is_pinned) return a.is_pinned ? -1 : 1
            return new Date(b.created_at).getTime() - new Date(a.created_at).getTime()
          })
        })
      }
    } catch {
      /* silently fail */
    }
  }

  // ── Update note ─────────────────────────────────────────────────────
  async function updateNote(e: React.FormEvent) {
    e.preventDefault()
    if (!editingNote || editNoteSubmitting) return
    setEditNoteSubmitting(true)

    try {
      const res = await fetch('/api/admin/notes', {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          id: editingNote.id,
          title: editingNote.title,
          content: editingNote.content,
        }),
      })
      const json = await res.json()

      if (json.data) {
        setNotes((p) =>
          p.map((n) =>
            n.id === editingNote.id
              ? { ...n, title: editingNote.title, content: editingNote.content }
              : n
          )
        )
        setEditingNote(null)
      }
    } catch {
      /* silently fail */
    } finally {
      setEditNoteSubmitting(false)
    }
  }

  // ── Delete note ────────────────────────────────────────────────────
  async function deleteNote(noteId: string) {
    if (!confirm('Delete this note? This cannot be undone.')) return

    try {
      const res = await fetch('/api/admin/notes', {
        method: 'DELETE',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ id: noteId }),
      })
      const json = await res.json()

      if (json.success) {
        setNotes((p) => p.filter((n) => n.id !== noteId))
        if (expandedNote === noteId) setExpandedNote(null)
      }
    } catch {
      /* silently fail */
    }
  }

  // ── Open feedback with page pre-filled ──────────────────────────────
  function openFeedbackForVariant(variantNumber: number) {
    setFbPage(`Homepage V${variantNumber}`)
    feedbackRef.current?.scrollIntoView({ behavior: 'smooth', block: 'start' })
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

  const TUTORIAL_STEPS = [
    {
      title: 'Welcome to Your Dashboard!',
      emoji: '👋',
      body: "This is your ArtByME command center. Let's take a quick look at the most important things to explore first.",
      cta: "Let's go",
    },
    {
      title: '6 Homepage Designs',
      emoji: '🏠',
      body: 'Scroll down to the "Homepage Designs" section. You\'ll see six unique homepage variants — click "View Live" on each one to see it in action. Take your time with each design and think about which direction feels most like you.',
      cta: 'Got it',
    },
    {
      title: 'Your Artwork Funnels',
      emoji: '🎨',
      body: 'Below the homepage designs, you\'ll find your Artwork Funnels. Each funnel is a dedicated, story-driven sales page built around one piece of your art. There are 3 template styles — Gallery Spotlight, Intimate Journal, and Bold Showcase — and each piece of art is matched to the template that fits it best. Click any funnel to see it live!',
      cta: 'Next',
    },
    {
      title: 'Share Your Feedback',
      emoji: '💬',
      body: 'At the bottom of this dashboard, you\'ll find the Feedback section. After you\'ve explored the homepage designs and funnels, use this section to tell us what you love, what you\'d change, and which direction speaks to you. We\'ll take it from there!',
      cta: 'Start exploring',
    },
  ]

  function dismissTutorial(permanent = false) {
    if (permanent) {
      localStorage.setItem('artbyme_tutorial_hidden', '1')
    }
    setTutorialStep(null)
    window.scrollTo({ top: 0, behavior: 'smooth' })
  }

  // ── Render ──────────────────────────────────────────────────────────
  return (
    <div className="max-w-6xl mx-auto">
      {/* ── Tutorial Modal ─────────────────────────────────────────── */}
      <AnimatePresence>
        {tutorialStep !== null && (
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            transition={{ duration: 0.25 }}
            className="fixed inset-0 z-[100] flex items-center justify-center p-4"
            style={{ background: 'rgba(44,44,44,0.55)', backdropFilter: 'blur(6px)' }}
            onClick={(e) => { if (e.target === e.currentTarget) dismissTutorial(false) }}
          >
            <motion.div
              key={tutorialStep}
              initial={{ opacity: 0, scale: 0.95, y: 12 }}
              animate={{ opacity: 1, scale: 1, y: 0 }}
              exit={{ opacity: 0, scale: 0.95, y: -12 }}
              transition={{ duration: 0.3, ease: [0.22, 1, 0.36, 1] }}
              className="bg-cream rounded-2xl shadow-2xl max-w-md w-full overflow-hidden"
            >
              {/* Progress bar */}
              <div className="flex gap-1.5 px-6 pt-5">
                {TUTORIAL_STEPS.map((_, i) => (
                  <div
                    key={i}
                    className={`h-1 flex-1 rounded-full transition-colors duration-300 ${
                      i <= tutorialStep! ? 'bg-teal' : 'bg-charcoal/10'
                    }`}
                  />
                ))}
              </div>

              <div className="px-6 pt-5 pb-6">
                <div className="text-4xl mb-3">{TUTORIAL_STEPS[tutorialStep!].emoji}</div>
                <h3 className="font-display text-xl font-semibold text-charcoal mb-2">
                  {TUTORIAL_STEPS[tutorialStep!].title}
                </h3>
                <p className="font-body text-sm text-charcoal/60 leading-relaxed mb-6">
                  {TUTORIAL_STEPS[tutorialStep!].body}
                </p>

                {tutorialStep! < TUTORIAL_STEPS.length - 1 ? (
                  <div className="flex items-center justify-between">
                    <button
                      onClick={() => dismissTutorial(false)}
                      className="font-body text-xs text-charcoal/30 hover:text-charcoal/50 transition-colors"
                    >
                      Skip tutorial
                    </button>
                    <div className="flex items-center gap-3">
                      <span className="font-body text-xs text-charcoal/30">
                        {tutorialStep! + 1} / {TUTORIAL_STEPS.length}
                      </span>
                      <button
                        onClick={() => setTutorialStep(tutorialStep! + 1)}
                        className="rounded-lg bg-teal px-5 py-2.5 font-body text-sm font-medium text-white hover:bg-deep-teal transition-colors"
                      >
                        {TUTORIAL_STEPS[tutorialStep!].cta}
                      </button>
                    </div>
                  </div>
                ) : (
                  <div className="flex flex-col gap-2">
                    <button
                      onClick={() => dismissTutorial(false)}
                      className="w-full rounded-lg bg-teal px-5 py-2.5 font-body text-sm font-medium text-white hover:bg-deep-teal transition-colors"
                    >
                      Close
                    </button>
                    <button
                      onClick={() => dismissTutorial(true)}
                      className="w-full rounded-lg bg-charcoal/5 px-5 py-2 font-body text-xs text-charcoal/40 hover:bg-charcoal/10 transition-colors"
                    >
                      Close &amp; don&apos;t show again
                    </button>
                  </div>
                )}
              </div>
            </motion.div>
          </motion.div>
        )}
      </AnimatePresence>

      {/* ── Section 1: Welcome Header ──────────────────────────────── */}
      <motion.div
        initial={{ opacity: 0, y: 12 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.5 }}
        className="mb-12"
      >
        <h1 className="font-hand text-4xl lg:text-5xl text-charcoal mb-2">
          Welcome, Margaret
        </h1>
        <p className="font-body text-charcoal/40 text-sm mb-3">{todayFormatted()}</p>
        <p className="font-body text-charcoal/60 text-base leading-relaxed max-w-2xl">
          This is your ArtByME project dashboard — your central hub for reviewing the platform,
          sharing feedback, and requesting changes. Everything you need is right here.
        </p>
        <div className="mt-4">
          <Link
            href="/admin/orders"
            className="inline-flex items-center gap-2 rounded-lg bg-charcoal/5 px-4 py-2 font-body text-sm text-charcoal/60 hover:bg-charcoal/10 hover:text-charcoal transition-colors"
          >
            <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5}>
              <path strokeLinecap="round" strokeLinejoin="round" d="M3 13.125C3 12.504 3.504 12 4.125 12h2.25c.621 0 1.125.504 1.125 1.125v6.75C7.5 20.496 6.996 21 6.375 21h-2.25A1.125 1.125 0 0 1 3 19.875v-6.75ZM9.75 8.625c0-.621.504-1.125 1.125-1.125h2.25c.621 0 1.125.504 1.125 1.125v11.25c0 .621-.504 1.125-1.125 1.125h-2.25a1.125 1.125 0 0 1-1.125-1.125V8.625ZM16.5 4.125c0-.621.504-1.125 1.125-1.125h2.25C20.496 3 21 3.504 21 4.125v15.75c0 .621-.504 1.125-1.125 1.125h-2.25a1.125 1.125 0 0 1-1.125-1.125V4.125Z" />
            </svg>
            View Analytics Dashboard
          </Link>
        </div>
      </motion.div>

      {/* ── Section 2: Homepage Variants Gallery ───────────────────── */}
      <motion.section
        initial={{ opacity: 0, y: 12 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.5, delay: 0.1 }}
        className="mb-16"
      >
        <SectionHeader
          title="Homepage Designs"
          subtitle="Six unique visions for your homepage. View each one live and share your thoughts."
        />
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-5">
          {HOMEPAGE_VARIANTS.map((v, i) => (
            <motion.div
              key={v.number}
              initial={{ opacity: 0, y: 16 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ duration: 0.4, delay: 0.15 + i * 0.06 }}
              className="group bg-white rounded-xl border border-charcoal/8 overflow-hidden shadow-sm hover:shadow-md transition-shadow"
            >
              {/* Accent bar */}
              <div className={`h-2 ${v.accent}`} />
              <div className="p-5">
                <div className="flex items-baseline gap-2 mb-2">
                  <span className="font-body text-xs font-semibold text-charcoal/30 uppercase tracking-wider">
                    V{v.number}
                  </span>
                  <h3 className="font-display text-lg font-semibold text-charcoal">
                    {v.name}
                  </h3>
                </div>
                <p className="font-body text-sm text-charcoal/50 leading-relaxed mb-5">
                  {v.description}
                </p>
                <div className="flex gap-2">
                  <a
                    href={v.path}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="flex-1 inline-flex items-center justify-center gap-1.5 rounded-lg bg-teal/8 px-3 py-2 font-body text-sm font-medium text-teal hover:bg-teal/15 transition-colors"
                  >
                    <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5}>
                      <path strokeLinecap="round" strokeLinejoin="round" d="M13.5 6H5.25A2.25 2.25 0 0 0 3 8.25v10.5A2.25 2.25 0 0 0 5.25 21h10.5A2.25 2.25 0 0 0 18 18.75V10.5m-10.5 6L21 3m0 0h-5.25M21 3v5.25" />
                    </svg>
                    View Live
                  </a>
                  <button
                    onClick={() => openFeedbackForVariant(v.number)}
                    className="flex-1 inline-flex items-center justify-center gap-1.5 rounded-lg bg-gold/8 px-3 py-2 font-body text-sm font-medium text-gold hover:bg-gold/15 transition-colors"
                  >
                    <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5}>
                      <path strokeLinecap="round" strokeLinejoin="round" d="M7.5 8.25h9m-9 3H12m-9.75 1.51c0 1.6 1.123 2.994 2.707 3.227 1.129.166 2.27.293 3.423.379.35.026.67.21.865.501L12 21l2.755-4.133a1.14 1.14 0 0 1 .865-.501 48.172 48.172 0 0 0 3.423-.379c1.584-.233 2.707-1.626 2.707-3.228V6.741c0-1.602-1.123-2.995-2.707-3.228A48.394 48.394 0 0 0 12 3c-2.392 0-4.744.175-7.043.513C3.373 3.746 2.25 5.14 2.25 6.741v6.018Z" />
                    </svg>
                    Give Feedback
                  </button>
                </div>
              </div>
            </motion.div>
          ))}
        </div>
      </motion.section>

      {/* ── Section 2b: Live Funnels ─────────────────────────────── */}
      {initialFunnels.length > 0 && (
        <motion.section
          initial={{ opacity: 0, y: 12 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.5, delay: 0.12 }}
          className="mb-16"
        >
          <SectionHeader
            title="Your Sales Funnels"
            subtitle={`${initialFunnels.length} funnel${initialFunnels.length !== 1 ? 's' : ''} created. Each is a dedicated landing page for selling a single artwork.`}
          />
          <div className="space-y-3">
            {initialFunnels.map((funnel, i) => {
              const tmpl = TEMPLATE_LABELS[funnel.template] || { label: funnel.template, accent: 'bg-charcoal' }
              return (
                <motion.div
                  key={funnel.id}
                  initial={{ opacity: 0, x: -12 }}
                  animate={{ opacity: 1, x: 0 }}
                  transition={{ duration: 0.3, delay: 0.15 + i * 0.05 }}
                  className="flex items-center gap-4 bg-white rounded-xl border border-charcoal/8 p-4 shadow-sm hover:shadow-md transition-shadow"
                >
                  {/* Template accent */}
                  <div className={`w-1.5 h-12 rounded-full ${tmpl.accent} flex-shrink-0`} />

                  {/* Info */}
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2 mb-0.5">
                      <h3 className="font-display text-base font-semibold text-charcoal truncate">
                        {funnel.product_title}
                      </h3>
                      {funnel.is_published ? (
                        <span className="flex-shrink-0 px-2 py-0.5 bg-teal/10 text-teal text-[10px] font-body font-semibold uppercase tracking-wider rounded-full">
                          Live
                        </span>
                      ) : (
                        <span className="flex-shrink-0 px-2 py-0.5 bg-charcoal/5 text-charcoal/40 text-[10px] font-body font-semibold uppercase tracking-wider rounded-full">
                          Draft
                        </span>
                      )}
                    </div>
                    <div className="flex items-center gap-3 font-body text-xs text-charcoal/40">
                      <span>{tmpl.label} template</span>
                      <span>&middot;</span>
                      <span>/art/{funnel.slug}</span>
                    </div>
                  </div>

                  {/* Stats */}
                  <div className="hidden sm:flex items-center gap-4 text-center flex-shrink-0">
                    <div>
                      <p className="font-body text-sm font-semibold text-charcoal">{funnel.views_count}</p>
                      <p className="font-body text-[10px] text-charcoal/40 uppercase tracking-wider">Views</p>
                    </div>
                    <div>
                      <p className="font-body text-sm font-semibold text-teal">{funnel.add_to_cart_count}</p>
                      <p className="font-body text-[10px] text-charcoal/40 uppercase tracking-wider">Carts</p>
                    </div>
                    <div>
                      <p className="font-body text-sm font-semibold text-gold">{funnel.purchase_count}</p>
                      <p className="font-body text-[10px] text-charcoal/40 uppercase tracking-wider">Sales</p>
                    </div>
                  </div>

                  {/* Actions */}
                  <div className="flex items-center gap-2 flex-shrink-0">
                    {funnel.is_published && (
                      <a
                        href={`/art/${funnel.slug}`}
                        target="_blank"
                        rel="noopener noreferrer"
                        className="inline-flex items-center gap-1 rounded-lg bg-teal/8 px-3 py-2 font-body text-xs font-medium text-teal hover:bg-teal/15 transition-colors"
                      >
                        <svg className="w-3.5 h-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5}>
                          <path strokeLinecap="round" strokeLinejoin="round" d="M13.5 6H5.25A2.25 2.25 0 0 0 3 8.25v10.5A2.25 2.25 0 0 0 5.25 21h10.5A2.25 2.25 0 0 0 18 18.75V10.5m-10.5 6L21 3m0 0h-5.25M21 3v5.25" />
                        </svg>
                        View
                      </a>
                    )}
                    <Link
                      href={`/admin/funnels/${funnel.id}`}
                      className="inline-flex items-center gap-1 rounded-lg bg-charcoal/5 px-3 py-2 font-body text-xs font-medium text-charcoal/60 hover:bg-charcoal/10 transition-colors"
                    >
                      Edit
                    </Link>
                  </div>
                </motion.div>
              )
            })}
          </div>
          <div className="mt-4">
            <Link
              href="/admin/funnels/new"
              className="inline-flex items-center gap-2 rounded-lg bg-gold/10 px-4 py-2.5 font-body text-sm font-medium text-gold hover:bg-gold/20 transition-colors"
            >
              <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                <path strokeLinecap="round" strokeLinejoin="round" d="M12 4v16m8-8H4" />
              </svg>
              Create New Funnel
            </Link>
          </div>
        </motion.section>
      )}

      {/* ── Section 2c: PASTOR Sales Funnels ──────────────────────── */}
      <motion.section
        initial={{ opacity: 0, y: 12 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.5, delay: 0.15 }}
        className="mb-16"
      >
        <SectionHeader
          title="PASTOR Sales Funnels"
          subtitle="Dedicated single-artwork landing pages using the PASTOR copywriting framework. Each funnel tells a complete story from problem to purchase."
        />
        <div className="grid grid-cols-1 lg:grid-cols-3 gap-5 mb-6">
          {[
            {
              name: 'Gallery Spotlight',
              description: 'Cinematic, dark, immersive. Full-screen artwork with dramatic lighting, parallax effects, and Ken Burns hero animation. Best for large, striking pieces.',
              accent: 'bg-charcoal',
              textColor: 'text-charcoal',
            },
            {
              name: 'Intimate Journal',
              description: 'Warm, editorial, journal-like. Feels like reading an artist\'s letter. Torn-paper textures, handwritten accents, generous typography. Best for pieces with rich stories.',
              accent: 'bg-gold',
              textColor: 'text-gold',
            },
            {
              name: 'Bold Showcase',
              description: 'High-energy, vibrant, contemporary. Bold typography, color blocking from the artwork, fast-paced. Best for colorful, dynamic pieces.',
              accent: 'bg-coral',
              textColor: 'text-coral',
            },
          ].map((template, i) => (
            <motion.div
              key={template.name}
              initial={{ opacity: 0, y: 16 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ duration: 0.4, delay: 0.2 + i * 0.06 }}
              className="bg-white rounded-xl border border-charcoal/8 overflow-hidden shadow-sm"
            >
              <div className={`h-2 ${template.accent}`} />
              <div className="p-5">
                <h3 className={`font-display text-lg font-semibold ${template.textColor} mb-2`}>
                  {template.name}
                </h3>
                <p className="font-body text-sm text-charcoal/50 leading-relaxed mb-4">
                  {template.description}
                </p>
                <div className="flex items-center gap-2 text-xs font-body text-charcoal/40">
                  <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5}>
                    <path strokeLinecap="round" strokeLinejoin="round" d="M10.34 15.84c-.688-.06-1.386-.09-2.09-.09H7.5a4.5 4.5 0 1 1 0-9h.75c.704 0 1.402-.03 2.09-.09m0 9.18c.253.962.584 1.892.985 2.783.247.55.06 1.21-.463 1.511l-.657.38c-.551.318-1.26.117-1.527-.461a20.845 20.845 0 0 1-1.44-4.282m3.102.069a18.03 18.03 0 0 1-.59-4.59c0-1.586.205-3.124.59-4.59m0 9.18a23.848 23.848 0 0 1 8.835 2.535M10.34 6.66a23.847 23.847 0 0 0 8.835-2.535m0 0A23.74 23.74 0 0 0 18.795 3m.38 1.125a23.91 23.91 0 0 1 1.014 5.395m-1.014 8.855c-.118.38-.245.754-.38 1.125m.38-1.125a23.91 23.91 0 0 0 1.014-5.395m0-3.46c.495.413.811 1.035.811 1.73 0 .695-.316 1.317-.811 1.73m0-3.46a24.347 24.347 0 0 1 0 3.46" />
                  </svg>
                  PASTOR: Problem → Amplify → Story → Transformation → Offer → Risk Reversal
                </div>
              </div>
            </motion.div>
          ))}
        </div>
        <div className="flex items-center gap-4">
          <Link
            href="/admin/funnels"
            className="inline-flex items-center gap-2 rounded-lg bg-teal px-4 py-2.5 font-body text-sm font-medium text-cream hover:bg-deep-teal transition-colors"
          >
            <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5}>
              <path strokeLinecap="round" strokeLinejoin="round" d="M10.5 6h9.75M10.5 6a1.5 1.5 0 1 1-3 0m3 0a1.5 1.5 0 1 0-3 0M3.75 6H7.5m3 12h9.75m-9.75 0a1.5 1.5 0 0 1-3 0m3 0a1.5 1.5 0 0 0-3 0m-3.75 0H7.5m9-6h3.75m-3.75 0a1.5 1.5 0 0 1-3 0m3 0a1.5 1.5 0 0 0-3 0m-9.75 0h9.75" />
            </svg>
            Manage Funnels
          </Link>
          <Link
            href="/admin/funnels/new"
            className="inline-flex items-center gap-2 rounded-lg bg-gold/10 px-4 py-2.5 font-body text-sm font-medium text-gold hover:bg-gold/20 transition-colors"
          >
            <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
              <path strokeLinecap="round" strokeLinejoin="round" d="M12 4v16m8-8H4" />
            </svg>
            Create New Funnel
          </Link>
        </div>
      </motion.section>

      {/* ── Section 3: Platform Features Built ─────────────────────── */}
      <motion.section
        initial={{ opacity: 0, y: 12 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.5, delay: 0.2 }}
        className="mb-16"
      >
        <SectionHeader
          title="Platform Features Built"
          subtitle="A comprehensive look at everything that has been developed for ArtByME."
        />

        {/* Stats strip */}
        <div className="flex flex-wrap items-center gap-x-6 gap-y-2 mb-6 px-4 py-3 bg-charcoal/[0.03] rounded-lg border border-charcoal/6">
          {[
            { value: '28', label: 'Public Pages' },
            { value: '28', label: 'Admin Pages' },
            { value: '15', label: 'Sales Funnels' },
            { value: '50', label: 'API Routes' },
            { value: '28k+', label: 'Lines of Code' },
          ].map((stat) => (
            <div key={stat.label} className="flex items-baseline gap-1.5">
              <span className="font-display text-lg font-bold text-charcoal">{stat.value}</span>
              <span className="font-body text-xs text-charcoal/40 uppercase tracking-wider">{stat.label}</span>
            </div>
          ))}
        </div>

        <div className="space-y-3">
          {FEATURES_DATA.map((section, idx) => (
            <div
              key={idx}
              className="bg-white rounded-xl border border-charcoal/8 overflow-hidden"
            >
              <button
                onClick={() => setExpandedFeature(expandedFeature === idx ? null : idx)}
                className="w-full flex items-center gap-3 px-5 py-4 text-left hover:bg-charcoal/[0.02] transition-colors"
              >
                <div className="w-9 h-9 rounded-lg bg-gold/10 flex items-center justify-center shrink-0 text-gold">
                  {section.icon}
                </div>
                <span className="font-display text-base font-semibold text-charcoal flex-1">
                  {section.title}
                </span>
                <span className="font-body text-xs text-charcoal/30 mr-2">
                  {section.items.length} features
                </span>
                <motion.svg
                  animate={{ rotate: expandedFeature === idx ? 180 : 0 }}
                  transition={{ duration: 0.2 }}
                  className="w-5 h-5 text-charcoal/30 shrink-0"
                  fill="none"
                  viewBox="0 0 24 24"
                  stroke="currentColor"
                  strokeWidth={1.5}
                >
                  <path strokeLinecap="round" strokeLinejoin="round" d="m19.5 8.25-7.5 7.5-7.5-7.5" />
                </motion.svg>
              </button>
              <AnimatePresence>
                {expandedFeature === idx && (
                  <motion.div
                    initial={{ height: 0, opacity: 0 }}
                    animate={{ height: 'auto', opacity: 1 }}
                    exit={{ height: 0, opacity: 0 }}
                    transition={{ duration: 0.25 }}
                    className="overflow-hidden"
                  >
                    <div className="px-5 pb-4">
                      <ul className="space-y-2 border-t border-charcoal/6 pt-3">
                        {section.items.map((item, j) => (
                          <li key={j} className="flex items-start gap-2.5">
                            <svg className="w-4 h-4 text-teal mt-0.5 shrink-0" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                              <path strokeLinecap="round" strokeLinejoin="round" d="m4.5 12.75 6 6 9-13.5" />
                            </svg>
                            <span className="font-body text-sm text-charcoal/70 leading-relaxed">{item}</span>
                          </li>
                        ))}
                      </ul>
                    </div>
                  </motion.div>
                )}
              </AnimatePresence>
            </div>
          ))}
        </div>
      </motion.section>

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
                                dangerouslySetInnerHTML={{ __html: item.description }}
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
                              <div className="rich-content font-body text-sm text-charcoal/60 leading-relaxed mb-3" dangerouslySetInnerHTML={{ __html: item.description }} />
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
                            dangerouslySetInnerHTML={{ __html: note.content }}
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
