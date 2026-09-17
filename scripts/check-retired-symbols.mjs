#!/usr/bin/env node
// Authored by DotWin
// Gate: a symbol that was deliberately retired must not come back.
//
// The catalog build (P8) deletes the hardcoded print tables that the DB now owns. Deleting a
// module is not enough on its own: the next engineer who needs a wholesale cost or a size bound
// can reintroduce the same constant under a new name three files away, and nothing would notice
// until a price is wrong in production. So each retirement is recorded here with its reason and
// its replacement, and this gate greps `src/` and `scripts/` for it on every build.
//
// Two statuses:
//   retired  the symbol is gone; ANY remaining hit in src/ or scripts/ fails the gate.
//   pending  the module still exists because a consumer this unit could not touch still reads
//            it. `blockedBy` names that consumer. Pending symbols print an informational line
//            and never fail; they become `retired` when the blocking file moves to the catalog.
//
// Usage: node scripts/check-retired-symbols.mjs [root]

import { fileURLToPath } from 'node:url';
import path from 'node:path';
import { walk, readText, rel, grepLines } from './lib/scan.mjs';
import { finding, gate } from './lib/report.mjs';

/** @type {{symbol: string, status: 'retired'|'pending', reason: string, blockedBy?: string}[]} */
const REGISTRY = [
  {
    symbol: 'canvas-prints',
    status: 'retired',
    reason: 'The eight-row hardcoded canvas cost/shipping table. Costs come from the provider through lumaprints_pricing_cache and the quote engine; test fixtures keep the golden numbers.',
  },
  {
    symbol: 'CANVAS_SIZES',
    status: 'retired',
    reason: 'The static size list from canvas-prints.ts. Sizes are product_variants rows built against catalog bounds.',
  },
  {
    symbol: 'CHEAPEST_PRINT_PRICE',
    status: 'retired',
    reason: 'A "from $X" teaser computed from the hardcoded table and a fallback margin. A from-price must come from live variant prices.',
  },
  {
    symbol: 'getDefaultWorstCaseShipping',
    status: 'retired',
    reason: 'Hardcoded worst-case CONUS shipping per canvas size. Shipping comes from the provider quote, cached per shipping class.',
  },
  {
    symbol: 'wholesale-lookup',
    status: 'retired',
    reason: 'The two-row map from a legacy lumaprints_type string to a subcategory id plus required option ids. The catalog tree carries both, per subcategory, for every medium.',
  },
  {
    symbol: 'lookupVariantWholesale',
    status: 'retired',
    reason: 'Read the hardcoded cost table and the two-row subcategory map. Replaced by the quote engine and the catalog tree.',
  },
  {
    symbol: 'SUBCATEGORY_BY_LUMAPRINTS_TYPE',
    status: 'retired',
    reason: 'Pinned canvas and framed canvas 1.25in to literal option ids (2, 11, 27, 28). Required options are catalog `required` flags and per-group defaults.',
  },
  {
    symbol: 'boundsForSubcategory',
    status: 'pending',
    blockedBy: 'src/lib/pricing/builder-context.ts',
    reason: 'Seeded bounds and required DPI for five canvas subcategory ids. builder-context.ts already prefers the catalog row and falls back to this map for a subcategory the catalog has not synced; it retires with that fallback, after the storefront flag has been on for a full release.',
  },
  {
    symbol: 'subcategory-bounds',
    status: 'pending',
    blockedBy: 'src/lib/pricing/builder-context.ts',
    reason: 'The module itself. Same fallback as boundsForSubcategory; VariantsTab.tsx reads it for the same reason.',
  },
];

const SCAN_DIRS = ['src', 'scripts'];
const SCAN_EXTS = ['.ts', '.tsx', '.js', '.jsx', '.mjs', '.cjs'];
const SELF = 'scripts/check-retired-symbols.mjs';

function escapeForRegex(value) {
  return value.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

export function runCheck(root) {
  const findings = [];
  const files = walk(root, { exts: SCAN_EXTS, underDirs: SCAN_DIRS })
    .filter((file) => rel(root, file).split(path.sep).join('/') !== SELF);

  const retired = REGISTRY.filter((entry) => entry.status === 'retired');
  const pending = REGISTRY.filter((entry) => entry.status === 'pending');

  for (const file of files) {
    const content = readText(file);
    for (const entry of retired) {
      if (!content.includes(entry.symbol)) continue;
      const where = rel(root, file).split(path.sep).join('/');
      for (const hit of grepLines(content, new RegExp(escapeForRegex(entry.symbol)))) {
        findings.push(
          finding({
            severity: 'high',
            file: where,
            line: hit.line,
            message: `retired symbol "${entry.symbol}" is back: ${hit.text}`,
            rule: 'retired-symbol',
          }),
        );
      }
    }
  }

  return gate('retired-symbols', {
    required: true,
    status: findings.length ? 'fail' : 'pass',
    findings,
    detail: `${retired.length} retired · ${pending.length} pending · ${files.length} files scanned`,
  });
}

/** The pending rows, for the standalone run: they are reported, never enforced. */
export function pendingEntries() {
  return REGISTRY.filter((entry) => entry.status === 'pending');
}

if (path.resolve(process.argv[1] || '') === fileURLToPath(import.meta.url)) {
  const result = runCheck(process.argv[2] || process.cwd());
  for (const entry of pendingEntries()) {
    console.log(`[pending] ${entry.symbol} — blocked by ${entry.blockedBy || 'an unnamed consumer'}`);
  }
  for (const item of result.findings) {
    console.log(`[${item.severity}] ${item.message} (${item.file}:${item.line})`);
  }
  console.log(`retired-symbols: ${result.status} · ${result.detail}`);
  process.exit(result.status === 'pass' ? 0 : 1);
}
