// @vitest-environment node
// Authored by DotWin. Run the real queue/coupon transactions and checkout validator in PostgreSQL.
import { readFileSync, readdirSync } from 'node:fs'
import { PGlite } from '@electric-sql/pglite'
import { afterAll, afterEach, beforeAll, beforeEach, expect, it } from 'vitest'

let db: PGlite
const read = (name: string) => readFileSync(`supabase/migrations/${name}`, 'utf8')
beforeAll(async () => {
  db = new PGlite()
  await db.exec(`
    create role anon; create role authenticated; create role service_role bypassrls;
    create function public.is_admin_or_artist() returns boolean language sql as $$ select false $$;
    create table email_automations(id uuid primary key default gen_random_uuid(), name text, slug text unique,
      trigger_event text, is_active boolean, description text);
    create table email_automation_steps(id uuid primary key default gen_random_uuid(), automation_id uuid references email_automations,
      step_order integer, delay_minutes integer, subject text, preheader text, content_html text);
    create table crm_contacts(id uuid primary key default gen_random_uuid(), email text unique, first_name text,
      source text, status text default 'active');
    create table orders(id uuid primary key default gen_random_uuid(), email text, created_at timestamptz default now(),
      stripe_mode text default 'live', status text default 'processing', side_effects_completed_at timestamptz default now(),
      fulfillment_hold_reason text, shipping_address jsonb default '{"name":"Alex Patron"}',
      stripe_checkout_session_id text, stripe_payment_intent_id text default 'pi_example');
    create table promo_codes(id uuid primary key default gen_random_uuid(), code text unique, discount_type text,
      discount_value numeric, usage_limit integer, usage_count integer, valid_from timestamptz, valid_until timestamptz,
      is_active boolean, kind text, contact_id uuid references crm_contacts, single_use_per_contact boolean, description text,
      min_order_amount numeric, cart_id uuid);
    create table promo_code_redemptions(promo_code_id uuid, contact_id uuid);
  `)
  await db.exec(read('20260608151944_email_automation_sends.sql'))
  const migration = readdirSync('supabase/migrations').find(name => name.endsWith('_day_after_purchase_email.sql'))!
  await db.exec(read(migration))
  await db.exec(read(readdirSync('supabase/migrations').find(name => name.endsWith('_enable_day_after_purchase_letter.sql'))!))
  // Latest checked-in definition of the public checkout validator.
  const migrations = readdirSync('supabase/migrations').sort().filter(name =>
    /create or replace function public\.validate_promo_code_public\(/i.test(read(name)))
  const sql = read(migrations.at(-1)!)
  const validator = sql.match(/create or replace function public\.validate_promo_code_public\([\s\S]*?\$\$;/i)![0]
  await db.exec(validator)
  await db.exec('grant all on all tables in schema public to service_role; grant select on all tables in schema public to anon, authenticated;')
}, 30_000)
afterAll(async () => { await db?.close() })
beforeEach(async () => {
  await db.exec("begin; update email_automations set enqueue_from = now() - interval '4 days' where slug = 'post-purchase';")
})
afterEach(async () => { await db.exec('rollback') })

async function order(age = '25 hours') {
  const result = await db.query<{ id: string }>(
    "insert into orders(email, created_at) values ('buyer@example.com', now() - $1::interval) returning id", [age])
  return result.rows[0].id
}
async function claim() {
  return (await db.query<{ id: string; claim_token: string }>('select * from claim_post_purchase_email()')).rows[0]
}
async function prepare(job: { id: string; claim_token: string }) {
  return (await db.query<{ context: Record<string, unknown> | null }>(
    'select prepare_post_purchase_email($1, $2) as context', [job.id, job.claim_token])).rows[0].context
}
async function count(table: string) {
  return (await db.query<{ count: number }>(`select count(*)::integer as count from ${table}`)).rows[0].count
}

it('waits a full 24 hours, then claims the order exactly once while the lease is held', async () => {
  const id = await order('23 hours 59 minutes')
  expect(await claim()).toBeUndefined()
  expect(await count('email_automation_triggers')).toBe(1)
  await db.exec("update email_automation_triggers set due_at = now(), available_at = now()")
  expect(await claim()).toBeDefined()
  expect(await claim()).toBeUndefined()
  expect((await db.query('select related_order_id from email_automation_triggers')).rows).toEqual([{ related_order_id: id }])
})

it('never queues historical, unpaid, test, held, or already-thanked orders', async () => {
  const id = await order()
  await db.exec(`insert into email_automation_sends(email_snapshot, dedupe_key) values ('buyer@example.com', 'post_purchase:${id}')`)
  await order('5 days')
  for (const [field, value] of [['status', 'pending'], ['status', 'refunded'], ['stripe_mode', 'test'], ['fulfillment_hold_reason', 'Verification pending']]) {
    const other = await order()
    await db.query(`update orders set ${field} = $1 where id = $2`, [value, other])
  }
  const incomplete = await order()
  await db.query('update orders set side_effects_completed_at = null where id = $1', [incomplete])
  expect(await claim()).toBeUndefined()
  expect(await count('email_automation_triggers')).toBe(0)
})

it('atomically creates one 10% code valid for 30 days and restricts it to the buyer and one use', async () => {
  await order()
  const job = await claim()
  const context = (await prepare(job))!
  expect(context.percentOff).toBe(10)
  expect(Date.parse(String(context.expiresAt)) - Date.parse(String(context.validFrom))).toBe(30 * 86_400_000)
  expect((await prepare(job))!.code).toBe(context.code)
  expect(await count('promo_codes')).toBe(1)
  const validate = async (email: string) => (await db.query<{ ok: boolean; reason: string; amount_off_cents: number }>(
    'select * from validate_promo_code_public($1, $2, null, 100)', [context.code, email])).rows[0]
  expect(await validate('buyer@example.com')).toMatchObject({ ok: true, amount_off_cents: 1000 })
  expect(await validate('other@example.com')).toMatchObject({ ok: false, reason: 'wrong_contact' })
  await db.exec('update promo_codes set usage_count = 1')
  expect((await validate('buyer@example.com')).ok).toBe(false)
  await db.exec("update promo_codes set usage_count = 0, valid_until = now() - interval '1 second'")
  expect(await validate('buyer@example.com')).toMatchObject({ ok: false, reason: 'expired' })
})

for (const status of ['unsubscribed', 'bounced', 'complained']) {
  it(`rechecks ${status} at delivery and does not create a coupon or reactivate the contact`, async () => {
    await order()
    const job = await claim()
    await db.query('insert into crm_contacts(email, status) values ($1, $2)', ['buyer@example.com', status])
    expect(await prepare(job)).toBeNull()
    expect(await count('promo_codes')).toBe(0)
    expect((await db.query('select status from crm_contacts')).rows).toEqual([{ status }])
    expect(await claim()).toBeUndefined()
  })
}

it('rechecks cancellation after queueing and respects an automation pause', async () => {
  await order()
  await db.exec("update email_automations set is_active = false where slug = 'post-purchase'")
  expect(await claim()).toBeUndefined()
  await db.exec("update email_automations set is_active = true where slug = 'post-purchase'")
  const job = await claim()
  await db.exec("update orders set status = 'cancelled'")
  expect(await prepare(job)).toBeNull()
  expect(await count('promo_codes')).toBe(0)
})

it('rolls back contact and coupon creation if saving the queue association fails', async () => {
  await order()
  const job = await claim()
  await db.exec(`create function reject_offer() returns trigger language plpgsql as $$ begin
    if new.promo_code_id is not null then raise exception 'injected queue failure'; end if; return new; end $$;
    create trigger reject_offer before update on email_automation_triggers for each row execute function reject_offer();
    savepoint failure_test;`)
  await expect(prepare(job)).rejects.toThrow('injected queue failure')
  await db.exec('rollback to savepoint failure_test')
  expect(await count('crm_contacts')).toBe(0)
  expect(await count('promo_codes')).toBe(0)
})

it('records delivery atomically and prevents replay even after the lease expires', async () => {
  await order()
  const job = await claim()
  const context = (await prepare(job))!
  await db.query('update email_automation_triggers set payload = $1::jsonb where id = $2', [JSON.stringify(context), job.id])
  expect((await db.query('select complete_post_purchase_email($1, $2, $3) as done', [job.id, job.claim_token, 'resend-1'])).rows).toEqual([{ done: true }])
  expect(await count('email_automation_sends')).toBe(1)
  expect(await claim()).toBeUndefined()
})

it('stops ambiguous delivery retries before the provider idempotency key expires', async () => {
  await order()
  await claim()
  await db.exec("update email_automation_triggers set first_attempt_at = now() - interval '23 hours', lease_until = now() - interval '1 second'")
  expect(await claim()).toBeUndefined()
  expect((await db.query('select result from email_automation_triggers')).rows).toEqual([{ result: 'needs_review' }])
})

for (const role of ['anon', 'authenticated']) {
  it(`${role} cannot claim or prepare mail or read the private queue`, async () => {
    await order()
    await db.exec(`set local role ${role}; savepoint permission_test;`)
    await expect(claim()).rejects.toThrow(/permission denied/)
    await db.exec('rollback to savepoint permission_test')
    expect(await count('email_automation_triggers')).toBe(0)
    await expect(db.query('select prepare_post_purchase_email(gen_random_uuid(), gen_random_uuid())')).rejects.toThrow(/permission denied/)
    await db.exec('rollback to savepoint permission_test')
  })
}
