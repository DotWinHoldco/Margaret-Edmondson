// Authored by DotWin
// Gate: the keystone that makes the transaction registry honest. For every declared
// cross-domain transaction in src/contracts/transaction-registry.ts:
//   - a migration must actually create a function of that name (no aspirational contract),
//   - the tables the function body writes must equal the declared `touches`.
// Without this, the registry is theater. CLASS: CLEAN.

import { fileURLToPath } from 'node:url';
import fs from 'node:fs';
import path from 'node:path';
import { walk, readText, rel, safeIsDir } from './lib/scan.mjs';
import { blankComments } from './lib/cells.mjs';
import { finding, gate } from './lib/report.mjs';

function parseRegistry(root) {
  const candidates = [
    path.join(root, 'src', 'contracts', 'transaction-registry.ts'),
    path.join(root, 'contracts', 'transaction-registry.ts'),
  ];
  const file = candidates.find((f) => fs.existsSync(f));
  if (!file) return { file: null, entries: [] };
  const text = blankComments(readText(file)); // never parse a commented-out example entry
  const entries = [];
  for (const obj of text.matchAll(/\{([^{}]*)\}/g)) {
    const body = obj[1];
    const name = (body.match(/name\s*:\s*['"]([^'"]+)['"]/) || [])[1];
    if (!name) continue;
    const owner = (body.match(/owner\s*:\s*['"]([^'"]+)['"]/) || [])[1] || null;
    const tm = body.match(/touches\s*:\s*\[([\s\S]*?)\]/);
    const touches = tm ? [...tm[1].matchAll(/['"]([a-z0-9_]+)['"]/g)].map((x) => x[1].toLowerCase()) : [];
    entries.push({ name, owner, touches });
  }
  return { file: rel(root, file), entries };
}

// fn name -> { writes:Set<table>, file } parsed from the dollar-quoted body in migration SQL.
function loadFunctions(root) {
  const migDir = path.join(root, 'supabase', 'migrations');
  const fns = {};
  if (!safeIsDir(migDir)) return fns;
  for (const f of walk(migDir, { exts: ['.sql'] }).sort()) {
    const raw = readText(f).replace(/--[^\n]*/g, '');
    const fnRe = /create\s+(?:or\s+replace\s+)?function\s+(?:"?public"?\.)?"?([a-z0-9_]+)"?\s*\(/gi;
    let m;
    while ((m = fnRe.exec(raw))) {
      const name = m[1].toLowerCase();
      const rest = raw.slice(m.index);
      const dq = rest.match(/\$([a-zA-Z_]*)\$([\s\S]*?)\$\1\$/);
      const body = dq ? dq[2] : '';
      const writes = new Set();
      for (const w of body.matchAll(/insert\s+into\s+(?:"?public"?\.)?"?([a-z0-9_]+)"?/gi)) writes.add(w[1].toLowerCase());
      for (const w of body.matchAll(/update\s+(?:"?public"?\.)?"?([a-z0-9_]+)"?\s+set/gi)) writes.add(w[1].toLowerCase());
      for (const w of body.matchAll(/delete\s+from\s+(?:"?public"?\.)?"?([a-z0-9_]+)"?/gi)) writes.add(w[1].toLowerCase());
      fns[name] = { writes, file: rel(root, f) };
    }
  }
  return fns;
}

export function runCheck(root) {
  const { file, entries } = parseRegistry(root);
  if (!file) return gate('rpc-exists', { required: false, status: 'skipped', findings: [], detail: 'no transaction-registry.ts' });

  const fns = loadFunctions(root);
  const findings = [];
  for (const e of entries) {
    const fn = fns[e.name.toLowerCase()];
    if (!fn) {
      findings.push(finding({ severity: 'high', file, message: `Transaction "${e.name}" is declared but no migration creates function ${e.name}() (aspirational contract)`, rule: 'rpc-missing' }));
      continue;
    }
    for (const t of e.touches) {
      if (!fn.writes.has(t)) {
        findings.push(finding({ severity: 'medium', file, message: `Transaction "${e.name}" declares touches "${t}" but ${e.name}() never writes it`, rule: 'rpc-touches-unused' }));
      }
    }
    for (const w of fn.writes) {
      if (!e.touches.includes(w)) {
        findings.push(finding({ severity: 'high', file: fn.file, message: `Function ${e.name}() writes ${w}, not declared in its touches (undeclared cross-table write)`, rule: 'rpc-touches-undeclared' }));
      }
    }
  }

  const blocking = findings.filter((f) => f.severity === 'high' || f.severity === 'critical');
  return gate('rpc-exists', {
    status: blocking.length ? 'fail' : 'pass',
    findings,
    detail: `${entries.length} declared transaction(s); ${blocking.length} blocking`,
  });
}

if (path.resolve(process.argv[1] || '') === fileURLToPath(import.meta.url)) {
  const g = runCheck(process.argv[2] || process.cwd());
  for (const f of g.findings) console.log(`[${f.severity}] ${f.message} ${f.file}`);
  console.log(`rpc-exists: ${g.status} (${g.detail})`);
  process.exit(g.status === 'fail' ? 1 : 0);
}
