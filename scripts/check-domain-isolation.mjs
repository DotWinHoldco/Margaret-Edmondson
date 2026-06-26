// Authored by DotWin
// Gate: domain cells stay isolated. A file in src/domains/<A> may import from another
// domain only through its published surface (public, manifest, types, events), never its
// internals. Replaces check-module-isolation. Targets src/domains (canonical) and falls
// back to src/modules (legacy) so an adopted app is never silently un-checked. Mirrored by
// the ESLint no-restricted-imports rule; the gate keeps the rule alive in CI regardless.

import { fileURLToPath } from 'node:url';
import path from 'node:path';
import { walk, readText, rel, safeIsDir } from './lib/scan.mjs';
import { blankBlockComments } from './lib/cells.mjs';
import { finding, gate } from './lib/report.mjs';

const CODE_EXTS = ['.ts', '.tsx', '.js', '.jsx'];
const PUBLIC_ENTRIES = ['public', 'manifest', 'types', 'events', 'index'];

// Prefer src/domains. Fall back to src/modules so apps not yet renamed are still checked,
// closing the old "skipped when no src/modules" gap that let a src/domains app pass unchecked.
export function cellsDir(root) {
  const domains = path.join(root, 'src', 'domains');
  if (safeIsDir(domains)) return { dir: domains, seg: 'domains' };
  const modules = path.join(root, 'src', 'modules');
  if (safeIsDir(modules)) return { dir: modules, seg: 'modules' };
  return null;
}

export function runCheck(root) {
  const cells = cellsDir(root);
  if (!cells) {
    return gate('domain-isolation', { required: false, status: 'skipped', findings: [], detail: 'no src/domains or src/modules directory' });
  }

  const findings = [];
  const files = walk(cells.dir, { exts: CODE_EXTS });
  const importRe = /from\s+['"]([^'"]+)['"]/g;
  const specRe = new RegExp(`(?:@/)?${cells.seg}/([a-z0-9_-]+)/(.+)`, 'i');

  for (const file of files) {
    const p = rel(root, file);
    const seg = p.split(/[/\\]/);
    const myCell = seg[seg.indexOf(cells.seg) + 1];
    const content = blankBlockComments(readText(file));
    let m;
    while ((m = importRe.exec(content))) {
      const upto = content.slice(0, m.index);
      const lineStart = upto.lastIndexOf('\n') + 1;
      const linePrefix = content.slice(lineStart, m.index);
      if (linePrefix.includes('//')) continue; // commented-out import
      const lineEndIdx = content.indexOf('\n', m.index);
      const fullLine = content.slice(lineStart, lineEndIdx < 0 ? content.length : lineEndIdx);
      if (fullLine.includes('dotwin-allow:domain-isolation')) continue;

      const mm = m[1].match(specRe);
      if (!mm) continue;
      const targetCell = mm[1];
      const subpath = mm[2].replace(/\.(ts|tsx|js|jsx)$/, '');
      const leaf = subpath.split('/').pop();
      if (targetCell !== myCell && !PUBLIC_ENTRIES.includes(leaf) && subpath !== '') {
        const line = upto.split('\n').length;
        findings.push(finding({ severity: 'high', file: p, line, message: `Cross-domain deep import: ${myCell} into ${cells.seg}/${targetCell}/${subpath} (use the domain's public surface)`, rule: 'cross-domain-import' }));
      }
    }
  }

  return gate('domain-isolation', {
    status: findings.length ? 'fail' : 'pass',
    findings,
    detail: findings.length ? `${findings.length} cross-domain import(s)` : `${cells.seg} isolated`,
  });
}

if (path.resolve(process.argv[1] || '') === fileURLToPath(import.meta.url)) {
  const g = runCheck(process.argv[2] || process.cwd());
  for (const f of g.findings) console.log(`[${f.severity}] ${f.message} ${f.file}:${f.line}`);
  console.log(`domain-isolation: ${g.status}`);
  process.exit(g.status === 'fail' ? 1 : 0);
}
