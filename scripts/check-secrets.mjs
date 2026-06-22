// Authored by DotWin
// Gate: no hardcoded secrets in source OR docs.
// Evidence this is needed: a real DotWin project shipped ADMIN_PASSWORD='...' in a
// committed route, and live OAuth IDs / service keys were pasted into CLAUDE.md and
// state docs. .env files are gitignored and are NOT scanned; .env.example is allowed.

import { fileURLToPath } from 'node:url';
import path from 'node:path';
import { walk, readText, rel, safeIsDir, scopeFilter } from './lib/scan.mjs';
import { finding, gate } from './lib/report.mjs';

const CODE_EXTS = ['.ts', '.tsx', '.js', '.jsx', '.mjs', '.cjs'];
const CODE_DIRS = ['src', 'app', 'lib', 'components', 'pages', 'server', 'supabase'];

const PATTERNS = [
  { rule: 'stripe-secret', re: /\b(sk|rk)_(live|test)_[0-9a-zA-Z]{10,}/, sev: 'critical', msg: 'Hardcoded Stripe secret key' },
  { rule: 'stripe-webhook-secret', re: /\bwhsec_[0-9a-zA-Z]{10,}/, sev: 'critical', msg: 'Hardcoded Stripe webhook secret' },
  { rule: 'jwt', re: /\beyJ[A-Za-z0-9_-]{15,}\.[A-Za-z0-9_-]{15,}\.[A-Za-z0-9_-]{10,}/, sev: 'critical', msg: 'Hardcoded JWT (likely Supabase anon/service key)' },
  { rule: 'aws-key', re: /\bAKIA[0-9A-Z]{16}\b/, sev: 'critical', msg: 'Hardcoded AWS access key id' },
  { rule: 'google-oauth', re: /[0-9]{6,}-[0-9a-z]{16,}\.apps\.googleusercontent\.com/, sev: 'high', msg: 'Hardcoded Google OAuth client id' },
  { rule: 'password-literal', re: /\b(password|passwd|pwd|admin_password)\s*[:=]\s*['"][^'"]{6,}['"]/i, sev: 'critical', msg: 'Hardcoded password literal' },
  { rule: 'admin-email', re: /\b(admin|owner|root|super)[_-]?email\b\s*[:=]\s*['"][^'"]+@[^'"]+['"]/i, sev: 'high', msg: 'Hardcoded admin/owner email literal' },
  { rule: 'generic-secret', re: /\b(api[_-]?key|secret[_-]?key|access[_-]?token|client[_-]?secret|service[_-]?role[_-]?key)\b\s*[:=]\s*['"][A-Za-z0-9_\-./+]{16,}['"]/i, sev: 'high', msg: 'Hardcoded secret-looking literal' },
];

const SAFE_HINTS = [
  'process.env', 'import.meta.env', 'YOUR_', 'your_', 'example', 'placeholder',
  'xxxx', 'changeme', 'change-me', '<', 'redacted', 'dummy', 'test_key_here',
  'sk_test_xxx', 'fake', 'sample',
];

export function runCheck(root, { scope } = {}) {
  const findings = [];
  const files = new Set();

  for (const d of CODE_DIRS) {
    if (safeIsDir(path.join(root, d))) {
      for (const f of walk(path.join(root, d), { exts: [...CODE_EXTS, '.sql'] })) files.add(f);
    }
  }
  // Docs are scanned too — secrets leak into CLAUDE.md / STATE.md / build logs.
  for (const f of walk(root, { exts: ['.md'] })) {
    if (f.includes(`${path.sep}scripts${path.sep}`)) continue;
    if (f.includes(`spawn-kit`)) continue;
    files.add(f);
  }

  for (const file of scopeFilter([...files], root, scope)) {
    if (file.endsWith('.env.example') || file.includes(`${path.sep}scripts${path.sep}`)) continue;
    const content = readText(file);
    const lines = content.split(/\r?\n/);
    for (let i = 0; i < lines.length; i++) {
      const line = lines[i];
      if (line.includes('dotwin-allow:secrets')) continue;
      for (const p of PATTERNS) {
        if (!p.re.test(line)) continue;
        const lower = line.toLowerCase();
        if (SAFE_HINTS.some((h) => lower.includes(h.toLowerCase()))) continue;
        findings.push(finding({ severity: p.sev, file: rel(root, file), line: i + 1, message: p.msg, rule: p.rule }));
        break;
      }
    }
  }

  return gate('secrets', {
    status: findings.some((f) => f.severity === 'critical' || f.severity === 'high') ? 'fail' : 'pass',
    findings,
    detail: findings.length ? `${findings.length} potential secret(s)` : 'no hardcoded secrets',
  });
}

if (path.resolve(process.argv[1] || '') === fileURLToPath(import.meta.url)) {
  const g = runCheck(process.argv[2] || process.cwd());
  for (const f of g.findings) console.log(`[${f.severity}] ${f.message} — ${f.file}:${f.line}`);
  console.log(`secrets: ${g.status}`);
  process.exit(g.status === 'fail' ? 1 : 0);
}
