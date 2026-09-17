// Authored by DotWin
// Proof-by-test: the print catalog is readable by a browser and writable by nobody.
//
// These four tables decide which physical product a customer can order and which
// option ids travel to the provider in a paid order. A write path reachable from a
// browser session is therefore too much reach, so there is no INSERT/UPDATE/DELETE
// grant and no write policy for anon or authenticated at all; sync writes as the
// service role and P3's admin toggles will be SECURITY DEFINER RPCs.
//
// Two halves, because each catches what the other cannot:
//
//  - The migration audit is a pure test of the SQL text. It runs everywhere, including
//    on a laptop with no database, and it is what actually fails a pull request that
//    quietly adds a write grant back.
//  - The live denies need a test instance (SUPABASE_TEST_URL / SUPABASE_TEST_ANON_KEY)
//    and PRINT SKIPPED without one. A credential-gated guard that goes quietly green is
//    not a guard.
import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import path from 'node:path';
import { createClient } from '@supabase/supabase-js';

const url = process.env.SUPABASE_TEST_URL;
const anon = process.env.SUPABASE_TEST_ANON_KEY;

const CATALOG_TABLES = [
  'lumaprints_subcategories',
  'lumaprints_option_groups',
  'lumaprints_options',
  'catalog_sync_runs',
] as const;

const MIGRATION = readFileSync(
  path.resolve(process.cwd(), 'supabase/migrations/20260917000100_lumaprints_catalog_v2.sql'),
  'utf8',
);

/** Statements with line comments stripped, so a commented-out grant is not a grant. */
function statements(sql: string): string[] {
  return sql
    .replace(/--[^\n]*/g, '')
    .split(';')
    .map((s) => s.replace(/\s+/g, ' ').trim().toLowerCase())
    .filter(Boolean);
}

describe('the catalog migration grants browser roles no way to write', () => {
  const BROWSER_ROLES = ['anon', 'authenticated'];
  const WRITE_VERBS = ['insert', 'update', 'delete', 'truncate'];

  it('grants anon and authenticated nothing but SELECT on the four tables', () => {
    const offenders: string[] = [];
    for (const statement of statements(MIGRATION)) {
      if (!statement.startsWith('grant ')) continue;
      const [, privileges = '', target = ''] = statement.match(/^grant (.+?) on (.+)$/) ?? [];
      const table = CATALOG_TABLES.find((t) => target.includes(t));
      if (!table) continue;
      const roles = target.split(' to ')[1] ?? '';
      if (!BROWSER_ROLES.some((role) => roles.split(',').map((r) => r.trim()).includes(role))) continue;
      const granted = privileges.split(',').map((p) => p.trim().split(' ')[0]);
      const bad = granted.filter((p) => p === 'all' || WRITE_VERBS.includes(p));
      if (bad.length) offenders.push(`${statement}  ->  ${bad.join(', ')}`);
    }
    expect(offenders).toEqual([]);
  });

  it('gives every table an explicit revoke before any grant', () => {
    for (const table of CATALOG_TABLES) {
      const revoke = statements(MIGRATION).find(
        (s) => s.startsWith('revoke all on') && s.includes(table) && s.includes('anon') && s.includes('authenticated'),
      );
      expect(`${table}: ${revoke ? 'revoked' : 'MISSING'}`).toBe(`${table}: revoked`);
    }
  });

  it('defines no INSERT, UPDATE, DELETE or FOR ALL policy on the four tables', () => {
    const policies = statements(MIGRATION).filter(
      (s) => s.startsWith('create policy') && CATALOG_TABLES.some((t) => s.includes(` on ${t} `)),
    );
    // Every policy on these tables is read-only; `for all` would carry the write side.
    expect(policies.length).toBeGreaterThan(0);
    const writable = policies.filter((s) => / for (insert|update|delete|all)\b/.test(s));
    expect(writable).toEqual([]);
    expect(policies.every((s) => / for select\b/.test(s))).toBe(true);
  });

  it('keeps the public read filtered to rows that are on and still in the provider catalog', () => {
    const publicPolicies = statements(MIGRATION).filter((s) =>
      s.startsWith('create policy "public read enabled'),
    );
    expect(publicPolicies).toHaveLength(3);
    for (const policy of publicPolicies) {
      expect(policy).toContain('enabled = true and removed_from_api = false');
    }
  });

  it('gives the run table staff-only reads and no public policy', () => {
    const runPolicies = statements(MIGRATION).filter(
      (s) => s.startsWith('create policy') && s.includes(' on catalog_sync_runs '),
    );
    expect(runPolicies).toHaveLength(1);
    expect(runPolicies[0]).toContain('to authenticated');
    expect(runPolicies[0]).toContain('is_admin_or_artist()');
  });
});

describe('RLS: the print catalog is not anon-writable', () => {
  for (const table of CATALOG_TABLES) {
    it(`rejects an anonymous insert into ${table}`, async () => {
      if (!url || !anon) {
        console.log(`SKIPPED: ${table} anon-insert deny (SUPABASE_TEST_URL / SUPABASE_TEST_ANON_KEY not set)`);
        return expect(true).toBe(true);
      }
      const supabase = createClient(url, anon);
      // An empty insert names no column, so nothing but the grant/policy layer can
      // produce the failure: a parse or not-null error would prove the wrong thing.
      const { error } = await supabase.from(table).insert({});
      expect(error).not.toBeNull();
    });

    it(`rejects an anonymous update of ${table}`, async () => {
      if (!url || !anon) {
        console.log(`SKIPPED: ${table} anon-update deny (SUPABASE_TEST_URL / SUPABASE_TEST_ANON_KEY not set)`);
        return expect(true).toBe(true);
      }
      const supabase = createClient(url, anon);
      // UPDATE is the verb the grant layer withholds; without the grant this is a
      // permission error whatever the policies say.
      const { error } = await supabase.from(table).update({ enabled: true }).neq('id', '00000000-0000-0000-0000-000000000000');
      expect(error).not.toBeNull();
    });
  }

  it('reports whether the live half of this suite actually ran', () => {
    if (!url || !anon) {
      console.log(
        `SKIPPED: ${CATALOG_TABLES.length * 2} live catalog RLS deny checks (no test instance configured). ` +
          'The migration audit above ran and is not credential-gated.',
      );
    }
    expect(CATALOG_TABLES).toHaveLength(4);
  });
});
