// Authored by DotWin
// Gate: the GRANT layer is checked separately from the POLICY layer.
//
// Why this gate exists (real-project evidence, 2026-08-11 portfolio scan):
//   * SOLO Soccer shipped `users_update_own` with a WITH CHECK of `(auth.uid() = id)`.
//     The check was present, and useless: it pinned `id` and nothing else, while
//     `authenticated` held UPDATE on `users.role`, `users.is_super_admin` and
//     `users.additional_roles`. One statement made any signed-in athlete a super admin.
//   * arkz-production had `user_balances_own` as `cmd=ALL` with a null WITH CHECK over a
//     wallet table. By policy shape that reads as "set your own balance and withdraw it".
//     It was NOT exploitable, because `authenticated` held zero column UPDATE grants there.
//
// Those two facts are the whole argument. A policy-only audit calls SOLO Soccer safe and
// arkz-production critical, and is wrong in both directions. Authorization for a write is
// the AND of three independent layers, and this gate is the one that reads the first:
//
//   1. GRANT      does the role hold UPDATE on this specific column?   <- this gate
//   2. POLICY     does an RLS policy admit the row, and pin the value?
//   3. TRIGGER    does a BEFORE UPDATE guard reject the transition?
//
// A privilege-bearing column is acceptable only when layer 1 denies it, or layer 3 provably
// rejects it. A policy alone is never sufficient, because a WITH CHECK that does not name
// the column does not constrain the column.
//
// Severity, and what blocks:
//   authz / trust        (role, is_super_admin, is_verified, permissions ...)  critical, ALWAYS blocks
//   entitlement / money  (tier, plan, *_cents, *_credits, max_*, *_limit ...)  high, blocks in spawn
//                                                                             mode; scored in adopt
//                                                                             mode until ratcheted
//
// Exceptions live in .dotwin/conformance.json `grantBoundaryAllow` as "table.column: reason".
// A bare "table.column" with no reason does NOT suppress the finding: an undocumented
// exception is not an exception. Allowed entries stay visible in the report as low findings.
//
// Env: SUPABASE_PROJECT_REF + SUPABASE_ACCESS_TOKEN. Without them the gate reports skipped
// and CI (which holds the secrets) is the enforcer. A failed query is `blocked`, never a
// pass: "could not verify" is not "verified".

import { fileURLToPath } from 'node:url';
import path from 'node:path';
import { readJSON } from './lib/scan.mjs';
import { finding, gate } from './lib/report.mjs';

const API = 'https://api.supabase.com';

// Column-name classes. Kept as one Postgres regex for the server-side filter, and as JS
// predicates for severity classification, so the two can never silently disagree: the JS
// classifier is the authority and PG_FILTER must be a superset of it.
// Column-name classes. SINGLE SOURCE OF TRUTH.
//
// Each class is a list of regex SOURCE strings written in the subset of syntax that is
// identical in JavaScript and POSIX (what Postgres `~` speaks): anchors, alternation,
// bracket classes, `*`, `+`, `?`. The JS matcher and the server-side PG filter are both
// built from these same strings, so the two can never silently disagree. The consistency
// is not assumed, it is proven: scripts/check-grant-boundary.test.mjs asserts that every
// name the JS classifier calls privileged is also selected by PG_FILTER, and CI runs that
// assertion against the live database's own regex engine.
//
// This mattered. The first draft of this gate hand-wrote the two regexes separately and
// the PG side omitted `_minutes_remaining`, which is precisely the arkz-production column
// (`bonus_minutes_remaining`, `purchased_minutes_remaining`) that lets a user mint their
// own AI inference budget. A gate with a silent hole is worse than no gate, because it
// reports green.
export const CLASSES = [
  {
    name: 'authz',
    severity: 'critical',
    patterns: [
      '^(roles?|additional_roles|user_role|member_role|account_type|user_type|permissions|scopes|claims|access_level|admin|superadmin|super_admin)$',
      '^is_[a-z_]*(admin|staff|owner|super)[a-z_]*$',
    ],
  },
  {
    name: 'trust',
    severity: 'critical',
    patterns: [
      '^(verified|approved|email_verified|phone_verified|kyc_status)$',
      '^is_[a-z_]*(verified|approved)[a-z_]*$',
    ],
  },
  {
    name: 'entitlement',
    severity: 'high',
    patterns: [
      '^(tier|plan|plan_id|plan_features|profile_tier|subscription_tier|subscription_status|price_id|entitlements|features|seats|quota|session_limit)$',
      '^max_[a-z_]+$',
      '^[a-z_]*_limit$',
      '^[a-z_]*_allowance$',
    ],
  },
  {
    name: 'money',
    severity: 'high',
    patterns: [
      '^(balance|credits|points|wallet)$',
      '^[a-z_]*_(balance|cents|credits|points|wallet)$',
      '^[a-z_]*_balance_[a-z_]*$',
      '^[a-z_]*(minutes|credits|tokens|seats|points|allowance|quota)_remaining$',
      '^remaining_[a-z_]+$',
      '^[a-z_]*_spend_cents$',
    ],
  },
];

// Built from CLASSES, never hand-written.
const CLASS_RE = CLASSES.map((c) => ({ ...c, re: new RegExp(c.patterns.map((p) => `(?:${p})`).join('|')) }));

export const PG_FILTER = CLASSES.flatMap((c) => c.patterns)
  .map((p) => p.replace(/^\^/, '').replace(/\$$/, ''))
  .map((p) => `(?:${p})`)
  .join('|')
  .replace(/^/, '^(')
  .replace(/$/, ')$');

export function classify(col) {
  for (const c of CLASS_RE) if (c.re.test(col)) return c;
  return null;
}

// One round trip. Returns {grants, guarded, policies} as a single JSON row.
//   grants   privilege-bearing columns anon/authenticated may UPDATE (column- OR table-level)
//   guarded  (table,column) pairs a BEFORE UPDATE trigger plausibly rejects
//   policies UPDATE/ALL policies reachable by a client role with a null WITH CHECK
export const REPORT_SQL = `
with roles as (select unnest(array['anon','authenticated']) as rolname),
privcol as (
  select c.oid as reloid, c.relname as tbl, a.attname as col, a.attnum
  from pg_class c
  join pg_namespace n on n.oid = c.relnamespace and n.nspname = 'public'
  join pg_attribute a on a.attrelid = c.oid and a.attnum > 0 and not a.attisdropped
  where c.relkind = 'r' and a.attname ~ '${PG_FILTER}'
),
grants as (
  select p.tbl, p.col, r.rolname
  from privcol p cross join roles r
  where has_column_privilege(r.rolname, p.reloid, p.attnum, 'UPDATE')
),
trg as (
  select c.relname as tbl,
         pg_get_functiondef(t.tgfoid) as src,
         (select array_agg(a2.attname) from pg_attribute a2
           where a2.attrelid = t.tgrelid and a2.attnum = any(t.tgattr)) as only_cols
  from pg_trigger t
  join pg_class c on c.oid = t.tgrelid
  join pg_namespace n on n.oid = c.relnamespace and n.nspname = 'public'
  where not t.tgisinternal and (t.tgtype & 2) <> 0 and (t.tgtype & 16) <> 0
),
guarded as (
  select distinct p.tbl, p.col
  from privcol p
  join trg t on t.tbl = p.tbl
  where t.src ~ ('\\m' || p.col || '\\M')
    and t.src ~* '(insufficient_privilege|raise\\s+exception)'
    and (t.only_cols is null or p.col = any(t.only_cols))
),
pol as (
  select tablename as tbl, policyname, cmd, permissive
  from pg_policies
  where schemaname = 'public' and cmd in ('UPDATE','ALL') and with_check is null
    and permissive = 'PERMISSIVE'
    and (roles::text[] && array['anon','authenticated','public'])
)
select json_build_object(
  'grants',   (select coalesce(json_agg(json_build_object('table',tbl,'column',col,'role',rolname) order by tbl,col,rolname),'[]'::json) from grants),
  'guarded',  (select coalesce(json_agg(json_build_object('table',tbl,'column',col) order by tbl,col),'[]'::json) from guarded),
  'policies', (select coalesce(json_agg(json_build_object('table',tbl,'policy',policyname,'cmd',cmd) order by tbl,policyname),'[]'::json) from pol)
) as report;`;

async function query(ref, token, sql) {
  const ctl = new AbortController();
  const timer = setTimeout(() => ctl.abort(), 30_000);
  try {
    const res = await fetch(`${API}/v1/projects/${ref}/database/query`, {
      method: 'POST',
      headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' },
      body: JSON.stringify({ query: sql }),
      signal: ctl.signal,
    });
    const text = await res.text();
    if (!res.ok) return { error: `HTTP ${res.status}: ${text.slice(0, 200)}` };
    const body = JSON.parse(text);
    const rows = Array.isArray(body) ? body : Array.isArray(body?.result) ? body.result : null;
    if (!rows || !rows.length || !rows[0].report) return { error: `unexpected response shape: ${text.slice(0, 160)}` };
    return { report: rows[0].report };
  } catch (e) {
    return { error: e.name === 'AbortError' ? 'request timed out after 30s' : String(e.message || e) };
  } finally {
    clearTimeout(timer);
  }
}

// Parse `grantBoundaryAllow` into a Map of "table.column" -> reason. An entry with no
// reason after the colon is recorded with reason null and does NOT suppress its finding.
export function parseAllow(list) {
  const out = new Map();
  for (const raw of Array.isArray(list) ? list : []) {
    const s = String(raw);
    const i = s.indexOf(':');
    const key = (i >= 0 ? s.slice(0, i) : s).trim().toLowerCase();
    const reason = i >= 0 ? s.slice(i + 1).trim() : '';
    if (key) out.set(key, reason.length >= 8 ? reason : null);
  }
  return out;
}

/**
 * Pure classifier over an already-fetched report. Exported so it can be proven against
 * real rows and synthetic fixtures without needing live credentials.
 */
export function evaluate(report, { allow = new Map(), mode = 'spawn', ratcheted = false } = {}) {
  const guarded = new Set((report.guarded || []).map((g) => `${g.table}.${g.column}`));
  const findings = [];
  const seen = new Set();
  let critical = 0, high = 0, allowed = 0, guardedCount = 0;

  for (const g of report.grants || []) {
    const key = `${g.table}.${g.column}`;
    const cls = classify(String(g.column));
    if (!cls) continue;
    if (guarded.has(key)) {
      if (!seen.has(`guard:${key}`)) {
        seen.add(`guard:${key}`);
        guardedCount++;
        findings.push(finding({
          severity: 'low',
          message: `Grant open but guarded: ${key} is UPDATE-able by a client role, and a BEFORE UPDATE trigger rejects the transition. Prove it with the privilege-escalation deny-test; a guard is only real if it raises.`,
          rule: 'grant-boundary-guarded',
        }));
      }
      continue;
    }
    if (seen.has(key)) continue;
    seen.add(key);

    if (allow.has(key)) {
      const reason = allow.get(key);
      if (reason) {
        allowed++;
        findings.push(finding({ severity: 'low', message: `Accepted grant-boundary exception (${key}): ${reason}`, rule: 'grant-boundary-allowed' }));
        continue;
      }
      findings.push(finding({
        severity: cls.severity,
        message: `${key} is listed in grantBoundaryAllow with no reason. Write "table.column: why this is safe" (8+ chars) or fix the grant. An undocumented exception is not an exception.`,
        rule: 'grant-boundary-undocumented-exception',
      }));
      cls.severity === 'critical' ? critical++ : high++;
      continue;
    }

    const roles = (report.grants || []).filter((x) => `${x.table}.${x.column}` === key).map((x) => x.role).join(', ');
    cls.severity === 'critical' ? critical++ : high++;
    findings.push(finding({
      severity: cls.severity,
      message: `${roles} may UPDATE ${key} (${cls.name}) with no BEFORE UPDATE guard. Fix: REVOKE UPDATE ON public.${g.table} FROM anon, authenticated; then GRANT UPDATE (<safe columns>) ON public.${g.table} TO authenticated; and add a guard trigger so a future "grant all" cannot reopen it.`,
      rule: `grant-boundary-${cls.name}`,
    }));
  }

  for (const p of report.policies || []) {
    findings.push(finding({
      severity: 'medium',
      message: `Permissive ${p.cmd} policy "${p.policy}" on "${p.table}" has a null WITH CHECK: it admits the row but constrains no value. Any column the caller holds a grant on is writable through it.`,
      rule: 'grant-boundary-null-with-check',
    }));
  }

  // Critical always blocks. High blocks on spawn, and on adopt once ratcheted.
  const highBlocks = mode !== 'adopt' || ratcheted;
  const blocking = critical > 0 || (highBlocks && high > 0);

  return {
    findings, critical, high, allowed, guardedCount, blocking,
    detail: `${critical} critical, ${high} high, ${guardedCount} guarded-by-trigger, ${allowed} accepted, ${(report.policies || []).length} null-WITH-CHECK polic(ies)`,
  };
}

export async function runCheck(root, { mode = 'spawn' } = {}) {
  const ref = process.env.SUPABASE_PROJECT_REF;
  const token = process.env.SUPABASE_ACCESS_TOKEN;
  if (!ref || !token) {
    return gate('grant-boundary', {
      required: false, status: 'skipped', findings: [],
      detail: 'SUPABASE_PROJECT_REF / SUPABASE_ACCESS_TOKEN not set (CI enforces this gate via repository secrets)',
    });
  }

  const { report, error } = await query(ref, token, REPORT_SQL);
  if (error) {
    return gate('grant-boundary', { status: 'blocked', findings: [], detail: `grant-layer query failed, NOT verified: ${error}` });
  }

  const conf = readJSON(path.join(root, '.dotwin', 'conformance.json')) || {};
  const res = evaluate(report, {
    allow: parseAllow(conf.grantBoundaryAllow),
    mode: conf.mode || mode,
    ratcheted: !!(conf.ratchet && conf.ratchet['grant-boundary']),
  });

  return gate('grant-boundary', {
    status: res.blocking ? 'fail' : 'pass',
    findings: res.findings,
    detail: res.detail,
  });
}

if (path.resolve(process.argv[1] || '') === fileURLToPath(import.meta.url)) {
  const g = await runCheck(process.argv[2] || process.cwd());
  for (const f of g.findings) console.log(`[${f.severity}] ${f.message}`);
  console.log(`grant-boundary: ${g.status} (${g.detail})`);
  process.exit(g.status === 'fail' || g.status === 'blocked' ? 1 : 0);
}
