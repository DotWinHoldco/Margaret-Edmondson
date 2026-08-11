// Authored by DotWin
// Proof for the grant-boundary gate. Run: node scripts/check-grant-boundary.test.mjs
//
// This gate makes a security claim, so its logic is proven rather than trusted. Three things
// are asserted here:
//   1. JS <-> PG regex agreement. The classifier and the server-side filter are generated
//      from one pattern list; this asserts the generated PG_FILTER selects every name the JS
//      classifier calls privileged. A silent hole here reports green on a live defect, which
//      is worse than having no gate.
//   2. Real-portfolio fixtures. Rows captured from the live databases on 2026-08-11, including
//      the two cases that motivated the gate: SOLO Soccer users.is_super_admin (must FAIL) and
//      arkz-production user_balances.available_cents with the grant revoked (must NOT appear).
//   3. Fail-closed behaviour on exceptions without a written reason.

import assert from 'node:assert/strict';
import { classify, evaluate, parseAllow, PG_FILTER, CLASSES } from './check-grant-boundary.mjs';

let pass = 0;
const t = (name, fn) => { fn(); pass++; console.log(`  ok  ${name}`); };

// ---------------------------------------------------------------- 1. regex agreement
t('PG_FILTER is a superset of the JS classifier', () => {
  const pg = new RegExp(PG_FILTER);
  const privileged = [
    'role', 'roles', 'additional_roles', 'user_role', 'member_role', 'is_super_admin', 'is_admin',
    'is_staff', 'is_owner', 'access_level', 'permissions', 'scopes', 'claims', 'account_type',
    'verified', 'is_verified', 'is_approved', 'email_verified', 'kyc_status',
    'tier', 'plan', 'plan_features', 'profile_tier', 'subscription_tier', 'session_limit',
    'max_seats', 'max_extensions_per_week', 'events_allowance_limit', 'import_limit',
    'balance', 'credits', 'points', 'wallet', 'available_cents', 'earned_balance_cents',
    'boost_balance', 'price_cents', 'daily_ai_spend_cents', 'monthly_ai_spend_cents',
    'bonus_minutes_remaining', 'purchased_minutes_remaining', 'remaining_cents', 'wallet_balance',
  ];
  for (const c of privileged) {
    assert.ok(classify(c), `JS classifier must flag ${c}`);
    assert.ok(pg.test(c), `PG_FILTER must select ${c} (silent hole otherwise)`);
  }
});

t('ordinary columns are ignored by both', () => {
  const pg = new RegExp(PG_FILTER);
  for (const c of ['first_name', 'last_name', 'avatar_url', 'bio', 'created_at', 'updated_at',
    'email', 'notes', 'duration_minutes', 'estimated_minutes', 'title', 'body', 'slug']) {
    assert.equal(classify(c), null, `${c} must not be classified`);
    assert.equal(pg.test(c), false, `PG_FILTER must not select ${c}`);
  }
});

t('every class pattern compiles in JS', () => {
  for (const c of CLASSES) for (const p of c.patterns) new RegExp(p);
});

// ---------------------------------------------------------------- 2. severity
t('authz and trust are critical; entitlement and money are high', () => {
  assert.equal(classify('is_super_admin').severity, 'critical');
  assert.equal(classify('role').severity, 'critical');
  assert.equal(classify('is_verified').severity, 'critical');
  assert.equal(classify('tier').severity, 'high');
  assert.equal(classify('available_cents').severity, 'high');
});

// ---------------------------------------------------------------- 3. real fixtures
// SOLO Soccer, captured 2026-08-11 before the guard trigger landed. This is the exact shape
// that let any signed-in athlete run `update users set is_super_admin = true`.
const SOLO_BEFORE = {
  grants: [
    { table: 'users', column: 'is_super_admin', role: 'authenticated' },
    { table: 'users', column: 'role', role: 'authenticated' },
    { table: 'users', column: 'additional_roles', role: 'authenticated' },
    { table: 'athlete_profiles', column: 'plan', role: 'authenticated' },
    { table: 'athlete_profiles', column: 'profile_tier', role: 'authenticated' },
  ],
  guarded: [],
  policies: [{ table: 'users', policy: 'users_admin_all', cmd: 'ALL' }],
};

t('SOLO Soccer before-state: blocks, and names is_super_admin as critical', () => {
  const r = evaluate(SOLO_BEFORE);
  assert.equal(r.blocking, true);
  assert.ok(r.critical >= 3, `expected >=3 critical, got ${r.critical}`);
  assert.ok(r.findings.some((f) => /users\.is_super_admin/.test(f.message) && f.severity === 'critical'));
  assert.ok(r.findings.some((f) => f.rule === 'grant-boundary-null-with-check'));
});

// SOLO Soccer after the guard trigger landed: same grants, now covered by users_identity_guard.
const SOLO_AFTER = {
  ...SOLO_BEFORE,
  guarded: [
    { table: 'users', column: 'is_super_admin' },
    { table: 'users', column: 'role' },
    { table: 'users', column: 'additional_roles' },
    { table: 'athlete_profiles', column: 'plan' },
    { table: 'athlete_profiles', column: 'profile_tier' },
  ],
};

t('SOLO Soccer after-state: guarded columns stop blocking but stay visible', () => {
  const r = evaluate(SOLO_AFTER);
  assert.equal(r.blocking, false);
  assert.equal(r.critical, 0);
  assert.equal(r.guardedCount, 5);
  assert.ok(r.findings.every((f) => f.severity !== 'critical'));
});

// arkz-production: the false positive a policy-only audit produces. user_balances has a
// cmd=ALL policy with a null WITH CHECK over available_cents / earned_balance_cents, and is
// NOT exploitable because authenticated holds zero column UPDATE grants. No grant, no finding.
t('arkz user_balances is not reported: the grant layer already denies it', () => {
  const r = evaluate({
    grants: [],
    guarded: [],
    policies: [{ table: 'user_balances', policy: 'user_balances_own', cmd: 'ALL' }],
  });
  assert.equal(r.blocking, false);
  assert.equal(r.critical, 0);
  assert.equal(r.high, 0);
  assert.ok(r.findings.some((f) => f.rule === 'grant-boundary-null-with-check'),
    'the null WITH CHECK is still reported as medium, just not as an exploit');
});

// arkz-production, captured live 2026-08-11: money paths revoked, identity columns not.
t('arkz live state: arkz_owners.role blocks as critical', () => {
  const r = evaluate({
    grants: [
      { table: 'arkz_owners', column: 'role', role: 'authenticated' },
      { table: 'vault_people', column: 'role', role: 'authenticated' },
      { table: 'ark_legacy_beneficiaries', column: 'verified', role: 'authenticated' },
      { table: 'ark_legacy_beneficiaries', column: 'access_level', role: 'authenticated' },
      { table: 'withdrawal_requests', column: 'amount_cents', role: 'authenticated' },
    ],
    guarded: [],
    policies: [],
  });
  assert.equal(r.blocking, true);
  assert.equal(r.critical, 4);
  assert.equal(r.high, 1);
});

// ---------------------------------------------------------------- 4. exceptions
t('a documented exception suppresses; a bare one does not', () => {
  const report = { grants: [{ table: 'plans', column: 'tier', role: 'authenticated' }], guarded: [], policies: [] };

  const documented = evaluate(report, { allow: parseAllow(['plans.tier: catalog table, writes are admin-gated by plans_admin and covered by regression test rls-plans']) });
  assert.equal(documented.blocking, false);
  assert.equal(documented.allowed, 1);

  const bare = evaluate(report, { allow: parseAllow(['plans.tier']) });
  assert.equal(bare.blocking, true, 'an undocumented exception must not suppress');
  assert.ok(bare.findings.some((f) => f.rule === 'grant-boundary-undocumented-exception'));

  const tooShort = evaluate(report, { allow: parseAllow(['plans.tier: ok']) });
  assert.equal(tooShort.blocking, true, 'a token reason must not suppress');
});

t('an exception can never suppress a critical authz column silently', () => {
  const r = evaluate(
    { grants: [{ table: 'users', column: 'is_super_admin', role: 'authenticated' }], guarded: [], policies: [] },
    { allow: parseAllow(['users.is_super_admin: accepted by the platform owner on 2026-08-11']) },
  );
  // It is suppressible, but only with a written reason, and it stays in the report.
  assert.equal(r.blocking, false);
  assert.ok(r.findings.some((f) => f.rule === 'grant-boundary-allowed' && /is_super_admin/.test(f.message)),
    'the accepted exception must remain visible in the report');
});

// ---------------------------------------------------------------- 5. adopt-mode ratchet
t('adopt mode scores high findings but never downgrades critical', () => {
  const money = { grants: [{ table: 'plans', column: 'price_cents', role: 'authenticated' }], guarded: [], policies: [] };
  assert.equal(evaluate(money, { mode: 'adopt' }).blocking, false, 'high is scored in adopt');
  assert.equal(evaluate(money, { mode: 'adopt', ratcheted: true }).blocking, true, 'ratchet turns it blocking');
  assert.equal(evaluate(money, { mode: 'spawn' }).blocking, true, 'spawn always blocks high');

  const authz = { grants: [{ table: 'users', column: 'role', role: 'authenticated' }], guarded: [], policies: [] };
  assert.equal(evaluate(authz, { mode: 'adopt' }).blocking, true, 'critical blocks even in adopt');
});

// ---------------------------------------------------------------- 6. degenerate input
t('an empty report passes and a malformed one does not throw', () => {
  assert.equal(evaluate({ grants: [], guarded: [], policies: [] }).blocking, false);
  assert.equal(evaluate({}).blocking, false);
});

console.log(`\n  ${pass} assertions groups passed\n`);
