// Authored by DotWin
// Gate: every Server Action and Route Handler is an independently callable security boundary
// and must authorize itself — the proxy/layout is only an optimistic filter in Next.js 16.
// Evidence: a real exported action created accounts in any tenant with no auth check (audit H2).
//
// Heuristic (file-level): a Server Action file or API route that performs a DB mutation must
// contain an authorization guard. A webhook's signature check and a cron's secret check count
// as guards. Mark an intentional public write with `// dotwin-allow:public-write` + a reason.

import { fileURLToPath } from 'node:url';
import path from 'node:path';
import { walk, readText, rel, safeIsDir, scopeFilter } from './lib/scan.mjs';
import { finding, gate } from './lib/report.mjs';

const CODE_EXTS = ['.ts', '.tsx', '.js', '.jsx'];
const MUTATION = /\.(insert|update|delete|upsert)\s*\(|\.rpc\s*\(/;
const GUARD = /\brequire[A-Z]\w*|\bassert[A-Z]\w*|\bcan[A-Z]\w*\s*\(|authorize\s*\(|ensureAuth|getUser\s*\(|auth\.getUser|currentUser\s*\(|\bhasRole\b|\bisStaff\b|\bisAdmin\b/;
const WEBHOOK_GUARD = /constructEvent|verifyHeader|verifySignature|svix|timingSafeEqual|webhookSecret|getTenantWebhookSecret/;
const CRON_GUARD = /cron[_-]?auth|CRON_SECRET|requireCron|verifyCron/i;
const MITIGATION = /rateLimit|rateLimitGuard|safeParse|\.parse\(|zod/;

function fileIsServerActions(lines) {
  for (let i = 0; i < Math.min(lines.length, 6); i++) {
    const t = lines[i].trim().replace(/;$/, '');
    if (t === '' || t.startsWith('//') || t.startsWith('/*') || t.startsWith('*')) continue;
    return t === "'use server'" || t === '"use server"';
  }
  return false;
}
const isRouteFile = (p) => /[/\\]app[/\\].*[/\\]route\.(t|j)sx?$/.test(p) || /[/\\]route\.(t|j)sx?$/.test(p);
const isWebhook = (p) => /[/\\]webhooks?[/\\]/.test(p);
const isCron = (p) => /[/\\]cron[/\\]/.test(p);

export function runCheck(root, { scope } = {}) {
  const findings = [];
  const srcDir = path.join(root, 'src');
  const scanRoot = safeIsDir(srcDir) ? srcDir : root;
  if (!safeIsDir(scanRoot)) return gate('authz', { required: false, status: 'skipped', findings, detail: 'no source directory' });

  for (const file of scopeFilter(walk(scanRoot, { exts: CODE_EXTS }), root, scope)) {
    const p = rel(root, file);
    if (/\.(test|spec)\.(t|j)sx?$/.test(p)) continue;
    const content = readText(file);
    const routeFile = isRouteFile(p);
    const actionFile = fileIsServerActions(content.split(/\r?\n/));
    if (!routeFile && !actionFile) continue;
    if (!MUTATION.test(content)) continue; // only the mutating boundary is in scope
    if (/dotwin-allow:(authz|public-write)/.test(content)) continue;

    let guarded = GUARD.test(content);
    if (isWebhook(p)) guarded = guarded || WEBHOOK_GUARD.test(content);
    if (isCron(p)) guarded = guarded || CRON_GUARD.test(content);
    if (guarded) continue;

    const kind = routeFile ? 'Route handler' : 'Server Action file';
    if (MITIGATION.test(content)) {
      findings.push(finding({ severity: 'medium', file: p, message: `${kind} mutates with no authorization guard (has rate-limit/validation — confirm intentional public write or add a guard)`, rule: 'authz-public-write-review' }));
    } else {
      findings.push(finding({ severity: 'high', file: p, message: `${kind} performs a DB mutation with no authorization guard (independently callable boundary)`, rule: 'authz-missing-mutation' }));
    }
  }

  const blocking = findings.filter((f) => f.severity === 'high' || f.severity === 'critical');
  return gate('authz', {
    status: blocking.length ? 'fail' : 'pass',
    findings,
    detail: blocking.length ? `${blocking.length} unguarded mutation boundary(ies)` : 'mutation boundaries guarded',
  });
}

if (path.resolve(process.argv[1] || '') === fileURLToPath(import.meta.url)) {
  const g = runCheck(process.argv[2] || process.cwd());
  for (const f of g.findings.slice(0, 40)) console.log(`[${f.severity}] ${f.message} — ${f.file}`);
  if (g.findings.length > 40) console.log(`… ${g.findings.length - 40} more`);
  console.log(`authz: ${g.status} (${g.detail})`);
  process.exit(g.status === 'fail' ? 1 : 0);
}
