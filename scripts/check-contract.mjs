// Authored by DotWin
// Gate: the frozen domain contract is enforced by the build, not by discipline.
// Reads each domain's manifest and validates the contract graph:
//   - every consumed event has a producer (no dangling consume),
//   - dependsOn references a real domain and forms no cycle,
//   - a domain never deep-imports another domain's internals (only its published surface),
//   - the kernel imports NO domain (the thinness invariant).
// Targets src/domains (canonical); falls back to src/modules (legacy) so an adopted app is
// never silently un-checked. Non-cell projects are scored by the audit phase, not failed here.

import { fileURLToPath } from 'node:url';
import fs from 'node:fs';
import path from 'node:path';
import { walk, readText, rel, safeIsDir } from './lib/scan.mjs';
import { blankComments } from './lib/cells.mjs';
import { finding, gate } from './lib/report.mjs';

const PUBLIC_ENTRIES = new Set(['index', 'types', 'events', 'manifest', 'public']);
// The kernel = the thin foundation. It may never import a domain.
const KERNEL_PATHS = ['src/kernel', 'src/lib/supabase', 'src/lib/auth', 'src/lib/events', 'src/lib/env', 'src/lib/errors', 'src/proxy.ts'];

function cellsDir(root) {
  const domains = path.join(root, 'src', 'domains');
  if (safeIsDir(domains)) return { dir: domains, seg: 'domains' };
  const modules = path.join(root, 'src', 'modules');
  if (safeIsDir(modules)) return { dir: modules, seg: 'modules' };
  return null;
}

function arr(text, key) {
  const m = text.match(new RegExp(`${key}\\s*:\\s*\\[([\\s\\S]*?)\\]`));
  return m ? [...m[1].matchAll(/['"]([^'"]+)['"]/g)].map((x) => x[1]) : [];
}
function str(text, key) {
  const m = text.match(new RegExp(`${key}\\s*:\\s*['"]([^'"]+)['"]`));
  return m ? m[1] : null;
}
function parseManifest(text) {
  const pub = text.match(/publishes\s*:\s*\{([\s\S]*?)\}/);
  return {
    key: str(text, 'key'),
    tablePrefix: str(text, 'tablePrefix'),
    emits: arr(text, 'emits'),
    consumes: arr(text, 'consumes'),
    dependsOn: arr(text, 'dependsOn'),
    views: pub ? arr(pub[1], 'views') : [],
    rpcs: pub ? arr(pub[1], 'rpcs') : [],
  };
}

export function runCheck(root) {
  const cells = cellsDir(root);
  const findings = [];
  if (!cells) {
    return gate('contract', { required: false, status: 'skipped', findings, detail: 'no src/domains or src/modules (score via audit)' });
  }
  const { dir: cellsRoot, seg } = cells;

  const dirs = fs.readdirSync(cellsRoot, { withFileTypes: true }).filter((e) => e.isDirectory()).map((e) => e.name);
  const manifests = {};
  for (const key of dirs) {
    const mPath = path.join(cellsRoot, key, 'manifest.ts');
    if (!fs.existsSync(mPath)) {
      findings.push(finding({ severity: 'medium', file: `src/${seg}/${key}`, message: `Domain "${key}" has no manifest.ts (no declared contract)`, rule: 'contract-missing-manifest' }));
      continue;
    }
    manifests[key] = parseManifest(readText(mPath));
  }

  const producers = new Set();
  for (const m of Object.values(manifests)) for (const e of m.emits) producers.add(e);

  for (const [key, m] of Object.entries(manifests)) {
    // Dangling consume: an event this domain listens for that nobody emits.
    for (const c of m.consumes) {
      if (!producers.has(c)) {
        findings.push(finding({ severity: 'high', file: `src/${seg}/${key}/manifest.ts`, message: `Domain "${key}" consumes "${c}" but no domain emits it (broken contract)`, rule: 'contract-dangling-consume' }));
      }
    }
    // dependsOn references a real domain.
    for (const d of m.dependsOn) {
      if (!manifests[d] && !dirs.includes(d)) {
        findings.push(finding({ severity: 'medium', file: `src/${seg}/${key}/manifest.ts`, message: `Domain "${key}" dependsOn "${d}" which is not a known domain`, rule: 'contract-unknown-dependency' }));
      }
    }
  }

  // Dependency cycles.
  const adj = Object.fromEntries(Object.entries(manifests).map(([k, m]) => [k, m.dependsOn.filter((d) => manifests[d])]));
  const state = {};
  const dfs = (n, stack) => {
    state[n] = 1;
    for (const next of adj[n] || []) {
      if (state[next] === 1) {
        findings.push(finding({ severity: 'high', file: `src/${seg}`, message: `Domain dependency cycle: ${[...stack, next].join(' -> ')}`, rule: 'contract-cycle' }));
      } else if (!state[next]) dfs(next, [...stack, next]);
    }
    state[n] = 2;
  };
  for (const k of Object.keys(adj)) if (!state[k]) dfs(k, [k]);

  // Kernel must import no domain.
  for (const kp of KERNEL_PATHS) {
    const abs = path.join(root, kp);
    const files = safeIsDir(abs) ? walk(abs, { exts: ['.ts', '.tsx'] }) : (fs.existsSync(abs) ? [abs] : []);
    for (const f of files) {
      if (/from\s+['"]@?\/?(?:modules|domains)\//.test(blankComments(readText(f)))) {
        findings.push(finding({ severity: 'critical', file: rel(root, f), message: 'Kernel imports a domain: the kernel must stay thin and domain-agnostic', rule: 'contract-kernel-imports-domain' }));
      }
    }
  }

  // No domain deep-imports another domain's internals (only its published surface).
  for (const key of dirs) {
    for (const f of walk(path.join(cellsRoot, key), { exts: ['.ts', '.tsx'] })) {
      const content = blankComments(readText(f));
      for (const im of content.matchAll(/from\s+['"](?:@\/)?(?:modules|domains)\/([a-z0-9_-]+)\/([^'"]+)['"]/gi)) {
        const other = im[1];
        const leaf = im[2].replace(/\.(ts|tsx)$/, '').split('/').pop();
        if (other !== key && !PUBLIC_ENTRIES.has(leaf)) {
          const line = content.slice(0, im.index).split('\n').length;
          findings.push(finding({ severity: 'high', file: rel(root, f), line, message: `Contract break: ${key} imports internals of ${other} (use its published surface)`, rule: 'contract-cross-domain-import' }));
        }
      }
    }
  }

  const blocking = findings.filter((f) => f.severity === 'high' || f.severity === 'critical');
  return gate('contract', {
    status: blocking.length ? 'fail' : 'pass',
    findings,
    detail: `${dirs.length} ${seg}, ${Object.keys(manifests).length} with manifest; ${blocking.length} contract violation(s)`,
  });
}

if (path.resolve(process.argv[1] || '') === fileURLToPath(import.meta.url)) {
  const g = runCheck(process.argv[2] || process.cwd());
  for (const f of g.findings.slice(0, 50)) console.log(`[${f.severity}] ${f.message} ${f.file}${f.line ? ':' + f.line : ''}`);
  if (g.findings.length > 50) console.log(`... ${g.findings.length - 50} more`);
  console.log(`contract: ${g.status} (${g.detail})`);
  process.exit(g.status === 'fail' ? 1 : 0);
}
