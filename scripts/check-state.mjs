// Authored by DotWin
// Gate (required): a build cannot be green unless STATE.md was actually written for this build and
// the build is tagged. This makes the low-context loop a precondition for green, not a suggestion:
//   - STATE.md must exist,
//   - it must carry at least one real (hyphenated) #tag (the greppable terms the next build needs),
//   - every such tag must resolve to a real BUILD_LOG / archive / memory entry (no dead pointers).
// The runner still stamps the managed status block; this gate proves the authored discipline
// (focus + tags) is present first, so "green" can never be printed over an empty or untagged state.

import { fileURLToPath } from 'node:url';
import path from 'node:path';
import { walk, readText, safeIsDir, safeExists } from './lib/scan.mjs';
import { finding, gate } from './lib/report.mjs';

const TAG_RE = /#[a-z0-9]+(?:-[a-z0-9]+)+/g; // real hyphenated tags; ignores the "#tag" placeholder

export function runCheck(root) {
  const findings = [];
  const statePath = path.join(root, 'STATE.md');
  if (!safeExists(statePath)) {
    findings.push(finding({ severity: 'high', file: 'STATE.md', message: 'STATE.md is missing: a green build must record current state', rule: 'state-missing' }));
    return gate('state', { status: 'fail', findings, detail: 'no STATE.md' });
  }

  const stateText = readText(statePath);
  const tags = [...new Set([...stateText.matchAll(TAG_RE)].map((m) => m[0]))];

  if (tags.length === 0) {
    findings.push(finding({ severity: 'high', file: 'STATE.md', message: 'STATE.md has no greppable #tag: tag the active task (Search / Relevant tags) so the next build can grep it', rule: 'state-untagged' }));
  }

  // The history haystack the tags must resolve into.
  let haystack = ['BUILD_LOG.md', 'BUILD_LOG_ARCHIVE.md', 'MEMORY_INDEX.md']
    .map((d) => (safeExists(path.join(root, d)) ? readText(path.join(root, d)) : '')).join('\n');
  const memDir = path.join(root, 'docs', 'memory');
  if (safeIsDir(memDir)) haystack += '\n' + walk(memDir, { exts: ['.md'] }).map((f) => readText(f)).join('\n');

  for (const tag of tags) {
    if (!haystack.includes(tag)) {
      const idx = stateText.indexOf(tag);
      const line = idx >= 0 ? stateText.slice(0, idx).split('\n').length : null;
      findings.push(finding({ severity: 'high', file: 'STATE.md', line, message: `Tag "${tag}" resolves to no BUILD_LOG/memory entry: write the tagged entry so the pointer leads somewhere`, rule: 'tag-dangling' }));
    }
  }

  const blocking = findings.filter((f) => f.severity === 'high' || f.severity === 'critical');
  return gate('state', {
    status: blocking.length ? 'fail' : 'pass',
    findings,
    detail: blocking.length ? `${blocking.length} state issue(s)` : `${tags.length} tag(s) resolve`,
  });
}

if (path.resolve(process.argv[1] || '') === fileURLToPath(import.meta.url)) {
  const g = runCheck(process.argv[2] || process.cwd());
  for (const f of g.findings) console.log(`[${f.severity}] ${f.message} ${f.file}${f.line ? ':' + f.line : ''}`);
  console.log(`state: ${g.status} (${g.detail})`);
  process.exit(g.status === 'fail' ? 1 : 0);
}
