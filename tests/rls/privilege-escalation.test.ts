// Authored by DotWin
// Proof-by-test: a real authenticated user must NOT be able to raise their own privileges.
//
// The grant-boundary gate (scripts/check-grant-boundary.mjs) reads the catalog: it knows a
// BEFORE UPDATE trigger exists and mentions the column. It cannot know the trigger actually
// raises. This test closes that gap by performing the escalation as a genuine signed-in
// client and asserting Postgres rejects it.
//
// It FAILS CLOSED. Missing env is a test failure, not a silent pass. Only SQLSTATE 42501
// (insufficient_privilege) or 42501-equivalent PostgREST rejection counts as a pass. A
// write that SUCCEEDS is the defect this whole standard exists to prevent, and the test
// reverts nothing: if it succeeds, the row is left changed and the failure is loud.
//
// Config (process env or .env.local):
//   NEXT_PUBLIC_SUPABASE_URL
//   NEXT_PUBLIC_SUPABASE_ANON_KEY
//   PRIVESC_TEST_EMAIL / PRIVESC_TEST_PASSWORD   a low-privilege account that owns its row
//   PRIVESC_TARGETS  comma-separated "table:column=value" probes to attempt as that user.
//                    Example: "users:is_super_admin=true,users:role=admin,profiles:role=admin"
import fs from 'node:fs';
import path from 'node:path';
import { describe, it, expect, beforeAll } from 'vitest';
import { createClient, type SupabaseClient } from '@supabase/supabase-js';

function loadEnvFile(name: string): Record<string, string> {
  const file = path.join(process.cwd(), name);
  const out: Record<string, string> = {};
  if (!fs.existsSync(file)) return out;
  for (const raw of fs.readFileSync(file, 'utf8').split(/\r?\n/)) {
    const line = raw.trim();
    if (!line || line.startsWith('#')) continue;
    const eq = line.indexOf('=');
    if (eq <= 0) continue;
    let val = line.slice(eq + 1).trim();
    if ((val.startsWith('"') && val.endsWith('"')) || (val.startsWith("'") && val.endsWith("'"))) val = val.slice(1, -1);
    out[line.slice(0, eq).trim()] = val;
  }
  return out;
}

const fileEnv = { ...loadEnvFile('.env'), ...loadEnvFile('.env.local') };
const env = (k: string): string | undefined => process.env[k] ?? fileEnv[k];

const url = env('NEXT_PUBLIC_SUPABASE_URL');
const anon = env('NEXT_PUBLIC_SUPABASE_ANON_KEY');
const email = env('PRIVESC_TEST_EMAIL');
const password = env('PRIVESC_TEST_PASSWORD');
const targets = (env('PRIVESC_TARGETS') || '').split(',').map((s) => s.trim()).filter(Boolean);

// PostgREST surfaces 42501 when RLS or a guard trigger raises insufficient_privilege.
// A guard that raises a bare EXCEPTION without ERRCODE surfaces P0001; that is still a
// rejection, so both are accepted, but 42501 is the shape the standard asks for.
const REJECTED = new Set(['42501', 'P0001']);

function parseTarget(t: string): { table: string; column: string; value: unknown } {
  const m = t.match(/^([a-z0-9_]+):([a-z0-9_]+)=(.*)$/i);
  if (!m) throw new Error(`PRIVESC_TARGETS entry "${t}" must look like "table:column=value"`);
  const raw = m[3];
  let value: unknown = raw;
  if (raw === 'true') value = true;
  else if (raw === 'false') value = false;
  else if (/^-?\d+$/.test(raw)) value = Number(raw);
  return { table: m[1], column: m[2], value };
}

describe('privilege escalation is rejected for a signed-in user', () => {
  let client: SupabaseClient;
  let uid: string;

  beforeAll(async () => {
    const missing = [
      !url && 'NEXT_PUBLIC_SUPABASE_URL',
      !anon && 'NEXT_PUBLIC_SUPABASE_ANON_KEY',
      !email && 'PRIVESC_TEST_EMAIL',
      !password && 'PRIVESC_TEST_PASSWORD',
      !targets.length && 'PRIVESC_TARGETS',
    ].filter(Boolean);
    if (missing.length) {
      throw new Error(
        `privilege-escalation deny-test is not configured: missing ${missing.join(', ')}. ` +
        'This is a failure, not a skip: an unproven guard is an unguarded column.',
      );
    }
    client = createClient(url!, anon!, { auth: { persistSession: false, autoRefreshToken: false } });
    const { data, error } = await client.auth.signInWithPassword({ email: email!, password: password! });
    if (error || !data.user) throw new Error(`could not sign in as PRIVESC_TEST_EMAIL: ${error?.message ?? 'no user'}`);
    uid = data.user.id;
  });

  it('the test account is not already privileged', async () => {
    // A test account that is already an admin would make every probe below vacuous.
    const { data } = await client.from('users').select('*').eq('id', uid).maybeSingle();
    if (data) {
      for (const k of ['is_super_admin', 'is_admin', 'is_staff']) {
        if (k in (data as Record<string, unknown>)) expect((data as Record<string, unknown>)[k]).toBeFalsy();
      }
    }
  });

  for (const t of targets) {
    const { table, column, value } = parseTarget(t);
    it(`rejects ${table}.${column} = ${String(value)} on the caller's own row`, async () => {
      const { error } = await client
        .from(table)
        .update({ [column]: value } as Record<string, unknown>)
        .eq('id', uid)
        .select();

      expect(error, `${table}.${column} was writable by a signed-in user: this is a privilege escalation`).not.toBeNull();
      expect(REJECTED.has(String(error!.code)), `expected a rejection (42501), got ${error!.code}: ${error!.message}`).toBe(true);
    });
  }

  it('the caller can still update a benign column (the guard is not a blanket denial)', async () => {
    // Proves the lockdown revoked the right columns rather than all of them, so the fix
    // cannot pass by breaking the feature.
    const benign = env('PRIVESC_BENIGN_UPDATE');
    if (!benign) return;
    const { table, column, value } = parseTarget(benign);
    const { error } = await client.from(table).update({ [column]: value } as Record<string, unknown>).eq('id', uid).select();
    expect(error, `benign update ${table}.${column} was rejected: the revoke was too broad`).toBeNull();
  });
});
