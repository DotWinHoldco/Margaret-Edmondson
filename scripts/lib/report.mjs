// Authored by DotWin
// Result aggregation, status computation, and STATE/BUILD_LOG writing for build-check.
// The STATE.md build status and BUILD_LOG verification entries may ONLY be written
// here, by the runner, after gates actually run. Doctrine executable: "green" is
// never hand-typed.

import fs from 'node:fs';
import path from 'node:path';

export const SEV = { critical: 3, high: 2, medium: 1, low: 0 };

// A single problem found by a gate.
export function finding({ severity = 'high', file = null, line = null, message, rule = null }) {
  return { severity, file, line, message, rule };
}

// A gate is one check. status: 'pass' | 'fail' | 'blocked' | 'skipped'.
export function gate(name, { required = true, status, findings = [], detail = '' }) {
  return { name, required, status, findings, detail };
}

/**
 * Compute the overall framework build status from gate results.
 * Returns one of: failed | blocked | passing-partial | green
 * (production-candidate / enterprise-ready are layered on by the caller).
 */
export function computeStatus(gates) {
  const required = gates.filter((g) => g.required);
  if (required.some((g) => g.status === 'fail')) return 'failed';
  if (required.some((g) => g.status === 'blocked')) return 'blocked';
  if (required.some((g) => g.status === 'skipped')) return 'passing-partial';
  if (required.length && required.every((g) => g.status === 'pass')) return 'green';
  return 'in-progress';
}

const MARK = {
  red: (s) => `\x1b[31m${s}\x1b[0m`,
  green: (s) => `\x1b[32m${s}\x1b[0m`,
  yellow: (s) => `\x1b[33m${s}\x1b[0m`,
  dim: (s) => `\x1b[2m${s}\x1b[0m`,
  bold: (s) => `\x1b[1m${s}\x1b[0m`,
};

const GLYPH = { pass: '✓', fail: '✗', blocked: '■', skipped: '·' };

export function printReport(report) {
  const { gates, status } = report;
  console.log('');
  console.log(MARK.bold('  DotWin build-check'));
  console.log(MARK.dim('  ' + report.timestamp + (report.profile ? `  ·  profile: ${report.profile}` : '') + (report.mode ? `  ·  mode: ${report.mode}` : '')));
  console.log(MARK.dim('  Rule 1: ACID invariants outrank module purity'));
  console.log('');
  for (const g of gates) {
    const tag =
      g.status === 'pass' ? MARK.green(GLYPH.pass) :
      g.status === 'fail' ? MARK.red(GLYPH.fail) :
      g.status === 'blocked' ? MARK.yellow(GLYPH.blocked) :
      MARK.dim(GLYPH.skipped);
    const req = g.required ? '' : MARK.dim(' (optional)');
    console.log(`  ${tag} ${g.name}${req}${g.detail ? MARK.dim('  ·  ' + g.detail) : ''}`);
    for (const f of g.findings.slice(0, 12)) {
      const loc = f.file ? `${f.file}${f.line ? ':' + f.line : ''}` : '';
      console.log(`      ${MARK.dim('[' + f.severity + ']')} ${f.message}${loc ? '  ' + MARK.dim(loc) : ''}`);
    }
    if (g.findings.length > 12) console.log(MARK.dim(`      … ${g.findings.length - 12} more`));
  }
  console.log('');
  const label =
    status === 'green' ? MARK.green(MARK.bold('GREEN')) :
    status === 'production-candidate' ? MARK.green(MARK.bold('PRODUCTION-CANDIDATE')) :
    status === 'enterprise-ready' ? MARK.green(MARK.bold('ENTERPRISE-READY')) :
    status === 'failed' ? MARK.red(MARK.bold('FAILED')) :
    status === 'blocked' ? MARK.yellow(MARK.bold('BLOCKED')) :
    MARK.yellow(MARK.bold(status.toUpperCase()));
  console.log(`  status: ${label}`);
  console.log('');
}

export function writeReport(root, report) {
  const dir = path.join(root, 'docs', 'build-checks');
  fs.mkdirSync(dir, { recursive: true });
  const stamp = report.timestamp.replace(/[:.]/g, '-');
  fs.writeFileSync(path.join(dir, `${stamp}.json`), JSON.stringify(report, null, 2));
  fs.writeFileSync(path.join(dir, 'latest.json'), JSON.stringify(report, null, 2));
}

/**
 * Rewrite ONLY the managed status block in STATE.md (between markers).
 * Never touches the human-written sections.
 */
export function updateState(root, report) {
  const file = path.join(root, 'STATE.md');
  if (!fs.existsSync(file)) return false;
  const begin = '<!-- dotwin:build-status:begin -->';
  const end = '<!-- dotwin:build-status:end -->';
  const failed = report.gates.filter((g) => g.required && g.status === 'fail').map((g) => g.name);
  const skipped = report.gates.filter((g) => g.required && g.status === 'skipped').map((g) => g.name);
  const block = [
    begin,
    '## Current Build Status',
    '',
    `Status: ${report.status}`,
    `Last verified: ${report.timestamp}`,
    `Last command: build-check${report.profile ? ' --' + report.profile : ''}`,
    `Gates passed: ${report.summary.passed}/${report.summary.requiredTotal} required`,
    failed.length ? `Failing gates: ${failed.join(', ')}` : 'Failing gates: none',
    skipped.length ? `Unrun required gates: ${skipped.join(', ')}` : 'Unrun required gates: none',
    end,
  ].join('\n');

  let text = fs.readFileSync(file, 'utf8');
  if (text.includes(begin) && text.includes(end)) {
    text = text.replace(new RegExp(`${begin}[\\s\\S]*?${end}`), block);
  } else {
    // Insert after the first H1 if markers are missing.
    text = text.replace(/(^#.*\n)/, `$1\n${block}\n`);
  }
  fs.writeFileSync(file, text);
  return true;
}

/**
 * Prepend a newest-first verification entry to BUILD_LOG.md and archive overflow.
 */
export function appendLog(root, report, { cap = 150 } = {}) {
  const file = path.join(root, 'BUILD_LOG.md');
  if (!fs.existsSync(file)) return false;
  const failed = report.gates.filter((g) => g.required && g.status === 'fail').map((g) => g.name);
  const entry = [
    `### [${report.timestamp}] #build-check`,
    `Status: ${report.status}`,
    `Verified: ${report.summary.passed}/${report.summary.requiredTotal} required gates`,
    failed.length ? `Failing: ${failed.join(', ')}` : `Failing: none`,
    '',
  ].join('\n');

  const marker = '<!-- dotwin:log-entries -->';
  let text = fs.readFileSync(file, 'utf8');
  if (text.includes(marker)) {
    text = text.replace(marker, `${marker}\n\n${entry}`);
  } else {
    text += `\n\n${entry}`;
  }

  // Cap: if active log exceeds `cap` lines, archive the oldest entries, splitting only on
  // entry-header boundaries so an entry and its @anchor are never orphaned mid-block.
  const lines = text.split('\n');
  if (lines.length > cap) {
    const headers = [];
    lines.forEach((l, i) => { if (/^### \[/.test(l)) headers.push(i); });
    if (headers.length > 3) {
      const cut = headers[Math.ceil((headers.length * 2) / 3)] ?? lines.length;
      const overflow = lines.slice(cut).join('\n');
      const arch = path.join(root, 'BUILD_LOG_ARCHIVE.md');
      const prior = fs.existsSync(arch) ? fs.readFileSync(arch, 'utf8') : '# Build Log Archive\n\nAuthored by DotWin\n';
      fs.writeFileSync(arch, prior + '\n' + overflow);
      text = lines.slice(0, cut).join('\n') + '\n';
    }
  }
  fs.writeFileSync(file, text);
  return true;
}
