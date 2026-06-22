// Authored by DotWin
// Gate: modules stay isolated. A file in src/modules/<A> may not deep-import from
// another module's internals — cross-module use goes through the published surface
// (the module's index) or through events/views. This is also enforced by ESLint, but
// the gate keeps the rule alive in CI even if the lint config is bypassed.

import { fileURLToPath } from 'node:url';
import path from 'node:path';
import { walk, readText, rel, safeIsDir } from './lib/scan.mjs';
import { finding, gate } from './lib/report.mjs';

const CODE_EXTS = ['.ts', '.tsx', '.js', '.jsx'];
const PUBLIC_ENTRIES = ['index', 'manifest', 'types', 'public', 'events'];

export function runCheck(root) {
  const modulesDir = path.join(root, 'src', 'modules');
  if (!safeIsDir(modulesDir)) {
    return gate('module-isolation', { required: false, status: 'skipped', findings: [], detail: 'no src/modules directory' });
  }

  const findings = [];
  const files = walk(modulesDir, { exts: CODE_EXTS });
  const importRe = /from\s+['"]([^'"]+)['"]/g;

  for (const file of files) {
    const p = rel(root, file);
    const seg = p.split(/[/\\]/);
    const myModule = seg[seg.indexOf('modules') + 1];
    const content = readText(file);
    let m;
    while ((m = importRe.exec(content))) {
      const spec = m[1];
      const mm = spec.match(/(?:@\/)?modules\/([a-z0-9_-]+)\/(.+)/i);
      if (!mm) continue;
      const targetModule = mm[1];
      const subpath = mm[2].replace(/\.(ts|tsx|js|jsx)$/, '');
      const leaf = subpath.split('/').pop();
      if (targetModule !== myModule && !PUBLIC_ENTRIES.includes(leaf) && subpath !== '') {
        const line = content.slice(0, m.index).split('\n').length;
        findings.push(finding({ severity: 'high', file: p, line, message: `Cross-module deep import: ${myModule} → modules/${targetModule}/${subpath} (use the module's public surface)`, rule: 'cross-module-import' }));
      }
    }
  }

  return gate('module-isolation', {
    status: findings.length ? 'fail' : 'pass',
    findings,
    detail: findings.length ? `${findings.length} cross-module import(s)` : 'modules isolated',
  });
}

if (path.resolve(process.argv[1] || '') === fileURLToPath(import.meta.url)) {
  const g = runCheck(process.argv[2] || process.cwd());
  for (const f of g.findings) console.log(`[${f.severity}] ${f.message} — ${f.file}:${f.line}`);
  console.log(`module-isolation: ${g.status}`);
  process.exit(g.status === 'fail' ? 1 : 0);
}
