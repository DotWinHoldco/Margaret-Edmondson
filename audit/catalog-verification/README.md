# Catalog verification results

Authored by DotWin.

One file per V-step of the build plan's §10 verification protocol
(`audit/FULL-CATALOG-BUILD-PLAN.md`). Every file in this directory is **generated**:
a script writes it, nobody edits it, and a result that was typed rather than printed
proves nothing. Re-running a step overwrites its pair of files.

## What is in here

| File | Written by | What it records |
| --- | --- | --- |
| `V2.json` / `V2.md` | `node --import ./scripts/lib/register-ts.mjs scripts/verify-catalog-pricing.ts --sweep …` | Full-matrix sandbox pricing sweep: the standard size grid at the geometry-neutral default set, every option swapped in one at a time, the maximal distinct-group configuration, the additivity verdict (F26) and the glass-ceiling edge (provider prices it, engine refuses it). |
| `V4.json` / `V4.md` | `node scripts/verify-catalog-orders.mjs --snapshot <fixture> …` | Sandbox order suite: one maximal-option order per medium family (eight today), each through `checkImageConfig`, `POST /orders` and a polled `GET /orders/{n}` echo comparison. |
| `V6.1.json` / `V6.1.md` | `node --import ./scripts/lib/register-ts.mjs scripts/verify-catalog-pricing.ts --parity` | Legacy parity: every active print variant in the production database re-derives its catalog configuration and re-prices to the stored price, cents-exact. |
| `V3.*` | the geometry harness (`scripts/verify-catalog-geometry.mjs`, later phase) | Reserved name, same shape. |
| `V7.checklist.json` | **a person** | The one hand-maintained file here: the production launch gate's items, each `green`, `owed` or `human`. The assembler reads it; nothing writes it. |

The `.json` is the machine record the P9 report generator assembles; the `.md` is the
same data for a person reading the PR. Both come from one call to
`writeStepResult()` in `scripts/lib/verification-report.ts`, so they cannot disagree.

## The shape of a result

```jsonc
{
  "step": "V2",
  "title": "…",
  "startedAt": "…", "finishedAt": "…", "durationMs": 0,
  "commit": "<git rev-parse HEAD at run time>",
  "host": "us.api-sandbox.lumaprints.com",
  "counts": { "assertions": 315, "passed": 286, "failed": 29, "skipped": 0 },
  "failures": [{ "assertion": "…", "detail": "expected vs actual", "context": { } }],
  "notes": ["RECORDED: …", "FINDING: …", "SKIPPED: … — reason"],
  "tables":  [{ "title": "Per subcategory", "columns": [], "rows": [[]] }],
  "meta":    { "requestsSent": 5, "…": "run parameters" },
  "green": true
}
```

Three rules the writer enforces, so no step can soften them on its own:

1. **`green` is `failed === 0`.** Nothing else. The launch gate reads this field.
2. **A skip is counted and explained.** `counts.skipped` sits next to `counts.passed`
   and every skip writes its reason into `notes`. A guard that did not run is not a
   guard that passed.
3. **A classification is not a verdict.** `FINDING F36` marks a subcategory this host
   would not price at all in this run; its assertions are counted as skipped, and the
   sandbox is known to refuse scattered items under sustained load. Verify such a
   profile on production before reading it as broken.
4. **Documented drops are not failures and not skips.** A standard size outside a
   subcategory's published bounds, or a subcategory a run deliberately excluded, is
   listed (in a table cell or a note) because the harness chose not to ask the
   question. It never moves a count.
5. **No flag softens a failure into a pass.** A flag may tighten a run (`--strict`
   below) and a mode may narrow one (`--no-orders`), but nothing turns a failed
   assertion green, and a narrowed run's missing assertions are counted as skips.

### How a per-item drop is read (F36 vs F37)

The sandbox answers a long sweep with `{"success": false}` and **no message** for
scattered items that price perfectly well on their own moments later. Two
classifications, both counted as skips and neither a verdict about a catalog row:

- **F36 — UNPRICEABLE (this environment).** A subcategory whose ENTIRE default-set grid
  came back unpriced. Nothing below it can be measured, so its option and configuration
  assertions are skipped as one block.
- **F37 — per-item sandbox drop.** Scattered silent rows inside a subcategory that DID
  price other items in the same run. By default the run skips those two assertions per
  dropped item and writes one `FINDING F37` note per subcategory saying how many of its
  items dropped. `--strict` counts every residual drop as FAILED instead, so the run
  goes red on any drop at all, and when every failure in a strict run is an F37 drop the
  result carries `DIAGNOSIS (cause class: sandbox-drop)`. `--retry-passes N` (default 2)
  sets how many times an unpriced item is asked again before it is judged.

A row that says WHY it failed is never either of these: it is a refusal, and it fails.

`notes` carries four prefixes worth knowing: `RECORDED:` is an observation the plan
asks us to keep but not to assert on (framed-paper additivity, F26; what the provider
does at the glass ceiling), `FINDING:` is provider behaviour we did not expect (F35 —
Canvas Finish accepted, never echoed — is recorded once per subcategory and deliberately
exempt from the echo assertion), `DIAGNOSIS (cause class: …):` names the single reason a
run went red when many failures share one, and `SKIPPED:` is an assertion that could not
be made, with why.

## How P9 assembles the report

`audit/CATALOG-VERIFICATION-REPORT.md` is generated, not written:

```
npm run verify:catalog-report
node scripts/catalog-verification-report.mjs [--dir audit/catalog-verification] \
     [--vitest-json <path>] [--out audit/CATALOG-VERIFICATION-REPORT.md]
```

The assembler reads every `V*.json` here, orders them by plan step, and emits one
section per step with its status line, its counts, its notes, every failure enumerated
(the first 50; the rest are counted) and its tables. A step with no JSON file is
reported as **MISSING** rather than skipped over. V1's counts come from the vitest JSON
reporter (`npx vitest run --reporter=json --outputFile=<path>`), where a pending test is
counted as a skip, and the V5 money-path section is filtered out of the same file's
per-file results. The V7 section lists every checklist item with its status and its
evidence. Because each result carries its own `commit` and `host`, the report also shows
whether the steps were run against the same tree (a result from an older commit is stale
evidence, not a pass).

The last line of the report is the launch verdict, and it is derived, never typed:
`GO` only when every automatable step is green and every checklist item is green or a
declared human gate; otherwise `NO-GO` followed by every blocker — each RED or MISSING
step, and each checklist item still `owed`.

## Running the steps

Every step runs through the loader hook, `scripts/lib/register-ts.mjs`, which gives
plain node the project's module resolution so the scripts import the real catalog
modules instead of copies of them. `scripts/verify-catalog-orders.mjs` registers that
hook itself, so it runs as a plain `node scripts/…` command. See
`docs/verification-harness.md` for the arguments, the budgets and what each run costs.

V4's own arguments:

```
node scripts/verify-catalog-orders.mjs --snapshot <fixture.json> [--env .env.luma] \
     [--no-orders] [--max-orders 8] [--out audit/catalog-verification]
```

`--no-orders` builds the plan and runs `checkImageConfig` only; every order and echo
assertion is SKIPPED with `--no-orders` as its reason and counted. `--out` exists so a
dry run writes somewhere harmless instead of overwriting a real `V4.json`. The plan
itself is pure and lives in `scripts/lib/v4-configs.mjs`: it builds the catalog tree
from the snapshot, chooses one maximal-option configuration per medium family, and
throws rather than sending anything `evaluateSelection` refuses, because a configuration
our own gate would reject measures the harness and not the provider.
