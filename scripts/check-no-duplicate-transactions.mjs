// Authored by DotWin
// Gate: the same multi-table write set should not be implemented in more than one place.
// When two or more files write the identical set of 2+ tables, that invariant is probably
// duplicated and will drift. Semantic duplication is not mechanically decidable, so this gate
// does NOT hard-fail: it BLOCKS pending acknowledgment. Consolidate under one declared
// transaction owner, or acknowledge a legitimate case with dotwin-allow:duplicate-transaction.
// CLASS: HEURISTIC (block-pending-ack, never a silent auto-fail).

import { fileURLToPath } from 'node:url';
import path from 'node:path';
import { loadDomains, fromCalls, walk, readText, rel } from './lib/cells.mjs';
import { finding, gate } from './lib/report.mjs';

const CODE_EXTS = ['.ts', '.tsx', '.js', '.jsx'];

export function runCheck(root) {
  const { seg, dir } = loadDomains(root);
  if (!seg) return gate('no-duplicate-transactions', { required: false, status: 'skipped', findings: [], detail: 'no src/domains or src/modules' });

  const sig = new Map(); // "tableA+tableB" -> [{ file, line }]
  for (const file of walk(dir, { exts: CODE_EXTS })) {
    const content = readText(file);
    if (content.includes('dotwin-allow:duplicate-transaction')) continue;
    const writes = fromCalls(content).filter((c) => c.isWrite && !c.table.startsWith('v_'));
    const tables = [...new Set(writes.map((w) => w.table))].sort();
    if (tables.length < 2) continue;
    const key = tables.join('+');
    if (!sig.has(key)) sig.set(key, []);
    sig.get(key).push({ file: rel(root, file), line: writes[0].line });
  }

  const findings = [];
  for (const [key, sites] of sig) {
    if (sites.length >= 2) {
      for (const s of sites) {
        findings.push(finding({ severity: 'medium', file: s.file, line: s.line, message: `Possible duplicated transaction: write set {${key.replace(/\+/g, ', ')}} appears in ${sites.length} files. Consolidate under one declared transaction owner, or acknowledge with dotwin-allow:duplicate-transaction`, rule: 'duplicate-transaction' }));
      }
    }
  }

  return gate('no-duplicate-transactions', {
    status: findings.length ? 'blocked' : 'pass',
    findings,
    detail: findings.length ? `${findings.length} site(s) pending review` : 'no duplicated multi-table writes',
  });
}

if (path.resolve(process.argv[1] || '') === fileURLToPath(import.meta.url)) {
  const g = runCheck(process.argv[2] || process.cwd());
  for (const f of g.findings) console.log(`[${f.severity}] ${f.message} ${f.file}:${f.line}`);
  console.log(`no-duplicate-transactions: ${g.status} (${g.detail})`);
  process.exit(['fail', 'blocked'].includes(g.status) ? 1 : 0);
}
