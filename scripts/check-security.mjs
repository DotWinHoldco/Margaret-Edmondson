// Authored by DotWin
// Gate: forbidden security patterns in source.
// Each pattern maps to a real regression observed across prior DotWin projects.
// Document an approved exception inline with `// dotwin-allow:<rule>`.

import { fileURLToPath } from 'node:url';
import path from 'node:path';
import { walk, readText, rel, safeIsDir, scopeFilter } from './lib/scan.mjs';
import { finding, gate } from './lib/report.mjs';

const CODE_EXTS = ['.ts', '.tsx', '.js', '.jsx', '.mjs', '.cjs'];
const SCAN_DIRS = ['src', 'app', 'lib', 'components', 'pages', 'server', 'supabase'];

// Line-level patterns.
const RULES = [
  { rule: 'wildcard-cors', re: /['"]Access-Control-Allow-Origin['"]\s*:\s*['"]\*['"]|Allow-Origin['"]\s*,\s*['"]\*['"]/, sev: 'high', msg: 'Wildcard CORS (*) — use an explicit allowlist origin' },
  { rule: 'cors-fallback-star', re: /(origin|cors)[^\n]*\|\|\s*['"]\*['"]/i, sev: 'high', msg: 'CORS falls back to wildcard (origin || "*")' },
  { rule: 'catch-any', re: /catch\s*\(\s*\w+\s*:\s*any\s*\)/, sev: 'high', msg: 'catch (e: any) — use unknown and narrow' },
  { rule: 'select-star', re: /\.select\(\s*['"`]\*['"`]\s*\)/, sev: 'high', msg: "select('*') — select explicit columns" },
  { rule: 'eval', re: /\beval\s*\(/, sev: 'high', msg: 'eval() is forbidden' },
  { rule: 'todo-security', re: /(TODO|FIXME|HACK)\b.*(auth|secur|rls|permission|tenant|token)/i, sev: 'medium', msg: 'Unresolved security TODO in a code path' },
  { rule: 'any-type', re: /:\s*any(\b|\[)/, sev: 'medium', msg: ': any type annotation' },
];

// console-token-log is handled separately (below) so it can match a secret VALUE being logged
// rather than the words "token"/"password" appearing inside a label or error-message string.
const SECRET_IDENTIFIER = /\b(access_?token|refresh_?token|auth_?token|id_?token|session_?token|bearer_?token|service_role(_key)?|api[_-]?key|secret_?key|client_secret|webhook_secret|signing_secret|private_?key|passwd|password)\b/i;
const SECRET_ENV = /process\.env\.[A-Z0-9_]*(SECRET|KEY|TOKEN|PASSWORD|PASSWD)[A-Z0-9_]*/;
const SECRET_LITERAL = /\b(sk|rk)_(live|test)_|whsec_|eyJ[A-Za-z0-9_-]{10,}\./;

function stripStringLiterals(line) {
  let s = line.replace(/'(?:[^'\\]|\\.)*'/g, ' ').replace(/"(?:[^"\\]|\\.)*"/g, ' ');
  // Keep ${...} interpolations from template literals; drop the static text around them.
  s = s.replace(/`(?:[^`\\]|\\.)*`/g, (m) => (m.match(/\$\{[^}]*\}/g) || []).join(' '));
  return s;
}

function logsSecretValue(line) {
  if (!/console\.\w+\(/.test(line)) return false;
  const code = stripStringLiterals(line); // labels/messages removed; only real code remains
  if (SECRET_IDENTIFIER.test(code) || SECRET_ENV.test(code) || SECRET_LITERAL.test(code)) return true;
  const consts = code.match(/\b[A-Z][A-Z0-9_]{2,}\b/g) || [];
  return consts.some((c) => /(SERVICE_ROLE|_SECRET\b|SECRET_KEY|_KEY\b|API_?KEY|_TOKEN\b|ACCESS_TOKEN|WEBHOOK_SECRET|_PASSWORD\b|PRIVATE_KEY)/.test(c));
}

export function runCheck(root, { scope } = {}) {
  const findings = [];
  const files = [];
  for (const d of SCAN_DIRS) {
    if (safeIsDir(path.join(root, d))) files.push(...walk(path.join(root, d), { exts: CODE_EXTS }));
  }

  for (const file of scopeFilter(files, root, scope)) {
    const content = readText(file);
    const lines = content.split(/\r?\n/);
    const hasSanitizer = /DOMPurify|sanitize|isomorphic-dompurify/i.test(content);
    for (let i = 0; i < lines.length; i++) {
      const line = lines[i];
      for (const r of RULES) {
        if (line.includes(`dotwin-allow:${r.rule}`)) continue;
        if (r.re.test(line)) {
          findings.push(finding({ severity: r.sev, file: rel(root, file), line: i + 1, message: r.msg, rule: r.rule }));
        }
      }
      // dangerouslySetInnerHTML is a finding only when the HTML is unsanitized AND not a safe
      // pattern: JSON-LD structured data (JSON.stringify of a static object) is not user HTML,
      // and a match inside a comment is not a render.
      if (/dangerouslySetInnerHTML/.test(line) && !hasSanitizer && !line.includes('dotwin-allow:dangerous-html')) {
        const hi = line.indexOf('dangerouslySetInnerHTML');
        const ci = line.indexOf('//');
        const inComment = (ci >= 0 && ci < hi) || line.trim().startsWith('*') || line.trim().startsWith('/*');
        const ctx = lines.slice(Math.max(0, i - 3), i + 2).join('\n');
        const safePayload = /application\/ld\+json/.test(ctx) || /__html:\s*JSON\.stringify/.test(ctx);
        if (!inComment && !safePayload) {
          findings.push(finding({ severity: 'high', file: rel(root, file), line: i + 1, message: 'dangerouslySetInnerHTML without DOMPurify/sanitize in file', rule: 'unsanitized-html' }));
        }
      }
      if (logsSecretValue(line) && !line.includes('dotwin-allow:console-token-log')) {
        findings.push(finding({ severity: 'high', file: rel(root, file), line: i + 1, message: 'Logging a secret/token value to console', rule: 'console-token-log' }));
      }
    }
  }

  const blocking = findings.filter((f) => f.severity === 'critical' || f.severity === 'high');
  return gate('security', {
    status: blocking.length ? 'fail' : 'pass',
    findings,
    detail: blocking.length ? `${blocking.length} blocking, ${findings.length - blocking.length} advisory` : `${findings.length} advisory`,
  });
}

if (path.resolve(process.argv[1] || '') === fileURLToPath(import.meta.url)) {
  const g = runCheck(process.argv[2] || process.cwd());
  for (const f of g.findings) console.log(`[${f.severity}] ${f.message} — ${f.file}:${f.line}`);
  console.log(`security: ${g.status}`);
  process.exit(g.status === 'fail' ? 1 : 0);
}
