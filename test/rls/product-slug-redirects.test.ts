// Authored by DotWin
// Proof-by-test: old product slugs are readable by anyone and writable by nobody from a
// browser. The migration text is audited everywhere; the live denies run against the test
// instance and PRINT SKIPPED without one (a credential-gated guard that goes quietly green
// is not a guard).

import { describe, it, expect } from 'vitest'
import { readFileSync } from 'node:fs'
import path from 'node:path'
import { createClient } from '@supabase/supabase-js'

const url = process.env.SUPABASE_TEST_URL
const anon = process.env.SUPABASE_TEST_ANON_KEY

const MIGRATION = readFileSync(
  path.resolve(process.cwd(), 'supabase/migrations/20260917130000_product_slug_redirects.sql'),
  'utf8',
)

/** Statements with line comments stripped, so a commented-out grant is not a grant. */
function statements(sql: string): string[] {
  return sql
    .replace(/--[^\n]*/g, '')
    .split(';')
    .map((s) => s.replace(/\s+/g, ' ').trim().toLowerCase())
    .filter(Boolean)
}

describe('the product_slug_redirects migration', () => {
  const BROWSER_ROLES = ['anon', 'authenticated']
  const WRITE_VERBS = ['insert', 'update', 'delete', 'truncate', 'all']

  it('grants browser roles SELECT and nothing else', () => {
    const grants = statements(MIGRATION).filter(
      (s) => s.startsWith('grant ') && s.includes('product_slug_redirects') && BROWSER_ROLES.some((r) => s.includes(r)),
    )
    expect(grants).toHaveLength(1)
    const [, privileges = ''] = grants[0].match(/^grant (.+?) on /) ?? []
    for (const verb of WRITE_VERBS) expect(privileges.split(',').map((p) => p.trim())).not.toContain(verb)
    expect(privileges.trim()).toBe('select')
    expect(statements(MIGRATION)).toContain('revoke all on public.product_slug_redirects from anon, authenticated')
  })

  it('enables RLS with a SELECT-only policy and no write policy', () => {
    const all = statements(MIGRATION)
    expect(all).toContain('alter table public.product_slug_redirects enable row level security')
    const policies = all.filter((s) => s.startsWith('create policy') && s.includes('product_slug_redirects'))
    expect(policies).toHaveLength(1)
    expect(policies[0]).toContain('for select')
  })

  it('writes only through a SECURITY DEFINER trigger with a pinned search_path that browser roles cannot call', () => {
    const fn = statements(MIGRATION).find((s) => s.startsWith('create or replace function public.record_product_slug_redirect'))
    expect(fn).toBeDefined()
    expect(fn).toContain('security definer')
    expect(fn).toContain('set search_path = public')
    expect(statements(MIGRATION)).toContain(
      'revoke all on function public.record_product_slug_redirect() from public, anon, authenticated',
    )
    expect(statements(MIGRATION).some((s) => s.startsWith('create trigger product_slug_redirect after update of slug on public.products'))).toBe(true)
  })
})

describe('RLS (live): product_slug_redirects', () => {
  const skip = !url || !anon
  it(skip ? 'SKIPPED — SUPABASE_TEST_URL / SUPABASE_TEST_ANON_KEY not set' : 'anon can read but cannot write', async () => {
    if (skip) {
      console.warn('[rls] product_slug_redirects live check SKIPPED: no test instance credentials')
      return
    }
    const supabase = createClient(url!, anon!)
    const read = await supabase.from('product_slug_redirects').select('old_slug').limit(1)
    expect(read.error).toBeNull()
    const write = await supabase
      .from('product_slug_redirects')
      .insert({ old_slug: 'rls-probe', product_id: '00000000-0000-4000-8000-000000000000' })
    expect(write.error).not.toBeNull()
  })
})
