// Authored by DotWin
// Gate: written code carries intent documentation (the "why", not just the "what").
//
// Layered enforcement:
//   BLOCKING (high): API route handlers (app/**/route.ts) and Server Actions
//     ('use server' exports). These are the published API and must be documented.
//   ADVISORY (medium): every other exported function/component, each domain's README,
//     and the project technical/API docs directory. Promote to blocking with --docs-strict
//     (new spawns default to strict).
//
// "Documented" = an intent comment (JSDoc /** */ or // ...) immediately above the export.
// Escape one symbol with `// dotwin-allow:undocumented` and a reason.

import { fileURLToPath } from 'node:url';
import fs from 'node:fs';
import path from 'node:path';
import { walk, readText, rel, safeIsDir, safeExists, scopeFilter } from './lib/scan.mjs';
import { cellsDir } from './lib/cells.mjs';
import { finding, gate } from './lib/report.mjs';

const CODE_EXTS = ['.ts', '.tsx', '.js', '.jsx'];
const SCAN_DIRS = ['src', 'app', 'lib', 'components', 'pages', 'server'];
const HTTP = ['GET', 'POST', 'PUT', 'PATCH', 'DELETE', 'HEAD', 'OPTIONS'];

const RE_FN = /^export\s+(?:default\s+)?(?:async\s+)?function\s+([A-Za-z0-9_]+)?/;
const RE_CONST_FN = /^export\s+(?:default\s+)?const\s+([A-Za-z0-9_]+)\s*(?::[^=]+)?=\s*(?:async\s+)?(?:\(|function\b|[A-Za-z0-9_]+\s*=>)/;
const RE_ROUTE = new RegExp(`^export\\s+(?:async\\s+)?(?:function\\s+|const\\s+)(${HTTP.join('|')})\\b`);

function isRouteFile(p) {
  return /[/\\]app[/\\].*[/\\]route\.(t|j)sx?$/.test(p) || /[/\\]route\.(t|j)sx?$/.test(p);
}
function skipFile(p) {
  return /\.d\.ts$/.test(p) || /\.(test|spec)\.(t|j)sx?$/.test(p) ||
    /database\.types\.|\.generated\.|[/\\]generated[/\\]/.test(p) || /[/\\]types[/\\]/.test(p);
}
function fileIsServerActions(lines) {
  for (let i = 0; i < Math.min(lines.length, 6); i++) {
    const t = lines[i].trim().replace(/;$/, '');
    if (t === '' || t.startsWith('//') || t.startsWith('/*') || t.startsWith('*')) continue;
    return t === "'use server'" || t === '"use server"';
  }
  return false;
}
// True if the nearest meaningful line above the export is a comment (allows one blank gap,
// skips decorators).
function hasDocAbove(lines, idx) {
  let j = idx - 1;
  let blanks = 0;
  while (j >= 0) {
    const t = lines[j].trim();
    if (t === '') { if (++blanks > 1) return false; j--; continue; }
    if (t.startsWith('@')) { j--; continue; }
    return t.endsWith('*/') || t.startsWith('//') || t.startsWith('*') || t.startsWith('/*');
  }
  return false;
}

export function runCheck(root, { strict = false, scope } = {}) {
  const findings = [];
  const exportSev = strict ? 'high' : 'medium';
  const docSev = strict ? 'high' : 'medium';

  const files = [];
  const seen = new Set();
  for (const d of SCAN_DIRS) {
    if (!safeIsDir(path.join(root, d))) continue;
    for (const f of walk(path.join(root, d), { exts: CODE_EXTS })) {
      if (seen.has(f)) continue;
      seen.add(f);
      files.push(f);
    }
  }

  for (const file of scopeFilter(files, root, scope)) {
    const p = rel(root, file);
    if (skipFile(p)) continue;
    const lines = readText(file).split(/\r?\n/);
    const routeFile = isRouteFile(p);
    const actionFile = fileIsServerActions(lines);

    for (let i = 0; i < lines.length; i++) {
      const line = lines[i];
      const t = line.trim();
      if (!t.startsWith('export')) continue;
      if (line.includes('dotwin-allow:undocumented')) continue;

      let kind = null;
      let sev = null;
      let rule = null;
      if (routeFile && RE_ROUTE.test(t)) { kind = 'API route handler'; sev = 'high'; rule = 'doc-api-route'; }
      else if (RE_FN.test(t) || RE_CONST_FN.test(t)) {
        if (actionFile) { kind = 'Server Action'; sev = 'high'; rule = 'doc-server-action'; }
        else { kind = 'exported function/component'; sev = exportSev; rule = 'doc-export'; }
      }
      if (!kind || hasDocAbove(lines, i)) continue;

      const name = (t.match(/(?:function|const)\s+([A-Za-z0-9_]+)/) || [])[1] || '(default)';
      findings.push(finding({ severity: sev, file: p, line: i + 1, message: `${kind} "${name}" has no intent doc comment`, rule }));
    }
  }

  // Domain READMEs (intent / technical doc per domain). Targets src/domains, falls back to
  // src/modules (legacy), so adopted apps not yet renamed are still checked.
  const cells = cellsDir(root);
  if (!scope && cells) {
    for (const e of fs.readdirSync(cells.dir, { withFileTypes: true })) {
      if (e.isDirectory() && !safeExists(path.join(cells.dir, e.name, 'README.md'))) {
        findings.push(finding({ severity: docSev, file: `src/${cells.seg}/${e.name}`, message: `Domain "${e.name}" has no README.md (intent / technical doc)`, rule: 'doc-domain-readme' }));
      }
    }
  }

  // Project technical + API documentation surfaces.
  const hasTechDocs = ['docs', 'docs/technical'].some((d) => safeIsDir(path.join(root, d)));
  const hasApiDocs = ['docs/api', 'API.md', 'docs/API.md'].some((d) => safeExists(path.join(root, d)));
  if (!scope && !hasTechDocs) findings.push(finding({ severity: docSev, file: 'docs/', message: 'No technical documentation directory (docs/)', rule: 'doc-tech-dir' }));
  if (!scope && !hasApiDocs) findings.push(finding({ severity: docSev, file: 'docs/api', message: 'No API documentation (docs/api/ or API.md)', rule: 'doc-api-dir' }));

  const blocking = findings.filter((f) => f.severity === 'high');
  return gate('docs', {
    status: blocking.length ? 'fail' : 'pass',
    findings,
    detail: `${findings.length} undocumented (${blocking.length} blocking${strict ? ', strict' : ''})`,
  });
}

if (path.resolve(process.argv[1] || '') === fileURLToPath(import.meta.url)) {
  const strict = process.argv.includes('--docs-strict') || process.env.DOTWIN_DOCS_STRICT === '1';
  const rootArg = process.argv.slice(2).find((a) => !a.startsWith('--'));
  const g = runCheck(rootArg || process.cwd(), { strict });
  for (const f of g.findings.slice(0, 40)) console.log(`[${f.severity}] ${f.message} ${f.file}${f.line ? ':' + f.line : ''}`);
  if (g.findings.length > 40) console.log(`... ${g.findings.length - 40} more`);
  console.log(`docs: ${g.status} (${g.detail})`);
  process.exit(g.status === 'fail' ? 1 : 0);
}
