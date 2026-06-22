#!/usr/bin/env node
// Authored by DotWin
// The build-check runner. Runs the command gates (typecheck / lint / test / build)
// and the DotWin custom gates, computes an honest status, and — only when gates
// actually pass — may write `green` into STATE.md. "green" is never hand-typed.
//
// Usage:
//   node scripts/build-check.mjs                 # green-build gates
//   node scripts/build-check.mjs --production-candidate
//   node scripts/build-check.mjs --enterprise-ready
//   node scripts/build-check.mjs --write-state   # also rewrite STATE.md + BUILD_LOG.md
//   node scripts/build-check.mjs --install       # run dependency install first
//   node scripts/build-check.mjs --json          # print machine-readable report only

import { spawnSync } from 'node:child_process';
import fs from 'node:fs';
import path from 'node:path';
import { readJSON, safeExists } from './lib/scan.mjs';
import { gate, computeStatus, printReport, writeReport, updateState, appendLog } from './lib/report.mjs';

import { runCheck as secrets } from './check-secrets.mjs';
import { runCheck as security } from './check-security.mjs';
import { runCheck as rls } from './check-rls.mjs';
import { runCheck as migrations } from './check-migrations.mjs';
import { runCheck as boundaries } from './check-supabase-boundaries.mjs';
import { runCheck as moduleIsolation } from './check-module-isolation.mjs';
import { runCheck as anchors } from './check-anchors.mjs';
import { runCheck as docs } from './check-docs.mjs';
import { runCheck as authz } from './check-authz.mjs';
import { runCheck as contract } from './check-contract.mjs';
import { changedFiles, headCommit } from './lib/changed.mjs';

const args = process.argv.slice(2);
const flag = (n) => args.includes(n);
const root = (args.find((a) => !a.startsWith('--')) ) || process.cwd();
const profile = flag('--enterprise-ready') ? 'enterprise-ready'
  : flag('--production-candidate') ? 'production-candidate'
  : 'green';
// Incremental controls. --tier=pre runs the fast diff-scoped security gates only (before/during
// a build); default --tier=full runs everything. --since/--changed narrow the file scope.
const tier = (args.find((a) => a.startsWith('--tier=')) || '--tier=full').split('=')[1];
const sinceArg = (args.find((a) => a.startsWith('--since=')) || '').split('=')[1] || null;

function detectPM(r) {
  if (safeExists(path.join(r, 'pnpm-lock.yaml'))) return 'pnpm';
  if (safeExists(path.join(r, 'yarn.lock'))) return 'yarn';
  return 'npm';
}

function runScript(r, pm, script) {
  const res = spawnSync(pm, ['run', script], { cwd: r, encoding: 'utf8' });
  const out = `${res.stdout || ''}${res.stderr || ''}`;
  return { code: res.status, out };
}

function commandGate(r, pm, scripts, name, script, { required = true } = {}) {
  if (!scripts[script]) {
    return gate(name, { required, status: 'skipped', findings: [], detail: `no "${script}" script` });
  }
  const { code, out } = runScript(r, pm, script);
  const tail = out.trim().split('\n').slice(-1)[0]?.slice(0, 120) || '';
  return gate(name, { required, status: code === 0 ? 'pass' : 'fail', findings: [], detail: code === 0 ? 'ok' : `exit ${code}: ${tail}` });
}

function docGate(r, name, file, sev = 'required') {
  const ok = safeExists(path.join(r, file));
  return gate(name, { required: sev === 'required', status: ok ? 'pass' : (sev === 'required' ? 'fail' : 'skipped'), findings: [], detail: ok ? `${file} present` : `${file} missing` });
}

function main() {
  const gates = [];
  const pkg = readJSON(path.join(root, 'package.json'));
  const pm = detectPM(root);
  const scripts = (pkg && pkg.scripts) || {};

  // Resolve the diff scope. --changed reads the last green commit from the conformance baseline.
  const confPath = path.join(root, '.dotwin', 'conformance.json');
  let since = sinceArg;
  if (flag('--changed') && !since) { const c = readJSON(confPath); since = c ? c.lastGreenCommit : null; }
  const scope = changedFiles(root, since);
  const migChanged = !scope || [...scope].some((p) => p.includes('supabase/migrations'));
  const modulesChanged = !scope || [...scope].some((p) => p.includes('src/modules/'));

  if (!pkg) {
    gates.push(gate('package.json', { status: 'blocked', findings: [], detail: 'no package.json at root' }));
  } else {
    if (flag('--install')) {
      const res = spawnSync(pm, [pm === 'npm' ? 'ci' : 'install'], { cwd: root, encoding: 'utf8' });
      gates.push(gate('install', { required: false, status: res.status === 0 ? 'pass' : 'fail', findings: [], detail: pm }));
    }
    if (tier === 'full') {
      gates.push(commandGate(root, pm, scripts, 'typecheck', 'typecheck'));
      gates.push(commandGate(root, pm, scripts, 'lint', 'lint'));
      gates.push(commandGate(root, pm, scripts, 'test', 'test'));
      gates.push(commandGate(root, pm, scripts, 'build', 'build'));
    }
  }

  // DotWin custom gates (diff-scoped when --since/--changed narrows the file set).
  const docsStrict = flag('--docs-strict') || process.env.DOTWIN_DOCS_STRICT === '1';
  gates.push(secrets(root, { scope }));
  gates.push(security(root, { scope }));
  gates.push(boundaries(root, { scope }));
  gates.push(authz(root, { scope }));
  if (migChanged) { gates.push(rls(root)); gates.push(migrations(root)); }
  if (modulesChanged) gates.push(moduleIsolation(root));
  if (modulesChanged) gates.push(contract(root));
  if (!scope) gates.push(anchors(root));
  gates.push(docs(root, { strict: docsStrict, scope }));

  // --tier=pre is a fast pre-build/pre-commit check, not a build-status run. It passes when no
  // required gate fails; it never claims green and never writes the conformance baseline.
  if (tier !== 'full') {
    const failed = gates.filter((g) => g.required && (g.status === 'fail' || g.status === 'blocked'));
    const preReport = {
      timestamp: new Date().toISOString(), profile: `pre-check${scope ? ' (diff)' : ''}`,
      status: failed.length ? 'failed' : 'passing-partial',
      summary: { passed: gates.filter((g) => g.required && g.status === 'pass').length, requiredTotal: gates.filter((g) => g.required).length, findings: gates.reduce((n, g) => n + g.findings.length, 0) },
      gates, scope: scope ? scope.size : 'all',
    };
    if (flag('--json')) console.log(JSON.stringify(preReport, null, 2)); else printReport(preReport);
    process.exit(failed.length ? 1 : 0);
  }

  // Profile gates layered on top of green.
  if (profile === 'production-candidate' || profile === 'enterprise-ready') {
    gates.push(docGate(root, 'env-example', '.env.example'));
    gates.push(docGate(root, 'deployment-doc', 'DEPLOYMENT.md'));
    gates.push(docGate(root, 'known-risks-doc', 'KNOWN_RISKS.md'));
  }
  if (profile === 'enterprise-ready') {
    gates.push(docGate(root, 'security-doc', 'SECURITY.md'));
    gates.push(docGate(root, 'testing-doc', 'TESTING.md'));
    // Enterprise forbids any unresolved high/critical advisory finding.
    const highOpen = gates.flatMap((g) => g.findings).filter((f) => f.severity === 'critical' || f.severity === 'high');
    gates.push(gate('zero-high-risk', { status: highOpen.length ? 'fail' : 'pass', findings: [], detail: highOpen.length ? `${highOpen.length} high/critical open` : 'none open' }));
  }

  let status = computeStatus(gates);
  if (status === 'green' && profile === 'production-candidate') status = 'production-candidate';
  if (status === 'green' && profile === 'enterprise-ready') status = 'enterprise-ready';

  const requiredGates = gates.filter((g) => g.required);
  const report = {
    timestamp: new Date().toISOString(),
    profile,
    status,
    summary: {
      passed: requiredGates.filter((g) => g.status === 'pass').length,
      requiredTotal: requiredGates.length,
      findings: gates.reduce((n, g) => n + g.findings.length, 0),
    },
    gates,
  };

  if (flag('--json')) {
    console.log(JSON.stringify(report, null, 2));
  } else {
    printReport(report);
  }

  if (flag('--write-state')) {
    writeReport(root, report);
    const wroteState = updateState(root, report);
    const wroteLog = appendLog(root, report);
    // Record the conformance baseline so the next `--changed` run only re-verifies the diff.
    let wroteConf = false;
    if (['green', 'production-candidate', 'enterprise-ready'].includes(status)) {
      const commit = headCommit(root);
      if (commit) {
        fs.mkdirSync(path.join(root, '.dotwin'), { recursive: true });
        fs.writeFileSync(confPath, JSON.stringify({ lastGreenCommit: commit, status, timestamp: report.timestamp }, null, 2));
        wroteConf = true;
      }
    }
    if (!flag('--json')) console.log(`  wrote: docs/build-checks/latest.json${wroteState ? ', STATE.md' : ''}${wroteLog ? ', BUILD_LOG.md' : ''}${wroteConf ? ', .dotwin/conformance.json' : ''}\n`);
  }

  const reached =
    (profile === 'green' && status === 'green') ||
    (profile === 'production-candidate' && status === 'production-candidate') ||
    (profile === 'enterprise-ready' && status === 'enterprise-ready');
  process.exit(reached ? 0 : 1);
}

main();
