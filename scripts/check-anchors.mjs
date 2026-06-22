// Authored by DotWin
// Gate (advisory): the BUILD_LOG is a grep index, so its anchors must resolve.
// Every `@anchor:` referenced in BUILD_LOG.md / STATE.md must exist as a real
// `@anchor:` token in source, and source anchors must be unique. Evidence: the doctrine
// "never trust the log alone — confirm file:line anchors still exist" only works if
// something actually confirms it.

import { fileURLToPath } from 'node:url';
import path from 'node:path';
import { walk, readText, rel, safeIsDir, safeExists } from './lib/scan.mjs';
import { finding, gate } from './lib/report.mjs';

const ANCHOR_RE = /@anchor:\s*([a-z0-9_.\-]+)/gi;

export function runCheck(root) {
  const findings = [];
  const srcDir = path.join(root, 'src');
  const scanRoot = safeIsDir(srcDir) ? srcDir : root;

  // Collect source anchors.
  const sourceAnchors = new Map(); // token -> count
  for (const file of walk(scanRoot, { exts: ['.ts', '.tsx', '.js', '.jsx', '.sql'] })) {
    const content = readText(file);
    let m;
    while ((m = ANCHOR_RE.exec(content))) {
      const t = m[1].toLowerCase();
      sourceAnchors.set(t, (sourceAnchors.get(t) || 0) + 1);
    }
  }
  for (const [t, n] of sourceAnchors) {
    if (n > 1) findings.push(finding({ severity: 'medium', file: 'src', message: `Duplicate @anchor token "${t}" (${n} occurrences)`, rule: 'anchor-dupe' }));
  }

  // Verify references in docs resolve.
  for (const doc of ['BUILD_LOG.md', 'STATE.md']) {
    const f = path.join(root, doc);
    if (!safeExists(f)) continue;
    const content = readText(f);
    let m;
    while ((m = ANCHOR_RE.exec(content))) {
      const t = m[1].toLowerCase();
      if (!sourceAnchors.has(t)) {
        const line = content.slice(0, m.index).split('\n').length;
        findings.push(finding({ severity: 'medium', file: doc, line, message: `@anchor "${t}" referenced in ${doc} not found in source`, rule: 'anchor-dangling' }));
      }
    }
  }

  // Advisory gate: never blocks the build, but surfaces drift.
  return gate('anchors', {
    required: false,
    status: findings.length ? 'fail' : 'pass',
    findings,
    detail: `${sourceAnchors.size} source anchor(s)`,
  });
}

if (path.resolve(process.argv[1] || '') === fileURLToPath(import.meta.url)) {
  const g = runCheck(process.argv[2] || process.cwd());
  for (const f of g.findings) console.log(`[${f.severity}] ${f.message} — ${f.file}${f.line ? ':' + f.line : ''}`);
  console.log(`anchors: ${g.status}`);
  process.exit(0);
}
