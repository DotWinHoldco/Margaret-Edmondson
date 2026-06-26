// Authored by DotWin
// Gate: events carry side effects, not invariants. An event-handler file (events.ts, a
// handlers/ dir, or *.handler.ts) may write only tables its owner labels `recoverable`.
// Writing a core (invariant) table from an event handler is the eventual-consistency seam
// Rule 1 forbids; it must live in a declared transaction owner instead.
// CLASS: CONDITIONAL, CLEAN once owners label their recoverable tables in the manifest.

import { fileURLToPath } from 'node:url';
import path from 'node:path';
import { loadDomains, ownerOf, isRecoverable, fromCalls, walk, readText, rel } from './lib/cells.mjs';
import { finding, gate } from './lib/report.mjs';

const CODE_EXTS = ['.ts', '.tsx', '.js', '.jsx'];

function isHandlerFile(p) {
  const base = p.split(/[/\\]/).pop();
  return base === 'events.ts' || base === 'events.tsx' || /\.handler\.(ts|tsx|js|jsx)$/.test(base) || /[/\\]handlers[/\\]/.test(p);
}

export function runCheck(root) {
  const { seg, dir, domains } = loadDomains(root);
  if (!seg) return gate('event-boundaries', { required: false, status: 'skipped', findings: [], detail: 'no src/domains or src/modules' });

  const findings = [];
  for (const file of walk(dir, { exts: CODE_EXTS })) {
    const p = rel(root, file);
    if (!isHandlerFile(p)) continue;
    const content = readText(file);
    for (const c of fromCalls(content, 'event-boundaries')) {
      if (!c.isWrite || c.table.startsWith('v_')) continue;
      if (isRecoverable(c.table, domains)) continue;
      const owner = ownerOf(c.table, domains);
      if (owner) {
        findings.push(finding({ severity: 'high', file: p, line: c.line, message: `Event handler writes core table ${c.table} (owned by ${owner}): events may write only recoverable tables, never an invariant. Move this into ${owner}'s transaction owner`, rule: 'event-writes-core' }));
      } else {
        findings.push(finding({ severity: 'medium', file: p, line: c.line, message: `Event handler writes ${c.table}, which is unclassified: label it recoverable in its owner manifest, or move it into a transaction owner`, rule: 'event-writes-unclassified' }));
      }
    }
  }

  const blocking = findings.filter((f) => f.severity === 'high' || f.severity === 'critical');
  return gate('event-boundaries', {
    status: blocking.length ? 'fail' : 'pass',
    findings,
    detail: blocking.length ? `${blocking.length} event write(s) to core tables` : 'events write only recoverable tables',
  });
}

if (path.resolve(process.argv[1] || '') === fileURLToPath(import.meta.url)) {
  const g = runCheck(process.argv[2] || process.cwd());
  for (const f of g.findings) console.log(`[${f.severity}] ${f.message} ${f.file}:${f.line}`);
  console.log(`event-boundaries: ${g.status} (${g.detail})`);
  process.exit(g.status === 'fail' ? 1 : 0);
}
