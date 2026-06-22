// Authored by DotWin
// Gate: migrations are reproducible and generated types are not obviously stale.
// Evidence: real projects had empty migration folders (.gitkeep only) or 1 migration
// for 151 tables — schema lived only in the remote DB, so a fresh clone could not
// rebuild it, and database.types.ts drifted from the live schema.

import { fileURLToPath } from 'node:url';
import fs from 'node:fs';
import path from 'node:path';
import { walk, readJSON, rel, safeIsDir, safeExists } from './lib/scan.mjs';
import { finding, gate } from './lib/report.mjs';

const TYPE_CANDIDATES = [
  'src/lib/database.types.ts', 'src/types/database.types.ts', 'src/lib/supabase/database.types.ts',
  'types/database.types.ts', 'database.types.ts', 'src/types/supabase.ts',
];

export function runCheck(root) {
  const findings = [];
  const pkg = readJSON(path.join(root, 'package.json')) || {};
  const deps = { ...(pkg.dependencies || {}), ...(pkg.devDependencies || {}) };
  const usesSupabase = Object.keys(deps).some((d) => d.includes('@supabase'));

  if (!usesSupabase) {
    return gate('migrations', { required: false, status: 'skipped', findings, detail: 'project does not use Supabase' });
  }

  const migDir = path.join(root, 'supabase', 'migrations');
  if (!safeIsDir(migDir)) {
    findings.push(finding({ severity: 'high', file: 'supabase/migrations', message: 'No migrations directory — schema is not reproducible', rule: 'mig-missing' }));
    return gate('migrations', { status: 'fail', findings, detail: 'missing migrations dir' });
  }

  const sql = walk(migDir, { exts: ['.sql'] });
  if (sql.length === 0) {
    findings.push(finding({ severity: 'high', file: 'supabase/migrations', message: 'Migrations directory is empty (.gitkeep only) — schema lives only in remote DB', rule: 'mig-empty' }));
  }

  // Numbered / timestamped filenames.
  for (const f of sql) {
    const base = path.basename(f);
    if (!/^\d{4,}/.test(base)) {
      findings.push(finding({ severity: 'medium', file: rel(root, f), message: 'Migration filename is not numbered/timestamped', rule: 'mig-unordered' }));
    }
  }

  // Baseline continuity: a sequentially-numbered migration set must start near 0001 so the
  // schema replays from zero. A repo whose first migration is 0044 is missing its 0001–0043
  // baseline (real finding F-20). Timestamp-style prefixes (>=8 digits) are exempt.
  const seqNums = sql
    .map((f) => path.basename(f).match(/^(\d{1,6})[_.-]/))
    .filter(Boolean)
    .map((mm) => parseInt(mm[1], 10))
    .filter((n) => !Number.isNaN(n));
  if (seqNums.length >= 3) {
    const min = Math.min(...seqNums);
    if (min > 1) {
      const pad = (n) => String(n).padStart(4, '0');
      findings.push(finding({ severity: 'high', file: 'supabase/migrations', message: `Migration baseline incomplete — sequence starts at ${pad(min)}; the ${pad(1)}–${pad(min - 1)} baseline is missing, so the schema cannot be replayed from zero`, rule: 'mig-baseline-gap' }));
    }
  }

  // Generated types present + not obviously older than the newest migration.
  const typeFile = TYPE_CANDIDATES.map((p) => path.join(root, p)).find((p) => safeExists(p));
  if (!typeFile && sql.length) {
    findings.push(finding({ severity: 'medium', file: 'database.types.ts', message: 'No generated Supabase types found — regenerate after migrations', rule: 'types-missing' }));
  } else if (typeFile && sql.length) {
    const newestMig = Math.max(...sql.map((f) => fs.statSync(f).mtimeMs));
    const typeMtime = fs.statSync(typeFile).mtimeMs;
    if (newestMig > typeMtime + 5000) {
      findings.push(finding({ severity: 'medium', file: rel(root, typeFile), message: 'Generated types older than newest migration — regenerate database.types.ts', rule: 'types-stale' }));
    }
  }

  const blocking = findings.filter((f) => f.severity === 'high' || f.severity === 'critical');
  return gate('migrations', {
    status: blocking.length ? 'fail' : 'pass',
    findings,
    detail: `${sql.length} migration file(s)`,
  });
}

if (path.resolve(process.argv[1] || '') === fileURLToPath(import.meta.url)) {
  const g = runCheck(process.argv[2] || process.cwd());
  for (const f of g.findings) console.log(`[${f.severity}] ${f.message} — ${f.file}`);
  console.log(`migrations: ${g.status} (${g.detail})`);
  process.exit(g.status === 'fail' ? 1 : 0);
}
