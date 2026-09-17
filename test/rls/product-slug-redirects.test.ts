// Authored by DotWin
// Proof-by-test: old product slugs are readable by anyone WHILE the product is sellable,
// and writable by nobody from a browser. The migration text is audited everywhere; the
// live denies run against the test instance and PRINT SKIPPED without one (a
// credential-gated guard that goes quietly green is not a guard).

import { describe, it, expect } from 'vitest'
import { readFileSync } from 'node:fs'
import path from 'node:path'
import { createClient } from '@supabase/supabase-js'

const url = process.env.SUPABASE_TEST_URL
const anon = process.env.SUPABASE_TEST_ANON_KEY

const read = (name: string) => readFileSync(path.resolve(process.cwd(), 'supabase/migrations', name), 'utf8')
const BASE = read('20260917130000_product_slug_redirects.sql')
const HARDENING = read('20260917140000_product_slug_redirects_hardening.sql')

/** Statements with line comments stripped, so a commented-out grant is not a grant. */
function statements(sql: string): string[] {
  return sql
    .replace(/--[^\n]*/g, '')
    .split(';')
    .map((s) => s.replace(/\s+/g, ' ').trim().toLowerCase())
    .filter(Boolean)
}

describe('the product_slug_redirects migrations', () => {
  const BROWSER_ROLES = ['anon', 'authenticated']
  const WRITE_VERBS = ['insert', 'update', 'delete', 'truncate', 'all']

  it('grant browser roles SELECT and nothing else', () => {
    const grants = [...statements(BASE), ...statements(HARDENING)].filter(
      (s) => s.startsWith('grant ') && s.includes('product_slug_redirects') && BROWSER_ROLES.some((r) => s.includes(r)),
    )
    expect(grants).toHaveLength(1)
    const [, privileges = ''] = grants[0].match(/^grant (.+?) on /) ?? []
    for (const verb of WRITE_VERBS) expect(privileges.split(',').map((p) => p.trim())).not.toContain(verb)
    expect(privileges.trim()).toBe('select')
    expect(statements(BASE)).toContain('revoke all on public.product_slug_redirects from anon, authenticated')
  })

  it('enable RLS, and the policy that survives reads only redirects of sellable products', () => {
    expect(statements(BASE)).toContain('alter table public.product_slug_redirects enable row level security')
    // The first policy read every row; the hardening drops it by name and replaces it.
    expect(statements(HARDENING)).toContain(
      'drop policy if exists "anyone can read product_slug_redirects" on public.product_slug_redirects',
    )
    const policies = statements(HARDENING).filter((s) => s.startsWith('create policy') && s.includes('product_slug_redirects'))
    expect(policies).toHaveLength(1)
    expect(policies[0]).toContain('for select')
    expect(policies[0]).not.toContain('using (true)')
    expect(policies[0]).toContain("p.status in ('active', 'sold')")
    expect(policies[0]).toContain('p.id = product_slug_redirects.product_id')
    // No write policy in either migration.
    expect([...statements(BASE), ...statements(HARDENING)].filter((s) => s.startsWith('create policy') && /for (insert|update|delete|all)/.test(s))).toEqual([])
  })

  it('write only through a SECURITY DEFINER trigger with the house search_path pin that browser roles cannot call', () => {
    const fn = statements(HARDENING).find((s) => s.startsWith('create or replace function public.record_product_slug_redirect'))
    expect(fn).toBeDefined()
    expect(fn).toContain('security definer')
    expect(fn).toContain("set search_path = ''")
    // Every relation inside the body is schema-qualified, which an empty search_path requires
    // (the body spans several statements, so the whole text is checked, not one fragment).
    const body = HARDENING.replace(/--[^\n]*/g, '').replace(/\s+/g, ' ').toLowerCase()
    expect(body).toContain('insert into public.product_slug_redirects')
    expect(body).toContain('delete from public.product_slug_redirects')
    expect(body).not.toMatch(/(insert into|delete from|update) product_slug_redirects/)
    expect(statements(HARDENING)).toContain(
      'revoke all on function public.record_product_slug_redirect() from public, anon, authenticated',
    )
    expect(statements(BASE).some((s) => s.startsWith('create trigger product_slug_redirect after update of slug on public.products'))).toBe(true)
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
