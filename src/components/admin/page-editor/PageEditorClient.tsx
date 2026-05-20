'use client'

import { useCallback, useEffect, useMemo, useState } from 'react'
import { useSearchParams } from 'next/navigation'
import { pageSchemas, getSchema } from '@/lib/page-editor/schemas'
import type { FieldSchema, PageSchema, SectionSchema } from '@/lib/page-editor/types'
import FieldRenderer from './FieldRenderer'
import SortableList from './SortableList'
import PagePicker from './PagePicker'
import RevisionMenu from './RevisionMenu'
import LivePreview from './LivePreview'

interface SectionState {
  original: unknown
  draft: unknown
  saving: boolean
  error: string | null
  saveToken: number
}

export default function PageEditorClient() {
  const searchParams = useSearchParams()
  const slugFromUrl = searchParams.get('slug') || 'about'
  const schema = useMemo<PageSchema>(() => getSchema(slugFromUrl) ?? pageSchemas[0]!, [slugFromUrl])

  const [loading, setLoading] = useState(true)
  const [loadError, setLoadError] = useState<string | null>(null)
  const [sections, setSections] = useState<Record<string, SectionState>>({})
  const [activeTab, setActiveTab] = useState<string>(schema.sections[0]?.key ?? '')
  const [showPreview, setShowPreview] = useState(true)
  const [previewToken, setPreviewToken] = useState(0)

  const load = useCallback(async () => {
    setLoading(true)
    setLoadError(null)
    try {
      if (schema.category === 'external') {
        setSections({})
        return
      }
      const res = await fetch(`/api/admin/pages/${schema.slug}/editor`)
      const data = await res.json()
      if (!res.ok) throw new Error(data?.error || 'Failed to load')
      const raw = (data?.data?.sections || {}) as Record<string, unknown>
      const next: Record<string, SectionState> = {}
      for (const section of schema.sections) {
        const value = raw[section.key] ?? defaultValueForSection(section)
        next[section.key] = {
          original: value,
          draft: cloneDeep(value),
          saving: false,
          error: null,
          saveToken: 0,
        }
      }
      setSections(next)
      setActiveTab(schema.sections[0]?.key ?? '')
    } catch (err) {
      setLoadError(err instanceof Error ? err.message : 'Failed to load')
    } finally {
      setLoading(false)
    }
  }, [schema])

  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect -- loads page data on slug change
    load()
  }, [load])

  function updateSectionDraft(key: string, draft: unknown) {
    setSections((s) => ({ ...s, [key]: { ...s[key]!, draft, error: null } }))
  }

  async function saveSection(key: string) {
    const state = sections[key]
    if (!state) return
    setSections((s) => ({ ...s, [key]: { ...s[key]!, saving: true, error: null } }))
    try {
      const res = await fetch(`/api/admin/pages/${schema.slug}/editor/${key}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ value: state.draft }),
      })
      const data = await res.json()
      if (!res.ok) throw new Error(data?.error || 'Save failed')
      const next = data?.data?.value
      setSections((s) => ({
        ...s,
        [key]: {
          ...s[key]!,
          saving: false,
          error: null,
          original: next,
          draft: cloneDeep(next),
          saveToken: s[key]!.saveToken + 1,
        },
      }))
      setPreviewToken((t) => t + 1)
    } catch (err) {
      setSections((s) => ({
        ...s,
        [key]: { ...s[key]!, saving: false, error: err instanceof Error ? err.message : 'Save failed' },
      }))
    }
  }

  function resetSection(key: string) {
    setSections((s) => ({
      ...s,
      [key]: { ...s[key]!, draft: cloneDeep(s[key]!.original), error: null },
    }))
  }

  if (schema.category === 'external') {
    // External entries are handled by PagePicker navigation; nothing to render here.
    return (
      <div className="space-y-6">
        <PagePicker schemas={pageSchemas} currentSlug={schema.slug} />
        <p className="font-body text-sm text-charcoal/55">
          {schema.title} lives in its own catalog. Use the picker above to return.
        </p>
      </div>
    )
  }

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <PagePicker schemas={pageSchemas} currentSlug={schema.slug} />
        <div className="flex items-center gap-2">
          {schema.previewPath && (
            <button
              type="button"
              onClick={() => setShowPreview((v) => !v)}
              className="inline-flex items-center gap-1.5 rounded-sm border border-charcoal/15 bg-white px-3 py-1.5 font-body text-xs text-charcoal/70 hover:bg-charcoal/5"
            >
              {showPreview ? 'Hide preview' : 'Show preview'}
            </button>
          )}
          {schema.previewPath && (
            <a
              href={schema.previewPath}
              target="_blank"
              rel="noopener noreferrer"
              className="inline-flex items-center gap-1.5 rounded-sm border border-charcoal/15 bg-white px-3 py-1.5 font-body text-xs text-charcoal/70 hover:bg-charcoal/5"
            >
              Open public page
              <svg className="h-3 w-3" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2}>
                <path strokeLinecap="round" strokeLinejoin="round" d="M14 5l7 7-7 7M3 12h18" />
              </svg>
            </a>
          )}
        </div>
      </div>

      {loading ? (
        <div className="rounded-sm border border-charcoal/10 bg-white px-4 py-16 text-center font-body text-sm text-charcoal/45">
          Loading…
        </div>
      ) : loadError ? (
        <div className="rounded-sm border border-coral/30 bg-coral/5 px-4 py-6 font-body text-sm text-coral">
          {loadError}
        </div>
      ) : (
      <div className={`grid gap-4 ${showPreview && schema.previewPath ? 'lg:grid-cols-[minmax(0,3fr)_minmax(0,2fr)]' : ''}`}>
        <div className="rounded-sm border border-charcoal/10 bg-white">
          {/* Tabs */}
          <div className="flex flex-wrap gap-1 border-b border-charcoal/10 bg-charcoal/[0.02] p-1">
            {schema.sections.map((s) => {
              const dirty = sections[s.key] && !deepEqual(sections[s.key]!.original, sections[s.key]!.draft)
              return (
                <button
                  key={s.key}
                  type="button"
                  onClick={() => setActiveTab(s.key)}
                  className={`relative rounded-sm px-3 py-1.5 font-body text-sm font-medium transition-colors ${
                    activeTab === s.key ? 'bg-white text-charcoal shadow-sm' : 'text-charcoal/55 hover:text-charcoal'
                  }`}
                >
                  {s.label}
                  {dirty && (
                    <span className="ml-1.5 inline-block h-1.5 w-1.5 rounded-full bg-gold align-middle" />
                  )}
                </button>
              )
            })}
          </div>

          {schema.sections.map((section) => {
            if (section.key !== activeTab) return null
            const state = sections[section.key]
            if (!state) return null
            const dirty = !deepEqual(state.original, state.draft)
            const isListRoot = isRootList(section)
            return (
              <div key={section.key} className="space-y-6 p-5">
                <div className="flex items-start justify-between gap-3">
                  <div>
                    {section.description && (
                      <p className="font-body text-sm text-charcoal/55">{section.description}</p>
                    )}
                  </div>
                  <RevisionMenu
                    slug={schema.slug}
                    sectionKey={section.key}
                    cacheToken={state.saveToken}
                    onReverted={() => {
                      load()
                      setPreviewToken((t) => t + 1)
                    }}
                  />
                </div>

                {isListRoot ? (
                  <SortableList
                    field={section.fields[0] as Extract<FieldSchema, { kind: 'sortable-list' }>}
                    value={state.draft as Array<Record<string, unknown>>}
                    onChange={(next) => updateSectionDraft(section.key, next)}
                  />
                ) : (
                  <div className="space-y-5">
                    {section.fields.map((f, i) => (
                      <FieldRenderer
                        key={`${('key' in f ? f.key : 'group')}-${i}`}
                        field={f}
                        parent={(state.draft as Record<string, unknown>) ?? {}}
                        onChange={(next) => updateSectionDraft(section.key, next)}
                      />
                    ))}
                  </div>
                )}

                <div className="flex items-center justify-between gap-3 border-t border-charcoal/10 pt-4">
                  <div className="font-body text-xs text-charcoal/50">
                    {state.error ? (
                      <span className="text-coral">{state.error}</span>
                    ) : state.saving ? (
                      'Saving…'
                    ) : dirty ? (
                      'Unsaved changes'
                    ) : (
                      'All changes saved'
                    )}
                  </div>
                  <div className="flex items-center gap-2">
                    {dirty && (
                      <button
                        type="button"
                        onClick={() => resetSection(section.key)}
                        disabled={state.saving}
                        className="rounded-sm px-3 py-1.5 font-body text-xs text-charcoal/55 hover:text-charcoal disabled:opacity-50"
                      >
                        Discard
                      </button>
                    )}
                    <button
                      type="button"
                      onClick={() => saveSection(section.key)}
                      disabled={!dirty || state.saving}
                      className="rounded-sm bg-teal px-4 py-1.5 font-body text-sm font-medium text-cream transition-colors hover:bg-deep-teal disabled:opacity-50"
                    >
                      {state.saving ? 'Saving…' : 'Save section'}
                    </button>
                  </div>
                </div>
              </div>
            )
          })}
        </div>
        {showPreview && schema.previewPath && (
          <div className="hidden lg:block lg:sticky lg:top-4 lg:self-start lg:h-[calc(100vh-7rem)]">
            <LivePreview src={schema.previewPath} refreshToken={previewToken} />
          </div>
        )}
      </div>
      )}
    </div>
  )
}

// ─── helpers ────────────────────────────────────────────────────────

function isRootList(section: SectionSchema): boolean {
  if (section.fields.length !== 1) return false
  const f = section.fields[0]!
  return f.kind === 'sortable-list' && f.key === ''
}

function defaultValueForSection(section: SectionSchema): unknown {
  if (isRootList(section)) return []
  return {}
}

function cloneDeep<T>(v: T): T {
  if (v == null || typeof v !== 'object') return v
  if (typeof structuredClone === 'function') return structuredClone(v)
  return JSON.parse(JSON.stringify(v))
}

function deepEqual(a: unknown, b: unknown): boolean {
  if (a === b) return true
  if (a == null || b == null) return false
  if (typeof a !== 'object' || typeof b !== 'object') return false
  try {
    return JSON.stringify(a) === JSON.stringify(b)
  } catch {
    return false
  }
}
