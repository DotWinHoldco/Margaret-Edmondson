// Authored by DotWin. Guard the SQLSTATE 42702 upsert/output-variable failure pattern.
// This is a targeted source check, backed by executable PostgreSQL checkout tests.
import { readFileSync, readdirSync } from 'node:fs'
import { expect, it } from 'vitest'

function collisions(sql: string) {
  const header = sql.slice(0, sql.search(/\bas\s+\$/i))
  const parameters = [...header.matchAll(/(?:\(|,)\s*(?:inout\s+|out\s+|in\s+)?([a-z_]\w*)\s+(?:[a-z_]\w*(?:\.[a-z_]\w*)?)/gi)].map(m => m[1].toLowerCase())
  const body = sql.replace(/--[^\n]*/g, '').replace(/\/\*[\s\S]*?\*\//g, '')
  const declarations = body.match(/\bdeclare\b([\s\S]*?)\bbegin\b/i)?.[1] ?? ''
  const locals = [...declarations.matchAll(/(?:^|;)\s*(\w+)\s+(?:constant\s+)?[a-z_][\w.%(]/gim)].map(m => m[1].toLowerCase())
  const variables = new Set([...parameters, ...locals])
  return [...body.matchAll(/\bon\s+conflict\s*\(([^)]*)\)/gi)]
    .flatMap(m => m[1].split(',').map(c => c.trim().toLowerCase()).filter(c => variables.has(c)))
}

it('detects ambiguous output parameters and local variables in upsert targets', () => {
  expect(collisions('create function f() returns table(variant_id uuid,ok boolean) language plpgsql as $$begin insert into h values(1) on conflict(payment_ref,variant_id) do nothing;end$$;')).toEqual(['variant_id'])
  expect(collisions('create function f() returns void language plpgsql as $$declare code text;begin insert into h values(1) on conflict(code) do nothing;end$$;')).toEqual(['code'])
  expect(collisions('create function f() returns table(variant_id uuid) language plpgsql as $$begin insert into h values(1) on conflict on constraint h_key do nothing;end$$;')).toEqual([])
})

it('keeps active migration definitions free of ambiguous upsert targets', () => {
  const active = new Map<string, { sql: string; file: string }>()
  for (const file of readdirSync('supabase/migrations').filter(f => f.endsWith('.sql')).sort()) {
    const sql = readFileSync(`supabase/migrations/${file}`, 'utf8').replace(/--[^\n]*/g, '')
    for (const m of sql.matchAll(/create\s+(?:or\s+replace\s+)?function\s+((?:[a-z_]\w*\.)?[a-z_]\w*)\s*\(([^]*?)\)\s*returns[^]*?\bas\s+(\$[a-z_]*\$)[^]*?\3\s*;/gi)) {
      // Include the full argument declaration so overloads are audited independently.
      const key = m[1].toLowerCase().replace(/^public\./, '') + '(' + m[2].replace(/\s+/g, ' ').trim().toLowerCase() + ')'
      active.set(key, { sql: m[0], file })
    }
  }
  expect(active.size).toBeGreaterThan(0)
  const failures = [...active.entries()].flatMap(([name, f]) => collisions(f.sql).map(column => `${f.file}: ${name}: ${column}`))
  expect(failures).toEqual([])
})
