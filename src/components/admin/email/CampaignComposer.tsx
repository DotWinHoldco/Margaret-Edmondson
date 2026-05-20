'use client'

import { useCallback, useEffect, useMemo, useState } from 'react'
import { useRouter } from 'next/navigation'
import RichTextEditor from '@/components/admin/RichTextEditor'

interface ContactList {
  id: string
  slug: string
  name: string
  member_count?: number
  is_system?: boolean
}

interface PromoCode {
  id: string
  code: string
  discount_type: 'percentage' | 'fixed' | null
  discount_value: number
  valid_until?: string | null
}

interface CampaignDraft {
  id?: string
  name: string
  subject: string
  preheader: string
  from_name: string
  from_email: string
  content_html: string
  audience_list_id: string | null
  promo_code_id: string | null
  status?: string
  scheduled_at?: string | null
  promo_code?: PromoCode | null
  audience_list?: { id: string; name: string; slug: string } | null
}

interface CampaignComposerProps {
  initial?: Partial<CampaignDraft> & { id?: string }
  mode: 'create' | 'edit'
}

const PLACEHOLDERS: { token: string; label: string }[] = [
  { token: '{{first_name}}', label: 'First name' },
  { token: '{{first_name_or_friend}}', label: 'First name or "friend"' },
  { token: '{{email}}', label: 'Email' },
  { token: '{{discount_code}}', label: 'Discount code' },
  { token: '{{discount_value}}', label: 'Discount value' },
  { token: '{{cart_url}}', label: 'Cart URL' },
  { token: '{{shop_url}}', label: 'Shop URL' },
  { token: '{{site_url}}', label: 'Site URL' },
  { token: '{{unsubscribe_url}}', label: 'Unsubscribe URL' },
]

export default function CampaignComposer({ initial, mode }: CampaignComposerProps) {
  const router = useRouter()

  const [draft, setDraft] = useState<CampaignDraft>({
    id: initial?.id,
    name: initial?.name || '',
    subject: initial?.subject || '',
    preheader: initial?.preheader || '',
    from_name: initial?.from_name || 'Margaret Edmondson',
    from_email: initial?.from_email || 'hello@artbyme.studio',
    content_html: initial?.content_html || '',
    audience_list_id: initial?.audience_list_id || null,
    promo_code_id: initial?.promo_code_id || null,
    status: initial?.status,
    scheduled_at: initial?.scheduled_at || null,
    promo_code: initial?.promo_code || null,
    audience_list: initial?.audience_list || null,
  })

  const [lists, setLists] = useState<ContactList[]>([])
  const [saving, setSaving] = useState(false)
  const [feedback, setFeedback] = useState<string | null>(null)
  const [feedbackKind, setFeedbackKind] = useState<'ok' | 'error'>('ok')
  const [testTo, setTestTo] = useState('')
  const [showSchedule, setShowSchedule] = useState(false)
  const [scheduledAt, setScheduledAt] = useState('')
  const [promoPercent, setPromoPercent] = useState(15)
  const [promoExpires, setPromoExpires] = useState<number | ''>(168)

  useEffect(() => {
    fetch('/api/admin/contact-lists')
      .then((res) => res.json())
      .then((data: { data?: { lists?: ContactList[] } }) => {
        setLists(data?.data?.lists || [])
      })
      .catch(() => { /* noop */ })
  }, [])

  const isReadOnly = useMemo(
    () => draft.status === 'sending' || draft.status === 'sent',
    [draft.status]
  )

  const flash = useCallback((message: string, kind: 'ok' | 'error' = 'ok') => {
    setFeedback(message)
    setFeedbackKind(kind)
    setTimeout(() => setFeedback(null), 4000)
  }, [])

  async function saveDraft(status: 'draft' = 'draft'): Promise<string | null> {
    setSaving(true)
    setFeedback(null)
    try {
      if (draft.id) {
        const res = await fetch(`/api/admin/email-campaigns/${draft.id}`, {
          method: 'PATCH',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            name: draft.name,
            subject: draft.subject,
            preheader: draft.preheader,
            from_name: draft.from_name,
            from_email: draft.from_email,
            content_html: draft.content_html,
            audience_list_id: draft.audience_list_id,
            promo_code_id: draft.promo_code_id,
            status,
          }),
        })
        const data = await res.json()
        if (!res.ok) throw new Error(data.error || 'Save failed')
        flash('Saved')
        return draft.id
      } else {
        const res = await fetch('/api/admin/email-campaigns', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            name: draft.name,
            subject: draft.subject,
            preheader: draft.preheader,
            from_name: draft.from_name,
            from_email: draft.from_email,
            content_html: draft.content_html,
            audience_list_id: draft.audience_list_id,
            promo_code_id: draft.promo_code_id,
          }),
        })
        const data = await res.json()
        if (!res.ok) throw new Error(data.error || 'Save failed')
        const id = data.data?.campaign?.id as string
        setDraft((d) => ({ ...d, id }))
        flash('Saved')
        if (mode === 'create' && id) {
          router.replace(`/admin/email/campaigns/${id}`)
        }
        return id
      }
    } catch (err) {
      const msg = err instanceof Error ? err.message : 'Save failed'
      flash(msg, 'error')
      return null
    } finally {
      setSaving(false)
    }
  }

  async function generatePromo() {
    setSaving(true)
    try {
      const res = await fetch('/api/admin/discount-codes/generate', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          kind: 'campaign',
          percentOff: promoPercent,
          expiresInHours: promoExpires === '' ? null : promoExpires,
          audienceListId: draft.audience_list_id,
          prefix: 'CAMP',
          description: `Campaign code (${draft.name || 'untitled'})`,
        }),
      })
      const data = await res.json()
      if (!res.ok) throw new Error(data.error || 'Code generation failed')
      const code: PromoCode = data.data?.promoCode
      setDraft((d) => ({ ...d, promo_code_id: code.id, promo_code: code }))
      flash(`Generated ${code.code}`)
    } catch (err) {
      flash(err instanceof Error ? err.message : 'Code generation failed', 'error')
    } finally {
      setSaving(false)
    }
  }

  async function sendTest() {
    const id = draft.id || (await saveDraft())
    if (!id) return
    try {
      const res = await fetch(`/api/admin/email-campaigns/${id}/test`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ toEmail: testTo || undefined }),
      })
      const data = await res.json()
      if (!res.ok) throw new Error(data.error || 'Test send failed')
      flash(`Test sent to ${data.data?.to ?? 'you'}`)
    } catch (err) {
      flash(err instanceof Error ? err.message : 'Test failed', 'error')
    }
  }

  async function sendNow() {
    if (!confirm('Send this campaign to the full audience now? This cannot be undone.')) return
    const id = draft.id || (await saveDraft())
    if (!id) return
    try {
      const res = await fetch(`/api/admin/email-campaigns/${id}/send`, { method: 'POST' })
      const data = await res.json()
      if (!res.ok) throw new Error(data.error || 'Send failed')
      flash(`Queued ${data.data?.queued ?? 0} recipients`)
      setDraft((d) => ({ ...d, status: 'sending' }))
    } catch (err) {
      flash(err instanceof Error ? err.message : 'Send failed', 'error')
    }
  }

  async function schedule() {
    if (!scheduledAt) return
    const id = draft.id || (await saveDraft())
    if (!id) return
    try {
      const res = await fetch(`/api/admin/email-campaigns/${id}/schedule`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ scheduledAt: new Date(scheduledAt).toISOString() }),
      })
      const data = await res.json()
      if (!res.ok) throw new Error(data.error || 'Schedule failed')
      flash(`Scheduled for ${new Date(scheduledAt).toLocaleString()}`)
      setDraft((d) => ({ ...d, status: 'scheduled', scheduled_at: new Date(scheduledAt).toISOString() }))
      setShowSchedule(false)
    } catch (err) {
      flash(err instanceof Error ? err.message : 'Schedule failed', 'error')
    }
  }

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex items-start justify-between gap-4">
        <div>
          <h1 className="font-display text-3xl font-light text-charcoal">
            {mode === 'create' ? 'New Campaign' : draft.name || 'Campaign'}
          </h1>
          {draft.status && (
            <p className="mt-1 font-body text-xs uppercase tracking-wider text-charcoal/50">
              Status: <span className="text-teal">{draft.status}</span>
              {draft.scheduled_at && (
                <span className="ml-2 text-charcoal/40">
                  scheduled {new Date(draft.scheduled_at).toLocaleString()}
                </span>
              )}
            </p>
          )}
        </div>
        <div className="flex flex-wrap items-center gap-2">
          <button
            type="button"
            onClick={() => saveDraft()}
            disabled={saving || isReadOnly}
            className="rounded-sm border border-charcoal/15 bg-white px-3 py-1.5 font-body text-xs text-charcoal hover:bg-charcoal/5 disabled:opacity-50"
          >
            {saving ? 'Saving…' : 'Save Draft'}
          </button>
          <button
            type="button"
            onClick={sendTest}
            disabled={saving || !draft.subject}
            className="rounded-sm border border-charcoal/15 bg-white px-3 py-1.5 font-body text-xs text-charcoal hover:bg-charcoal/5 disabled:opacity-50"
          >
            Send Test
          </button>
          <button
            type="button"
            onClick={() => setShowSchedule((s) => !s)}
            disabled={saving || !draft.audience_list_id || isReadOnly}
            className="rounded-sm border border-charcoal/15 bg-white px-3 py-1.5 font-body text-xs text-charcoal hover:bg-charcoal/5 disabled:opacity-50"
          >
            Schedule
          </button>
          <button
            type="button"
            onClick={sendNow}
            disabled={saving || !draft.audience_list_id || isReadOnly}
            className="rounded-sm bg-teal px-4 py-1.5 font-body text-xs font-semibold text-cream hover:bg-teal/90 disabled:opacity-50"
          >
            Send Now
          </button>
        </div>
      </div>

      {feedback && (
        <div className={`rounded-sm border px-3 py-2 font-body text-sm ${feedbackKind === 'ok' ? 'border-teal/30 bg-teal/10 text-teal' : 'border-coral/30 bg-coral/10 text-coral'}`}>
          {feedback}
        </div>
      )}

      <div className="grid grid-cols-1 gap-6 lg:grid-cols-[1fr_320px]">
        {/* Main form */}
        <div className="space-y-4 rounded-sm border border-charcoal/10 bg-white p-5">
          <Field label="Campaign name">
            <input
              type="text"
              value={draft.name}
              onChange={(e) => setDraft({ ...draft, name: e.target.value })}
              disabled={isReadOnly}
              className="w-full rounded-sm border border-charcoal/15 bg-cream/50 px-3 py-2 font-body text-sm text-charcoal focus:border-teal focus:outline-none"
            />
          </Field>
          <Field label="Subject line">
            <input
              type="text"
              value={draft.subject}
              onChange={(e) => setDraft({ ...draft, subject: e.target.value })}
              disabled={isReadOnly}
              className="w-full rounded-sm border border-charcoal/15 bg-cream/50 px-3 py-2 font-body text-sm text-charcoal focus:border-teal focus:outline-none"
            />
          </Field>
          <Field label="Preview text (preheader)">
            <input
              type="text"
              value={draft.preheader}
              onChange={(e) => setDraft({ ...draft, preheader: e.target.value })}
              disabled={isReadOnly}
              className="w-full rounded-sm border border-charcoal/15 bg-cream/50 px-3 py-2 font-body text-sm text-charcoal focus:border-teal focus:outline-none"
            />
          </Field>
          <div className="grid grid-cols-2 gap-3">
            <Field label="From name">
              <input
                type="text"
                value={draft.from_name}
                onChange={(e) => setDraft({ ...draft, from_name: e.target.value })}
                disabled={isReadOnly}
                className="w-full rounded-sm border border-charcoal/15 bg-cream/50 px-3 py-2 font-body text-sm text-charcoal focus:border-teal focus:outline-none"
              />
            </Field>
            <Field label="From email">
              <input
                type="email"
                value={draft.from_email}
                onChange={(e) => setDraft({ ...draft, from_email: e.target.value })}
                disabled={isReadOnly}
                className="w-full rounded-sm border border-charcoal/15 bg-cream/50 px-3 py-2 font-body text-sm text-charcoal focus:border-teal focus:outline-none"
              />
            </Field>
          </div>

          <Field label="Body">
            <RichTextEditor
              content={draft.content_html}
              onChange={(html) => setDraft({ ...draft, content_html: html })}
              minHeight="280px"
              placeholder="Write the email body. Use the placeholder tokens on the right to personalize."
            />
          </Field>
        </div>

        {/* Sidebar */}
        <div className="space-y-4">
          <div className="rounded-sm border border-charcoal/10 bg-white p-4">
            <h3 className="mb-2 font-body text-xs font-semibold uppercase tracking-wider text-charcoal/50">Audience</h3>
            <select
              value={draft.audience_list_id || ''}
              onChange={(e) => setDraft({ ...draft, audience_list_id: e.target.value || null })}
              disabled={isReadOnly}
              className="w-full rounded-sm border border-charcoal/15 bg-cream/50 px-3 py-2 font-body text-sm text-charcoal focus:border-teal focus:outline-none"
            >
              <option value="">Select a list…</option>
              {lists.map((l) => (
                <option key={l.id} value={l.id}>
                  {l.name} ({l.member_count ?? 0})
                </option>
              ))}
            </select>
          </div>

          <div className="rounded-sm border border-charcoal/10 bg-white p-4">
            <h3 className="mb-2 font-body text-xs font-semibold uppercase tracking-wider text-charcoal/50">Discount code</h3>
            {draft.promo_code ? (
              <div>
                <p className="font-mono text-base tracking-widest text-teal">{draft.promo_code.code}</p>
                <p className="mt-1 font-body text-xs text-charcoal/50">
                  {draft.promo_code.discount_type === 'percentage'
                    ? `${draft.promo_code.discount_value}% off`
                    : `$${draft.promo_code.discount_value} off`}
                  {draft.promo_code.valid_until
                    ? ` · expires ${new Date(draft.promo_code.valid_until).toLocaleString()}`
                    : ''}
                </p>
                <button
                  type="button"
                  onClick={() => setDraft({ ...draft, promo_code_id: null, promo_code: null })}
                  disabled={isReadOnly}
                  className="mt-2 rounded-sm border border-charcoal/15 bg-white px-2 py-1 font-body text-xs text-charcoal/50 hover:text-charcoal"
                >
                  Remove
                </button>
              </div>
            ) : (
              <div className="space-y-2">
                <div className="grid grid-cols-2 gap-2">
                  <label className="font-body text-xs text-charcoal/60">
                    Percent off
                    <input
                      type="number"
                      min={1}
                      max={100}
                      value={promoPercent}
                      onChange={(e) => setPromoPercent(Number(e.target.value))}
                      className="mt-1 w-full rounded-sm border border-charcoal/15 bg-cream/50 px-2 py-1.5 font-body text-sm text-charcoal focus:border-teal focus:outline-none"
                    />
                  </label>
                  <label className="font-body text-xs text-charcoal/60">
                    Expires (hrs)
                    <input
                      type="number"
                      min={1}
                      value={promoExpires}
                      onChange={(e) => setPromoExpires(e.target.value === '' ? '' : Number(e.target.value))}
                      className="mt-1 w-full rounded-sm border border-charcoal/15 bg-cream/50 px-2 py-1.5 font-body text-sm text-charcoal focus:border-teal focus:outline-none"
                    />
                  </label>
                </div>
                <button
                  type="button"
                  onClick={generatePromo}
                  disabled={saving || isReadOnly}
                  className="w-full rounded-sm bg-teal/10 px-3 py-2 font-body text-sm font-medium text-teal hover:bg-teal/15"
                >
                  Generate code
                </button>
              </div>
            )}
          </div>

          <div className="rounded-sm border border-charcoal/10 bg-white p-4">
            <h3 className="mb-2 font-body text-xs font-semibold uppercase tracking-wider text-charcoal/50">Placeholders</h3>
            <p className="mb-2 font-body text-xs text-charcoal/50">
              Click to copy, then paste in subject, preheader, or body.
            </p>
            <ul className="space-y-1.5">
              {PLACEHOLDERS.map((p) => (
                <li key={p.token} className="flex items-center justify-between gap-2">
                  <code className="font-mono text-xs text-teal">{p.token}</code>
                  <button
                    type="button"
                    onClick={() => navigator.clipboard?.writeText(p.token)}
                    className="rounded-sm bg-charcoal/5 px-2 py-0.5 font-body text-[10px] uppercase tracking-wider text-charcoal/60 hover:bg-charcoal/10"
                  >
                    Copy
                  </button>
                </li>
              ))}
            </ul>
          </div>

          <div className="rounded-sm border border-charcoal/10 bg-white p-4">
            <h3 className="mb-2 font-body text-xs font-semibold uppercase tracking-wider text-charcoal/50">Send test</h3>
            <input
              type="email"
              value={testTo}
              onChange={(e) => setTestTo(e.target.value)}
              placeholder="leave blank to use your admin email"
              className="w-full rounded-sm border border-charcoal/15 bg-cream/50 px-3 py-2 font-body text-sm text-charcoal focus:border-teal focus:outline-none"
            />
          </div>

          {showSchedule && (
            <div className="rounded-sm border border-gold/40 bg-gold/5 p-4">
              <h3 className="mb-2 font-body text-xs font-semibold uppercase tracking-wider text-charcoal/50">Schedule</h3>
              <input
                type="datetime-local"
                value={scheduledAt}
                onChange={(e) => setScheduledAt(e.target.value)}
                className="w-full rounded-sm border border-charcoal/15 bg-white px-3 py-2 font-body text-sm text-charcoal focus:border-teal focus:outline-none"
              />
              <button
                type="button"
                onClick={schedule}
                disabled={!scheduledAt}
                className="mt-2 w-full rounded-sm bg-charcoal px-3 py-2 font-body text-sm font-medium text-cream hover:bg-charcoal/90 disabled:opacity-50"
              >
                Confirm Schedule
              </button>
            </div>
          )}
        </div>
      </div>
    </div>
  )
}

function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <label className="block">
      <span className="mb-1 block font-body text-xs font-semibold uppercase tracking-wider text-charcoal/50">
        {label}
      </span>
      {children}
    </label>
  )
}
