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
| `V6.1.json` / `V6.1.md` | `node --import ./scripts/lib/register-ts.mjs scripts/verify-catalog-pricing.ts --parity` | Legacy parity: every active print variant in the production database re-derives its catalog configuration and re-prices to the stored price, cents-exact. |
| `V3.*`, `V4.*` | the geometry and order harnesses (later phases) | Reserved names, same shape. |

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

`notes` carries four prefixes worth knowing: `RECORDED:` is an observation the plan
asks us to keep but not to assert on (framed-paper additivity, F26; what the provider
does at the glass ceiling), `FINDING:` is provider behaviour we did not expect (F35 —
Canvas Finish accepted, never echoed — is recorded once per subcategory and deliberately
exempt from the echo assertion), `DIAGNOSIS (cause class: …):` names the single reason a
run went red when many failures share one, and `SKIPPED:` is an assertion that could not
be made, with why.

## How P9 assembles the report

`audit/CATALOG-VERIFICATION-REPORT.md` is generated, not written: the P9 generator
reads every `*.json` here, orders them by step, and emits one section per step with
its status line, its counts, every failure enumerated, and its tables. A step with no
JSON file is reported as **not run** rather than skipped over, and the launch gate is
green only when every required step's `green` is `true`. Because each result carries
its own `commit` and `host`, the report also shows whether the steps were run against
the same tree (a result from an older commit is stale evidence, not a pass).

## Running the steps

Every step runs through the loader hook, `scripts/lib/register-ts.mjs`, which gives
plain node the project's module resolution so the scripts import the real catalog
modules instead of copies of them. See `docs/verification-harness.md` for the
arguments, the budgets and what each run costs.
