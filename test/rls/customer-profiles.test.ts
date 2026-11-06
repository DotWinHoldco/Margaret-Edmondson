// @vitest-environment node
// Authored by DotWin. Exercise PostgreSQL RLS with the production staff predicate.
import { readFileSync } from 'node:fs'
import { PGlite } from '@electric-sql/pglite'
import { afterAll, beforeAll, expect, it } from 'vitest'

let db: PGlite
const read = (path: string) => readFileSync(path, 'utf8')
const ids = {
  admin: '00000000-0000-4000-8000-000000000001',
  artist: '00000000-0000-4000-8000-000000000002',
  buyer: '00000000-0000-4000-8000-000000000003',
  other: '00000000-0000-4000-8000-000000000004',
}

beforeAll(async () => {
  db = new PGlite()
  await db.exec(`
    create role authenticated; create role anon; create schema auth;
    create function auth.uid() returns uuid language sql stable as $$
      select nullif(current_setting('request.jwt.claim.sub', true), '')::uuid
    $$;
    grant usage on schema auth to authenticated, anon;
    create table public.profiles (id uuid primary key, full_name text, role text);
    alter table public.profiles enable row level security;
    grant select, update on public.profiles to authenticated, anon;
    create policy "Users can read own profile" on public.profiles for select using ((select auth.uid()) = id);
    create policy "Users can update own profile" on public.profiles for update using ((select auth.uid()) = id);
    insert into public.profiles values
      ('${ids.admin}', 'Admin', 'admin'), ('${ids.artist}', 'Artist', 'artist'),
      ('${ids.buyer}', 'Buyer', 'customer'), ('${ids.other}', 'Other', 'customer');
  `)
  const predicate = read('supabase/migrations/20260421185851_shared_files_module.sql')
    .match(/create or replace function public\.is_admin_or_artist\(\)[\s\S]*?\$\$;/i)?.[0]
  if (!predicate) throw new Error('Missing staff predicate')
  await db.exec(predicate)
  await db.exec(read('supabase/migrations/20261106150442_staff_customer_visibility.sql'))
}, 30_000)
afterAll(async () => { await db?.close() })

async function asUser(id: string, action: () => Promise<void>, role = 'authenticated') {
  await db.exec(`begin; set local role ${role}; set local request.jwt.claim.sub = '${id}';`)
  try { await action() } finally { await db.exec('rollback') }
}

for (const role of ['admin', 'artist'] as const) {
  it(`${role} can read all customers without gaining permission to edit their profiles`, async () => {
    await asUser(ids[role], async () => {
      expect((await db.query('select id from public.profiles')).rows).toHaveLength(4)
      expect((await db.query(`update public.profiles set full_name = 'Changed' where id = '${ids.buyer}' returning id`)).rows).toHaveLength(0)
    })
  })
}
it('a customer can read only their own profile and cannot edit another customer', async () => {
  await asUser(ids.buyer, async () => {
    expect((await db.query('select id from public.profiles')).rows).toEqual([{ id: ids.buyer }])
    expect((await db.query(`update public.profiles set full_name = 'Changed' where id = '${ids.other}' returning id`)).rows).toHaveLength(0)
  })
})
it('anonymous requests and signed-in users without a profile see no customer records', async () => {
  await asUser('', async () => { expect((await db.query('select id from public.profiles')).rows).toHaveLength(0) }, 'anon')
  await asUser('00000000-0000-4000-8000-000000000005', async () => { expect((await db.query('select id from public.profiles')).rows).toHaveLength(0) })
})
