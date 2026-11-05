// Authored by DotWin. Prove row-lock behavior using separate real PostgreSQL connections.
// Creates and removes only its own disposable cluster. Never reads app credentials.
import assert from 'node:assert/strict'
import { spawn, spawnSync } from 'node:child_process'
import { mkdtempSync, readFileSync, readdirSync, rmSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { randomUUID } from 'node:crypto'

const bin = process.env.CHECKOUT_PG_BIN || '/opt/homebrew/opt/postgresql@17/bin'
const dir = mkdtempSync(join(tmpdir(), 'artbyme-checkout-race-'))
const port = String(55000 + Math.floor(Math.random() * 8000))
const connection = ['-X', '-h', '127.0.0.1', '-p', port, '-d', 'postgres', '-v', 'ON_ERROR_STOP=1', '-At']
function run(name, args) {
  const result = spawnSync(join(bin, name), args, { encoding: 'utf8', timeout: 30_000 })
  if (result.error || result.status !== 0) throw new Error(result.error?.message || result.stderr || result.stdout)
  return result.stdout.trim()
}
const sql = query => run('psql', [...connection, '-c', query])
function client(application) {
  const child = spawn(join(bin, 'psql'), connection, { env: { ...process.env, PGAPPNAME: application } })
  let output = '', errors = ''
  child.stdout.on('data', b => { output += b.toString() })
  child.stderr.on('data', b => { errors += b.toString() })
  const done = new Promise((resolve, reject) => {
    child.on('error', reject)
    child.on('close', code => code === 0 ? resolve(output.trim()) : reject(new Error(errors)))
  })
  // Observe early failures while waiting for the lock marker so cleanup still runs.
  void done.catch(() => {})
  return { child, done, output: () => output }
}
const pause = () => new Promise(resolve => setTimeout(resolve, 10))
async function until(check, message) {
  const deadline = Date.now() + 10_000
  while (!check()) { if (Date.now() >= deadline) throw new Error(message); await pause() }
}
async function race(firstSql, secondSql, expectedFirst, expectedSecond) {
  const first = client('checkout-race-holder'), second = client('checkout-race-contender')
  try {
    first.child.stdin.write(`begin; ${firstSql}; select 'FIRST_HELD';\n`)
    await until(() => first.output().includes('FIRST_HELD'), 'First checkout did not acquire its hold')
    second.child.stdin.end(`${secondSql};\n`)
    await until(() => sql("select count(*) from pg_stat_activity where application_name='checkout-race-contender' and wait_event_type='Lock'") === '1', 'Second checkout did not wait on the row lock')
    first.child.stdin.end('commit;\n')
    assert.match(await first.done, new RegExp(`(?:^|\\n)${expectedFirst}(?:\\n|$)`))
    assert.equal(await second.done, expectedSecond)
  } finally {
    first.child.stdin.end(); second.child.stdin.end()
    await Promise.allSettled([first.done, second.done])
  }
}

let started = false
try {
  run('initdb', ['-D', dir, '-A', 'trust', '--no-locale'])
  run('pg_ctl', ['-D', dir, '-l', join(dir, 'server.log'), '-o', `-p ${port} -h 127.0.0.1 -k /tmp`, '-w', 'start'])
  started = true
  for (const file of [
    'test/sql/checkout-fixture.sql',
    'supabase/migrations/20260608055342_money_path_atomicity.sql',
    'supabase/migrations/20260806080437_original_holds_and_funnel_attribution.sql',
    'supabase/migrations/20261105012156_fix_original_hold_conflict_target.sql',
  ]) run('psql', [...connection, '-f', file])
  // Exercise later replacements as well, so this race test stays useful after new migrations.
  for (const name of ['hold_originals', 'book_class_session']) {
    let latest = ''
    for (const file of readdirSync('supabase/migrations').filter(f => f.endsWith('.sql')).sort()) {
      const pattern = new RegExp(`create\\s+(?:or\\s+replace\\s+)?function\\s+public\\.${name}\\s*\\([^]*?\\bas\\s+(\\$[a-z_]*\\$)[^]*?\\1\\s*;`, 'gi')
      for (const match of readFileSync(`supabase/migrations/${file}`, 'utf8').matchAll(pattern)) latest = match[0]
    }
    assert.ok(latest, `Missing checkout function: ${name}`)
    sql(latest.replace(/^create\s+function/i, 'create or replace function'))
  }
  const product = randomUUID(), variant = randomUUID(), session = randomUUID()
  sql(`insert into products(id) values('${product}'); insert into product_variants(id,product_id,variant_type,inventory_count) values('${variant}','${product}','original',1); insert into class_sessions values('${session}',1)`)
  await race(`select ok from hold_originals('pi_race_first',array['${variant}'::uuid],35)`, `select ok from hold_originals('pi_race_second',array['${variant}'::uuid],35)`, 't', 'f')
  assert.equal(sql(`select count(*) from original_holds where variant_id='${variant}' and status='held'`), '1')
  assert.equal(sql(`select inventory_count from product_variants where id='${variant}'`), '1')
  const booking = () => `select book_class_session('${session}','${randomUUID()}','Fixture','fixture@example.invalid','1234567','',null)`
  await race(booking(), booking(), 'OK', 'SOLD_OUT')
  assert.equal(sql(`select count(*) from class_bookings where session_id='${session}'`), '1')
  console.log('PASS: simultaneous original checkout and last-seat class booking; one winner each, row-lock waits confirmed.')
} finally {
  if (started) run('pg_ctl', ['-D', dir, '-w', 'stop'])
  rmSync(dir, { recursive: true, force: true })
}
