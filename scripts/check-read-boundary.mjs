// Authored by DotWin
// Gate: a domain reads another domain only through a published view (v_<key>_*) or its public
// surface, never a raw foreign table. A .from('<foreign-table>').select in domain D where the
// table is owned by another domain and is not a v_ view is a hidden-coupling violation.
// CLASS: CLEAN.

import { fileURLToPath } from 'node:url';
import path from 'node:path';
import { loadDomains, ownerOf, fromCalls, walk, readText, rel } from './lib/cells.mjs';
import { finding, gate } from './lib/report.mjs';

const CODE_EXTS = ['.ts', '.tsx', '.js', '.jsx'];

export function runCheck(root) {
  const { seg, dir, domains } = loadDomains(root);
  if (!seg) return gate('read-boundary', { required: false, status: 'skipped', findings: [], detail: 'no src/domains or src/modules' });

  const findings = [];
  for (const file of walk(dir, { exts: CODE_EXTS })) {
    const p = rel(root, file);
    const parts = p.split(/[/\\]/);
    const myDomain = parts[parts.indexOf(seg) + 1];
    const content = readText(file);
    for (const c of fromCalls(content, 'read-boundary')) {
      if (c.isWrite || c.method !== 'select' || c.table.startsWith('v_')) continue;
      const owner = ownerOf(c.table, domains);
      if (owner && owner !== myDomain) {
        findings.push(finding({ severity: 'high', file: p, line: c.line, message: `${myDomain} reads ${owner}'s raw table ${c.table}: cross-domain reads must go through a published v_${owner}_* view or ${owner}'s public surface`, rule: 'cross-domain-read' }));
      }
    }
  }

  const blocking = findings.filter((f) => f.severity === 'high' || f.severity === 'critical');
  return gate('read-boundary', {
    status: blocking.length ? 'fail' : 'pass',
    findings,
    detail: blocking.length ? `${blocking.length} cross-domain raw read(s)` : 'cross-domain reads go through views',
  });
}

if (path.resolve(process.argv[1] || '') === fileURLToPath(import.meta.url)) {
  const g = runCheck(process.argv[2] || process.cwd());
  for (const f of g.findings) console.log(`[${f.severity}] ${f.message} ${f.file}:${f.line}`);
  console.log(`read-boundary: ${g.status} (${g.detail})`);
  process.exit(g.status === 'fail' ? 1 : 0);
}
