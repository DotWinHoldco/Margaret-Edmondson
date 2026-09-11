// Run studio transactions against a new local database; never reads app credentials.
import { spawnSync } from 'node:child_process'
import { mkdtempSync, rmSync, readFileSync, existsSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
const bin = process.env.STUDIO_PG_BIN || '/opt/homebrew/opt/postgresql@17/bin'
const dir = mkdtempSync(join(tmpdir(), 'artbyme-studio-test-'))
const port = String(55000 + Math.floor(Math.random() * 8000))
function run(name, args) {
  const result = spawnSync(join(bin, name), args, { encoding: 'utf8' })
  if (result.status !== 0) throw new Error(result.stderr || result.stdout)
  return result.stdout
}
let started = false
try {
  run('initdb', ['-D', dir, '-A', 'trust', '--no-locale'])
  run('pg_ctl', [
    '-D',
    dir,
    '-l',
    join(dir, 'server.log'),
    '-o',
    `-p ${port} -h 127.0.0.1 -k /tmp`,
    '-w',
    'start',
  ])
  started = true
  for (const file of [
    'test/sql/studio-fixture.sql',
    'supabase/migrations/20260911180630_studio_fulfillment.sql',
    'test/sql/studio-invariants.sql',
  ]) {
    run('psql', [
      '-h',
      '127.0.0.1',
      '-p',
      port,
      '-d',
      'postgres',
      '-v',
      'ON_ERROR_STOP=1',
      '-f',
      file,
    ])
  }
  console.log(
    'PASS: studio migration and database invariants in isolated PostgreSQL.',
  )
} catch (error) {
  if (existsSync(join(dir, 'server.log')))
    console.error(readFileSync(join(dir, 'server.log'), 'utf8'))
  throw error
} finally {
  if (started) run('pg_ctl', ['-D', dir, '-w', 'stop'])
  rmSync(dir, { recursive: true, force: true })
}
