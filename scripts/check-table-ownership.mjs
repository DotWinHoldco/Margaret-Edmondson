// Authored by DotWin
// Gate: a domain writes only the tables it owns. A .from('<table>').insert|update|delete|upsert
// in domain D is a violation when <table> is owned by another domain. Cross-domain writes must
// go through the owner's declared RPC (which appears as .rpc(...), not .from(...)). This is the
// write-boundary enforcer; it is backed at the database by RLS + per-domain roles.
// CLASS: CLEAN (TS layer). Blind spots (dynamic table names, writes inside SQL) are closed by RLS.

import { fileURLToPath } from 'node:url';
import path from 'node:path';
import { loadDomains, ownerOf, fromCalls, walk, readText, rel } from './lib/cells.mjs';
import { finding, gate } from './lib/report.mjs';

const CODE_EXTS = ['.ts', '.tsx', '.js', '.jsx'];

export function runCheck(root) {
  const { seg, dir, domains } = loadDomains(root);
  if (!seg) return gate('table-ownership', { required: false, status: 'skipped', findings: [], detail: 'no src/domains or src/modules' });

  const findings = [];
  for (const file of walk(dir, { exts: CODE_EXTS })) {
    const p = rel(root, file);
    const parts = p.split(/[/\\]/);
    const myDomain = parts[parts.indexOf(seg) + 1];
    const content = readText(file);
    for (const c of fromCalls(content, 'table-ownership')) {
      if (!c.isWrite || c.table.startsWith('v_')) continue;
      const owner = ownerOf(c.table, domains);
      if (owner && owner !== myDomain) {
        findings.push(finding({ severity: 'high', file: p, line: c.line, message: `${myDomain} writes ${c.table} (owned by ${owner}): cross-domain writes must go through ${owner}'s declared RPC, not .${c.method}()`, rule: 'table-cross-domain-write' }));
      } else if (!owner) {
        findings.push(finding({ severity: 'medium', file: p, line: c.line, message: `${myDomain} writes ${c.table}, which no domain owns by prefix (shared or unprefixed table: assign an owner)`, rule: 'table-ownership-unknown' }));
      }
    }
  }

  const blocking = findings.filter((f) => f.severity === 'high' || f.severity === 'critical');
  return gate('table-ownership', {
    status: blocking.length ? 'fail' : 'pass',
    findings,
    detail: blocking.length ? `${blocking.length} cross-domain write(s)` : 'writes stay within owned tables',
  });
}

if (path.resolve(process.argv[1] || '') === fileURLToPath(import.meta.url)) {
  const g = runCheck(process.argv[2] || process.cwd());
  for (const f of g.findings) console.log(`[${f.severity}] ${f.message} ${f.file}:${f.line}`);
  console.log(`table-ownership: ${g.status} (${g.detail})`);
  process.exit(g.status === 'fail' ? 1 : 0);
}
