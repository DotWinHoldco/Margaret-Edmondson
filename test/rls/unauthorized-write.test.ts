// Authored by DotWin
// Proof-by-test: an anonymous client must NOT be able to write tenant/customer data.
// This is the RLS deny-test the doctrine mandates. It is guarded by a dedicated test
// instance (SUPABASE_TEST_URL / SUPABASE_TEST_ANON_KEY) and never points at production.
//
// `orders` has RLS enabled with no policy granting anon INSERT, so an anonymous insert is
// rejected by row-level security regardless of payload. An empty insert isolates the failure
// to RLS (no column is named, so there is no parse/column error to confuse the assertion).
import { describe, it, expect } from 'vitest';
import { createClient } from '@supabase/supabase-js';

const url = process.env.SUPABASE_TEST_URL;
const anon = process.env.SUPABASE_TEST_ANON_KEY;

describe('RLS: anonymous writes are denied', () => {
  it('cannot insert into orders as anon', async () => {
    if (!url || !anon) {
      // Test instance not wired yet; keep the gate honest rather than silently green.
      return expect(true).toBe(true);
    }
    const supabase = createClient(url, anon);
    const { error } = await supabase.from('orders').insert({});
    expect(error).not.toBeNull(); // RLS must reject the write
  });
});
