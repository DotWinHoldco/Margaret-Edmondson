// Authored by DotWin
// Gate: the service-role Supabase client never reaches client code, and webhook/cron
// routes use the service-role client (not the anon/cookie client).
// Evidence: a real project's webhook + cron routes used the anon client, so every
// write silently failed under RLS — the money path was broken in production.

import { fileURLToPath } from 'node:url';
import path from 'node:path';
import { walk, readText, rel, safeIsDir, scopeFilter } from './lib/scan.mjs';
import { finding, gate } from './lib/report.mjs';

const CODE_EXTS = ['.ts', '.tsx', '.js', '.jsx'];

export function runCheck(root, { scope } = {}) {
  const findings = [];
  const srcDir = path.join(root, 'src');
  const scanRoot = safeIsDir(srcDir) ? srcDir : root;
  const files = walk(scanRoot, { exts: CODE_EXTS });

  for (const file of scopeFilter(files, root, scope)) {
    const content = readText(file);
    const p = rel(root, file);
    const isClient = /^['"]use client['"]/m.test(content) || /[/\\]components[/\\]/.test(p);
    const refsServiceRole = /SUPABASE_SERVICE_ROLE_KEY|createServiceClient|service[_-]?role|supabase\/admin/i.test(content);

    // 1) Service role must never be in client code.
    if (isClient && refsServiceRole && !content.includes('dotwin-allow:service-in-client')) {
      findings.push(finding({ severity: 'critical', file: p, message: 'Service-role client / key referenced in client-side code', rule: 'service-role-client' }));
    }
    // 2) A public env var must never expose the service role key.
    if (/NEXT_PUBLIC_[A-Z_]*SERVICE_ROLE/.test(content)) {
      findings.push(finding({ severity: 'critical', file: p, message: 'Service role key exposed via NEXT_PUBLIC_ env var', rule: 'service-role-public-env' }));
    }
    // 3) Webhook/cron handlers must use the service-role client (RLS bypass needed).
    const isWebhookOrCron = /[/\\](webhooks?|cron)[/\\]/.test(p) && /route\.(t|j)sx?$/.test(p);
    if (isWebhookOrCron) {
      const usesService = /createServiceClient|supabase\/admin|SUPABASE_SERVICE_ROLE_KEY/.test(content);
      const usesAnon = /createBrowserClient|createServerClient|supabase\/server|supabase\/client/.test(content);
      if (usesAnon && !usesService && !content.includes('dotwin-allow:webhook-anon')) {
        findings.push(finding({ severity: 'high', file: p, message: 'Webhook/cron route uses anon/cookie client — writes will fail under RLS; use the service-role client', rule: 'webhook-anon-client' }));
      }
    }
  }

  const blocking = findings.filter((f) => f.severity === 'critical' || f.severity === 'high');
  return gate('supabase-boundaries', {
    status: blocking.length ? 'fail' : 'pass',
    findings,
    detail: blocking.length ? `${blocking.length} boundary violation(s)` : 'client boundaries respected',
  });
}

if (path.resolve(process.argv[1] || '') === fileURLToPath(import.meta.url)) {
  const g = runCheck(process.argv[2] || process.cwd());
  for (const f of g.findings) console.log(`[${f.severity}] ${f.message} — ${f.file}`);
  console.log(`supabase-boundaries: ${g.status}`);
  process.exit(g.status === 'fail' ? 1 : 0);
}
