// Authored by DotWin
// Gate: a multi-table write must be atomic. A file that performs writes to two or more distinct
// tables with no .rpc(...) call is a torn-write risk. Crossing domains makes it a hard fail
// (Rule 1: it must be one declared RPC); within one domain it is advisory (confirm or wrap).
// In Supabase the only atomic form across tables is a single RPC, so "good" means one .rpc().
// CLASS: CONDITIONAL. Function-scoped: only writes within the SAME function are considered, so
// two unrelated single-write functions in one file are not falsely flagged. A module-top-level
// write (outside any function) is not analyzed. dotwin-allow:atomicity exempts a file.

import { fileURLToPath } from 'node:url';
import path from 'node:path';
import { loadDomains, ownerOf, fromCalls, hasRpcCall, splitFunctions, walk, readText, rel } from './lib/cells.mjs';
import { finding, gate } from './lib/report.mjs';

const CODE_EXTS = ['.ts', '.tsx', '.js', '.jsx'];

export function runCheck(root) {
  const { seg, dir, domains } = loadDomains(root);
  if (!seg) return gate('atomicity', { required: false, status: 'skipped', findings: [], detail: 'no src/domains or src/modules' });

  const findings = [];
  for (const file of walk(dir, { exts: CODE_EXTS })) {
    const content = readText(file);
    if (content.includes('dotwin-allow:atomicity')) continue;
    const p = rel(root, file);
    for (const fn of splitFunctions(content)) {
      if (hasRpcCall(fn.body)) continue; // an RPC is the atomic form
      const writes = fromCalls(fn.body).filter((c) => c.isWrite && !c.table.startsWith('v_'));
      const tables = [...new Set(writes.map((w) => w.table))];
      if (tables.length < 2) continue;

      const owners = new Set(tables.map((t) => ownerOf(t, domains) || `?${t}`));
      if (owners.size > 1) {
        findings.push(finding({ severity: 'high', file: p, line: fn.startLine, message: `Non-atomic multi-table write across domains in ${fn.name}() (${tables.join(', ')}): use one declared RPC, not sequential .from().write() calls`, rule: 'atomicity-cross-domain' }));
      } else {
        findings.push(finding({ severity: 'medium', file: p, line: fn.startLine, message: `Multiple table writes in ${fn.name}() (${tables.join(', ')}) with no transaction: confirm atomicity or wrap in an RPC`, rule: 'atomicity-multi-write' }));
      }
    }
  }

  const blocking = findings.filter((f) => f.severity === 'high' || f.severity === 'critical');
  return gate('atomicity', {
    status: blocking.length ? 'fail' : 'pass',
    findings,
    detail: blocking.length ? `${blocking.length} non-atomic cross-domain write(s)` : 'multi-writes are atomic or single-domain',
  });
}

if (path.resolve(process.argv[1] || '') === fileURLToPath(import.meta.url)) {
  const g = runCheck(process.argv[2] || process.cwd());
  for (const f of g.findings) console.log(`[${f.severity}] ${f.message} ${f.file}:${f.line}`);
  console.log(`atomicity: ${g.status} (${g.detail})`);
  process.exit(g.status === 'fail' ? 1 : 0);
}
