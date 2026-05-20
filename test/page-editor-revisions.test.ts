import { describe, it, expect, vi } from 'vitest'
import { recordRevision, listRevisions, getRevision } from '@/lib/page-editor/revisions'

function makeSupabaseMock(initial: { listResult?: unknown[]; singleResult?: unknown | null; insertError?: unknown } = {}) {
  const insertCalls: unknown[] = []
  const fromCalls: string[] = []
  const builder = {
    insert: vi.fn((payload: unknown) => {
      insertCalls.push(payload)
      return Promise.resolve({ data: null, error: initial.insertError ?? null })
    }),
    select: vi.fn(() => builder),
    eq: vi.fn(() => builder),
    order: vi.fn(() => builder),
    limit: vi.fn(() => Promise.resolve({ data: initial.listResult ?? [], error: null })),
    maybeSingle: vi.fn(() => Promise.resolve({ data: initial.singleResult ?? null, error: null })),
  }
  return {
    from: vi.fn((table: string) => {
      fromCalls.push(table)
      return builder
    }),
    insertCalls,
    fromCalls,
  }
}

describe('revisions', () => {
  it('recordRevision inserts a snapshot row', async () => {
    const mock = makeSupabaseMock()
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    await recordRevision(mock as any, 'about', 'sections', [{ key: 'a' }], 'user-1')
    expect(mock.fromCalls).toContain('page_revisions')
    expect(mock.insertCalls).toHaveLength(1)
    const inserted = mock.insertCalls[0] as Record<string, unknown>
    expect(inserted.page_slug).toBe('about')
    expect(inserted.section_key).toBe('sections')
    expect(inserted.edited_by).toBe('user-1')
  })

  it('recordRevision tolerates null snapshot', async () => {
    const mock = makeSupabaseMock()
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    await recordRevision(mock as any, 'about', 'sections', null, null)
    const inserted = mock.insertCalls[0] as Record<string, unknown>
    expect(inserted.snapshot).toBeNull()
  })

  it('listRevisions returns shaped rows with editor_name flattened', async () => {
    const mock = makeSupabaseMock({
      listResult: [
        {
          id: 'r1',
          page_slug: 'about',
          section_key: 'sections',
          snapshot: { foo: 'bar' },
          edited_by: 'user-1',
          created_at: '2026-05-22T12:00:00Z',
          profiles: { full_name: 'Margaret' },
        },
      ],
    })
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const out = await listRevisions(mock as any, 'about', 'sections', 5)
    expect(out).toHaveLength(1)
    expect(out[0]?.edited_by_name).toBe('Margaret')
    expect(out[0]?.snapshot).toEqual({ foo: 'bar' })
  })

  it('getRevision returns null when not found', async () => {
    const mock = makeSupabaseMock({ singleResult: null })
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const out = await getRevision(mock as any, 'missing-id')
    expect(out).toBeNull()
  })
})
