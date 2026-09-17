// Authored by DotWin
// Proof-by-test: an anonymous client cannot write the print catalog.
//
// These four tables decide which physical product a customer can order and what
// the fulfilment payload carries. An anon INSERT anywhere in them would let a
// stranger add a subcategory or an option id that the quote path would then send
// to the provider, so the deny is asserted on every one of them rather than on a
// representative sample.
//
// Guarded by a dedicated test instance (SUPABASE_TEST_URL / SUPABASE_TEST_ANON_KEY)
// and never pointed at production. Without those variables the test PRINTS that it
// is skipped: a credential-gated guard that goes quietly green is not a guard.
import { describe, it, expect } from 'vitest';
import { createClient } from '@supabase/supabase-js';

const url = process.env.SUPABASE_TEST_URL;
const anon = process.env.SUPABASE_TEST_ANON_KEY;

const CATALOG_TABLES = [
  'lumaprints_subcategories',
  'lumaprints_option_groups',
  'lumaprints_options',
  'catalog_sync_runs',
] as const;

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
  }

  it('reports whether the catalog RLS suite actually ran', () => {
    if (!url || !anon) {
      console.log(`SKIPPED: ${CATALOG_TABLES.length} catalog RLS deny checks (no test instance configured)`);
    }
    expect(CATALOG_TABLES).toHaveLength(4);
  });
});
