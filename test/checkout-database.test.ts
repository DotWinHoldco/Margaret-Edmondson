// @vitest-environment node
// Authored by DotWin. Run the real checkout functions in disposable PostgreSQL.
import { readFileSync, readdirSync } from 'node:fs'
import { PGlite } from '@electric-sql/pglite'
import { afterAll, beforeAll, expect, it } from 'vitest'

const read = (file: string) => readFileSync(file, 'utf8')
let db: PGlite

// Later replacements must be exercised too, not just the migration that fixed the incident.
function latestFunction(name: string) {
  let definition: string | undefined
  for (const file of readdirSync('supabase/migrations').sort()) {
    if (!file.endsWith('.sql')) continue
    const sql = read(`supabase/migrations/${file}`)
    const pattern = new RegExp(`create\\s+(?:or\\s+replace\\s+)?function\\s+public\\.${name}\\s*\\([^]*?\\bas\\s+(\\$[a-z_]*\\$)[^]*?\\1\\s*;`, 'gi')
    for (const match of sql.matchAll(pattern)) definition = match[0]
  }
  if (!definition) throw new Error(`Missing production function: ${name}`)
  return definition.replace(/^create\s+function/i, 'create or replace function')
}

beforeAll(async () => {
  db = new PGlite()
  for (const file of [
    'test/sql/checkout-fixture.sql',
    'supabase/migrations/20260608055342_money_path_atomicity.sql',
    'supabase/migrations/20260806080437_original_holds_and_funnel_attribution.sql',
    'supabase/migrations/20260911180630_studio_fulfillment.sql',
    'supabase/migrations/20260914230200_sync_original_product_variant.sql',
    'supabase/migrations/20261104185409_festive_class_production.sql',
    'supabase/migrations/20261104195446_festive_payment_elements.sql',
  ]) await db.exec(read(file))
  for (const name of [
    'hold_originals', 'convert_original_hold', 'release_original_holds', 'refund_original_holds',
    'book_class_session', 'festive_reserve', 'festive_registration_status',
    'festive_link_intent', 'festive_payment_intent', 'festive_payment', 'festive_claim_email',
  ]) await db.exec(latestFunction(name))
}, 30_000)

afterAll(async () => { await db?.close() })

it('reserves originals, retries safely, excludes competitors and consumes inventory exactly once', async () => {
  await db.exec(read('supabase/tests/original_hold_conflict_target.sql'))
})

it('detects the original SQLSTATE 42702 regression rather than mocking it away', async () => {
  const fixed = latestFunction('hold_originals')
  const broken = fixed.replace('on conflict on constraint original_holds_payment_ref_variant_id_key', 'on conflict (payment_ref, variant_id)')
  expect(broken).not.toBe(fixed)
  try {
    await db.exec(broken)
    await expect(db.exec(read('supabase/tests/original_hold_conflict_target.sql'))).rejects.toMatchObject({ code: '42702' })
  } finally {
    await db.exec('rollback')
    await db.exec(fixed)
  }
})

it('checks festive prices, groups, retry tokens, closing time and durable email records', async () => {
  await db.exec(read('supabase/tests/festive-class-production.sql'))
})

it('requires matching paid PaymentIntent evidence and queues confirmations only once', async () => {
  await db.exec(read('supabase/tests/festive-payment-elements.sql'))
})

it('protects remaining legacy class capacity and releases cancelled bookings', async () => {
  await db.exec(`begin;
    do $$ declare s uuid:=gen_random_uuid(); b uuid:=gen_random_uuid(); begin
      insert into class_sessions values(s,1);
      assert book_class_session(s,b,'Test','fixture@example.invalid','1234567','',null)='OK';
      assert book_class_session(s,gen_random_uuid(),'Test','fixture@example.invalid','1234567','',null)='SOLD_OUT';
      update class_bookings set status='cancelled' where id=b;
      assert book_class_session(s,gen_random_uuid(),'Test','fixture@example.invalid','1234567','',null)='OK';
      assert book_class_session(gen_random_uuid(),gen_random_uuid(),'Test','fixture@example.invalid','1234567','',null)='NOT_FOUND';
    end $$; rollback;`)
})

it('restocks an unshipped refund once and blocks an expired payment from taking another buyer’s hold', async () => {
  await db.exec(`begin;
    do $$ declare p uuid:=gen_random_uuid(); v uuid; begin
      insert into products(id,title,slug,base_price,is_original) values(p,'Fixture',p::text,20,true);
      select id into strict v from product_variants where product_id=p;
      assert (select ok from hold_originals('pi_fixture_refund',array[v],35));
      assert convert_original_hold('pi_fixture_refund',v)='converted';
      assert refund_original_holds('pi_fixture_refund')=1;
      assert refund_original_holds('pi_fixture_refund')=0;
      assert (select inventory_count=1 from product_variants where id=v);
      assert (select ok from hold_originals('pi_fixture_slow',array[v],35));
      update original_holds set expires_at=now()-interval '1 second' where variant_id=v;
      assert (select ok from hold_originals('pi_fixture_new',array[v],35));
      assert convert_original_hold('pi_fixture_slow',v)='oversold';
      assert release_original_holds('pi_fixture_new')=1;
      assert convert_original_hold('pi_fixture_slow',v)='converted';
      assert convert_original_hold('pi_fixture_slow',v)='already_converted';
    end $$; rollback;`)
})
