// @vitest-environment node
import { readFileSync } from 'node:fs'
import { PGlite } from '@electric-sql/pglite'
import { beforeAll, afterAll, it, expect } from 'vitest'
let db: PGlite
const id = '00000000-0000-4000-8000-000000000001'
beforeAll(async () => {
  db = new PGlite()
  await db.exec(`
    create role anon; create role authenticated; create role service_role;
    create schema storage;
    create table storage.objects (bucket_id text, name text, metadata jsonb);
    create table public.products (id uuid, master_artwork_id uuid, status text);
    create table public.master_artworks (id uuid, print_status text, print_storage_path text, print_width_px integer, print_height_px integer);
    insert into public.products values ('${id}', '${id}', 'active');
    insert into public.master_artworks values ('${id}', 'ready', 'private/crop.png', 9000, 6000);
    insert into storage.objects values ('print-masters','private/crop.png','{"size":100000000,"mimetype":"image/png"}');
  `)
  await db.exec(readFileSync('supabase/migrations/20261119200456_provider_print_file_readiness.sql','utf8'))
}, 30_000)
afterAll(async () => { await db?.close() })
it('exposes only readiness and dimensions, enforcing exact file size and type for public callers', async () => {
  await db.exec('set role anon')
  expect((await db.query(`select * from public.get_public_print_readiness(array['${id}']::uuid[])`)).rows).toEqual([{ product_id: id, print_ready: true, print_width_px: 9000, print_height_px: 6000 }])
  await expect(db.query('select * from storage.objects')).rejects.toThrow()
  await db.exec('reset role')
  for (const metadata of [{ size: 100000001, mimetype: 'image/png' }, { size: 1000, mimetype: 'image/tiff' }, { size: 'unknown', mimetype: 'image/png' }]) {
    await db.query('update storage.objects set metadata=$1', [JSON.stringify(metadata)])
    expect((await db.query(`select print_ready from public.get_public_print_readiness(array['${id}']::uuid[])`)).rows).toEqual([{ print_ready: false }])
  }
  await db.exec('delete from storage.objects')
  expect((await db.query(`select print_ready from public.get_public_print_readiness(array['${id}']::uuid[])`)).rows).toEqual([{ print_ready: false }])
})
