// Authored by DotWin
// Gate: every public table created in a migration must have RLS enabled in the
// migration set, and no write policy may use a permissive `true` qualifier.
// Evidence: a real DotWin project shipped UPDATE/INSERT policies with `using (true)`
// on e-signature + audit tables, letting anyone forge records.

import { fileURLToPath } from 'node:url';
import path from 'node:path';
import { walk, readText, rel, safeIsDir } from './lib/scan.mjs';
import { finding, gate } from './lib/report.mjs';

export function runCheck(root) {
  const migDir = path.join(root, 'supabase', 'migrations');
  const findings = [];

  if (!safeIsDir(migDir)) {
    return gate('rls', { required: false, status: 'skipped', findings, detail: 'no supabase/migrations directory' });
  }

  const files = walk(migDir, { exts: ['.sql'] }).sort();
  const created = new Map(); // table -> {file,line}
  const rlsEnabled = new Set();
  // Policy findings are keyed by table::name so a later DROP/redefine across migrations clears them.
  const policyFindings = new Map();
  const tenantOwned = new Set(); // tables with a tenant/account/org column
  const PRIVILEGED = new Set(['service_role', 'postgres', 'supabase_admin', 'supabase_auth_admin', 'supabase_storage_admin']);
  // A real tenant policy anchors on the caller's identity / tenant. A predicate that does NOT
  // mention any of these (e.g. `confirmation_token IS NOT NULL`) is unscoped and leaks rows.
  const SCOPE_ANCHOR = /auth\.(uid|jwt|role)|current_setting|tenant_id|account_id|org_id|organization_id|\bis_[a-z_]*member|\bhas_[a-z_]*|membership|exists\s*\(/;

  for (const file of files) {
    const raw = readText(file);
    const content = raw.replace(/--[^\n]*/g, ''); // strip line comments, keep newlines so line numbers hold
    const lower = content.toLowerCase();

    // Tables created in the public schema.
    const createRe = /create\s+table\s+(?:if\s+not\s+exists\s+)?(?:"?public"?\.)?"?([a-z0-9_]+)"?/gi;
    let m;
    while ((m = createRe.exec(content))) {
      const name = m[1].toLowerCase();
      const line = content.slice(0, m.index).split('\n').length;
      if (!created.has(name)) created.set(name, { file: rel(root, file), line });
      const end = content.indexOf(';', m.index);
      const body = content.slice(m.index, end >= 0 ? end : content.length);
      if (/\b(tenant_id|account_id|org_id|organization_id)\b/i.test(body)) tenantOwned.add(name);
    }

    // RLS enabled.
    const enableRe = /alter\s+table\s+(?:"?public"?\.)?"?([a-z0-9_]+)"?\s+enable\s+row\s+level\s+security/gi;
    while ((m = enableRe.exec(lower))) rlsEnabled.add(m[1].toLowerCase());

    // Policy lifecycle across the whole migration set: a permissive (true) policy is a finding
    // only if it is not later dropped or redefined. Privileged-role policies are never flagged.
    for (const stmt of content.split(';')) {
      const s = stmt.toLowerCase();

      // DROP POLICY "name" ON table -> clear any prior candidate.
      const dropMatch = s.match(/drop\s+policy\s+(?:if\s+exists\s+)?"?([a-z0-9_ ]+?)"?\s+on\s+(?:"?public"?\.)?"?([a-z0-9_]+)"?/);
      if (dropMatch) {
        policyFindings.delete(`${dropMatch[2]}::${dropMatch[1].trim()}`);
        continue;
      }

      const isCreate = /\bcreate\s+policy\b/.test(s);
      const isAlter = /\balter\s+policy\b/.test(s);
      if (!isCreate && !isAlter) continue;

      const nameMatch = s.match(/(?:create|alter)\s+policy\s+"?([a-z0-9_ ]+?)"?\s+on\b/);
      const onMatch = s.match(/\bon\s+(?:"?public"?\.)?"?([a-z0-9_]+)"?/);
      const pname = nameMatch ? nameMatch[1].trim() : '(unnamed)';
      const tbl = onMatch ? onMatch[1] : 'unknown';
      const key = `${tbl}::${pname}`;

      const permissive = /(using|with\s+check)\s*\(\s*true\s*\)/.test(s);
      // service_role / privileged roles legitimately use (true): they bypass RLS by design.
      const toMatch = s.match(/\bto\s+([a-z0-9_,\s"]+?)\s*(?:using|with\s+check)\b/);
      const roles = toMatch ? toMatch[1].split(',').map((r) => r.replace(/"/g, '').trim()).filter(Boolean) : [];
      const onlyPrivileged = roles.length > 0 && roles.every((r) => PRIVILEGED.has(r));

      if (isCreate && !onlyPrivileged) {
        const isWrite = /\bfor\s+(insert|update|delete|all)\b/.test(s);
        const lineNo = content.toLowerCase().indexOf(s.trim().slice(0, 30));
        const line = lineNo >= 0 ? content.slice(0, lineNo).split('\n').length : null;
        if (permissive) {
          policyFindings.set(key, finding({
            severity: isWrite ? 'critical' : 'medium',
            file: rel(root, file),
            line,
            message: `${isWrite ? 'WRITE' : 'read'} policy "${pname}" on "${tbl}" uses permissive (true)`,
            rule: isWrite ? 'rls-true-write' : 'rls-true-read',
          }));
        } else if (tenantOwned.has(tbl)) {
          // Non-(true) but unscoped: the predicate references no tenant/auth anchor on a
          // tenant-owned table — the blind spot that missed the appointments-token leak.
          const idxs = [s.indexOf('using'), s.indexOf('with check')].filter((x) => x >= 0);
          const pred = idxs.length ? s.slice(Math.min(...idxs)) : '';
          if (pred && !SCOPE_ANCHOR.test(pred)) {
            policyFindings.set(key, finding({
              severity: isWrite ? 'high' : 'medium',
              file: rel(root, file),
              line,
              message: `${isWrite ? 'WRITE' : 'read'} policy "${pname}" on tenant-owned "${tbl}" has an unscoped predicate (no tenant/auth check)`,
              rule: isWrite ? 'rls-unscoped-write' : 'rls-unscoped-read',
            }));
          } else {
            policyFindings.delete(key);
          }
        } else {
          policyFindings.delete(key);
        }
      } else {
        // An ALTER, or a privileged-scoped (re)definition, clears any prior flag.
        policyFindings.delete(key);
      }
    }
  }

  for (const f of policyFindings.values()) findings.push(f);

  for (const [tbl, loc] of created) {
    if (!rlsEnabled.has(tbl)) {
      findings.push(finding({ severity: 'critical', file: loc.file, line: loc.line, message: `Table "${tbl}" created without ENABLE ROW LEVEL SECURITY`, rule: 'rls-missing' }));
    }
  }

  const blocking = findings.filter((f) => f.severity === 'critical' || f.severity === 'high');
  return gate('rls', {
    status: blocking.length ? 'fail' : 'pass',
    findings,
    detail: `${created.size} tables, ${rlsEnabled.size} with RLS; ${blocking.length} blocking`,
  });
}

if (path.resolve(process.argv[1] || '') === fileURLToPath(import.meta.url)) {
  const g = runCheck(process.argv[2] || process.cwd());
  for (const f of g.findings) console.log(`[${f.severity}] ${f.message} — ${f.file}${f.line ? ':' + f.line : ''}`);
  console.log(`rls: ${g.status} (${g.detail})`);
  process.exit(g.status === 'fail' ? 1 : 0);
}
