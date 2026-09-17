# Catalog verification report

Authored by DotWin. **Generated** by `scripts/catalog-verification-report.mjs` from the step
results in `audit/catalog-verification/`. Nothing in this file is typed by hand: every status is
a step result’s own `green` field, every count is that result’s own count, and the verdict is
derived from them. A step with no result file is MISSING, never assumed.

- Generated at: 2026-09-17T14:20:13.859Z
- Results directory: `audit/catalog-verification`
- Commits represented: `dd3c1a90c5e409648a638987016ff65009a02e1f`, `fe1a802a6c3c8e180e6b7915056114526195af5f`
- Hosts represented: `us.api-sandbox.lumaprints.com`, `klwkajukicsoiwpsgftt.supabase.co`
- Vitest reporter output: `/private/tmp/claude-501/-Users-skylarwebber/33beeda3-a4f7-420a-a41c-550c8e0868bd/scratchpad/vitest.json`

> The steps below were not all run against the same tree (2 commits). A result from an older commit is stale evidence, not a pass.

## Steps

| Step | Status | Assertions | Passed | Failed | Skipped | Source |
| --- | --- | --- | --- | --- | --- | --- |
| V1 | **GREEN** | 1022 | 1015 | 0 | 7 | /private/tmp/claude-501/-Users-skylarwebber/33beeda3-a4f7-420a-a41c-550c8e0868bd/scratchpad/vitest.json |
| V2 | **GREEN** | 8305 | 6889 | 0 | 1416 | V2.json |
| V3 | **GREEN** | 16 | 14 | 0 | 2 | V3.json |
| V4 | **GREEN** | 49 | 49 | 0 | 0 | V4.json |
| V5 | **GREEN** | 127 | 122 | 0 | 5 | /private/tmp/claude-501/-Users-skylarwebber/33beeda3-a4f7-420a-a41c-550c8e0868bd/scratchpad/vitest.json |
| V6.1 | **GREEN** | 834 | 834 | 0 | 0 | V6.1.json |
| V7 | **GREEN** | 10 | 6 | 0 | 4 | V7.checklist.json |

## V1 — Contract and fixture tests (CI, every PR)

- Status: **GREEN**
- Assertions: 1022 (passed 1015, failed 0, skipped 7)
- Source: /private/tmp/claude-501/-Users-skylarwebber/33beeda3-a4f7-420a-a41c-550c8e0868bd/scratchpad/vitest.json

> 7 assertion(s) did not run. A skipped guard is no guard: the reasons are in the notes.

### Notes

- Counts are the vitest run's own: 1022 tests, 7 pending (a pending test is counted as a skip).

### Failures

None.

## V2 — Full-matrix sandbox pricing sweep

- Status: **GREEN**
- Assertions: 8305 (passed 6889, failed 0, skipped 1416)
- Commit: `dd3c1a90c5e409648a638987016ff65009a02e1f`
- Host: `us.api-sandbox.lumaprints.com`
- Finished: 2026-09-17T14:05:47.224Z
- Source: V2.json

> 1416 assertion(s) did not run. A skipped guard is no guard: the reasons are in the notes.

### Notes

- SKIPPED (256): 105013 pricing assertions — UNPRICEABLE (this environment): the whole default-set grid came back unpriced after a retry — success:false with no message (row present, price undefined)
- SKIPPED (256): 105023 pricing assertions — UNPRICEABLE (this environment): the whole default-set grid came back unpriced after a retry — success:false with no message (row present, price undefined)
- RECORDED (not asserted, F26): 105001 8x8 NOT additive — base 2057 + deltas [2038, 95, 241, 157, 0, 0, 0] = 4588; api 5321
- RECORDED (not asserted, F26): 105001 36x24 NOT additive — base 6890 + deltas [4798, 1282, 151, 232, 0, 0, 0] = 13353; api 16118
- RECORDED (not asserted, F26): 105002 8x8 NOT additive — base 2057 + deltas [2038, 95, 241, 157, 0, 0, 0] = 4588; api 5321
- RECORDED (not asserted, F26): 105002 36x24 NOT additive — base 6890 + deltas [4798, 1282, 151, 232, 0, 0, 0] = 13353; api 16118
- RECORDED (not asserted, F26): 105003 8x8 NOT additive — base 2057 + deltas [2038, 95, 241, 157, 0, 0, 0] = 4588; api 5321
- RECORDED (not asserted, F26): 105003 36x24 NOT additive — base 6890 + deltas [4798, 1282, 151, 232, 0, 0, 0] = 13353; api 16118
- RECORDED (not asserted, F26): 105005 8x8 NOT additive — base 2121 + deltas [2117, 95, 241, 157, 0, 0, 0] = 4731; api 5464
- RECORDED (not asserted, F26): 105005 40x30 NOT additive — base 8981 + deltas [5570, 1780, 132, 264, 0, 0, 0] = 16727; api 20123
- RECORDED (not asserted, F26): 105006 8x8 NOT additive — base 2121 + deltas [2117, 95, 241, 157, 0, 0, 0] = 4731; api 5464
- RECORDED (not asserted, F26): 105006 40x30 NOT additive — base 8981 + deltas [5570, 1780, 132, 264, 0, 0, 0] = 16727; api 20123
- RECORDED (not asserted, F26): 105007 8x8 NOT additive — base 2121 + deltas [2117, 95, 241, 157, 0, 0, 0] = 4731; api 5464
- RECORDED (not asserted, F26): 105007 40x30 NOT additive — base 8981 + deltas [5570, 1780, 132, 264, 0, 0, 0] = 16727; api 20123
- RECORDED (not asserted, F26): 105008 8x8 NOT additive — base 2121 + deltas [2117, 95, 241, 157, 0, 0, 0] = 4731; api 5464
- RECORDED (not asserted, F26): 105008 40x30 NOT additive — base 8981 + deltas [5570, 1780, 132, 264, 0, 0, 0] = 16727; api 20123
- RECORDED (not asserted, F26): 105009 8x8 NOT additive — base 2121 + deltas [2117, 95, 241, 157, 0, 0, 0] = 4731; api 5464
- RECORDED (not asserted, F26): 105009 40x30 NOT additive — base 8981 + deltas [5570, 1780, 132, 264, 0, 0, 0] = 16727; api 20123
- RECORDED (not asserted, F26): 105010 8x8 NOT additive — base 2121 + deltas [2117, 95, 241, 157, 0, 0, 0] = 4731; api 5464
- RECORDED (not asserted, F26): 105010 40x30 NOT additive — base 8981 + deltas [5570, 1780, 132, 264, 0, 0, 0] = 16727; api 20123
- RECORDED (not asserted, F26): 105011 8x8 NOT additive — base 2121 + deltas [2117, 95, 241, 157, 0, 0, 0] = 4731; api 5464
- RECORDED (not asserted, F26): 105011 40x30 NOT additive — base 8981 + deltas [5570, 1780, 132, 264, 0, 0, 0] = 16727; api 20123
- RECORDED (not asserted, F26): 105015 8x8 NOT additive — base 3966 + deltas [4357, 95, 214, 0, 0, 0] = 8632; api 9263
- RECORDED (not asserted, F26): 105016 8x8 NOT additive — base 2881 + deltas [3039, 95, 241, 157, 0, 0, 0] = 6413; api 7146
- RECORDED (not asserted, F26): 105016 40x30 NOT additive — base 12304 + deltas [6492, 1780, 132, 264, 0, 0, 0] = 20972; api 24368
- RECORDED (not asserted, F26): 105017 8x8 NOT additive — base 2881 + deltas [3039, 95, 241, 157, 0, 0, 0] = 6413; api 7146
- RECORDED (not asserted, F26): 105017 40x30 NOT additive — base 12304 + deltas [6492, 1780, 132, 264, 0, 0, 0] = 20972; api 24368
- RECORDED (not asserted, F26): 105018 8x8 NOT additive — base 3841 + deltas [4205, 95, 241, 157, 0, 0, 0] = 8539; api 9272
- RECORDED (not asserted, F26): 105018 40x30 NOT additive — base 16507 + deltas [7658, 1780, 132, 264, 0, 0, 0] = 26341; api 29737
- RECORDED (not asserted, F26): 105019 8x8 NOT additive — base 3841 + deltas [4205, 95, 241, 157, 0, 0, 0] = 8539; api 9272
- RECORDED (not asserted, F26): 105019 40x30 NOT additive — base 16507 + deltas [7658, 1780, 132, 264, 0, 0, 0] = 26341; api 29737
- RECORDED (not asserted, F26): 105020 8x8 NOT additive — base 4102 + deltas [4521, 95, 241, 157, 0] = 9116; api 9849
- RECORDED (not asserted, F26): 105020 40x30 NOT additive — base 17646 + deltas [7974, 1780, 132, 264, 0, 0, 0] = 27796; api 31192
- RECORDED (not asserted, F26): 105024 8x8 NOT additive — base 2122 + deltas [2117, 71, 241, 0, 0, 0] = 4551; api 5058
- RECORDED (not asserted, F26): 105024 40x30 NOT additive — base 8980 + deltas [5064, 1780, 105, 0, 0, 0] = 15929; api 18411
- RECORDED (not asserted, F26): 105025 8x8 NOT additive — base 2339 + deltas [2360, 95, 241, 157, 0, 0, 0] = 5192; api 5925
- RECORDED (not asserted, F26): 105025 40x30 NOT additive — base 9930 + deltas [5770, 1780, 132, 264, 0, 0, 0] = 17876; api 21272
- RECORDED (not asserted, F26): 105026 8x8 NOT additive — base 2360 + deltas [2387, 71, -160, 0, 0] = 4658; api 5192
- RECORDED (not asserted, F26): 105026 40x30 NOT additive — base 10025 + deltas [5797, 1780, 132, 0] = 17734; api 20413
- RECORDED (not asserted, F26): 105027 8x8 NOT additive — base 2360 + deltas [2120, 241, 0] = 4721; api 4915
- RECORDED (not asserted, F26): 105028 40x30 NOT additive — base 10025 + deltas [5797, 1780, 132, 264, 0, 0, 0] = 17998; api 21394
- RECORDED: 105001 36x24 print + 5in mat (glass 46 x 34in, bounds 36 x 24in) — provider priced $116.88. The provider enforces nothing geometric (P4/F31).
- RECORDED: 105002 36x24 print + 5in mat (glass 46 x 34in, bounds 36 x 24in) — provider priced $116.88. The provider enforces nothing geometric (P4/F31).
- RECORDED: 105003 36x24 print + 5in mat (glass 46 x 34in, bounds 36 x 24in) — provider priced $116.88. The provider enforces nothing geometric (P4/F31).
- RECORDED: 105005 60x40 print + 5in mat (glass 70 x 50in, bounds 60 x 40in) — provider priced $231.52. The provider enforces nothing geometric (P4/F31).
- RECORDED: 105006 60x40 print + 5in mat (glass 70 x 50in, bounds 60 x 40in) — provider priced $231.52. The provider enforces nothing geometric (P4/F31).
- RECORDED: 105007 60x40 print + 5in mat (glass 70 x 50in, bounds 60 x 40in) — provider priced $231.52. The provider enforces nothing geometric (P4/F31).
- RECORDED: 105008 60x40 print + 5in mat (glass 70 x 50in, bounds 60 x 40in) — provider priced $231.52. The provider enforces nothing geometric (P4/F31).
- RECORDED: 105009 60x40 print + 5in mat (glass 70 x 50in, bounds 60 x 40in) — provider priced $231.52. The provider enforces nothing geometric (P4/F31).
- RECORDED: 105010 60x40 print + 5in mat (glass 70 x 50in, bounds 60 x 40in) — provider priced $231.52. The provider enforces nothing geometric (P4/F31).
- RECORDED: 105011 60x40 print + 5in mat (glass 70 x 50in, bounds 60 x 40in) — provider priced $231.52. The provider enforces nothing geometric (P4/F31).
- RECORDED: 105012 60x40 print + 5in mat (glass 70 x 50in, bounds 60 x 40in) — provider priced $231.52. The provider enforces nothing geometric (P4/F31).
- RECORDED: 105013 60x40 print + 5in mat (glass 70 x 50in, bounds 60 x 40in) — provider priced $328.73. The provider enforces nothing geometric (P4/F31).
- RECORDED: 105015 60x40 print + 5in mat (glass 70 x 50in, bounds 60 x 40in) — provider priced $369.24. The provider enforces nothing geometric (P4/F31).
- RECORDED: 105016 60x40 print + 5in mat (glass 70 x 50in, bounds 60 x 40in) — provider priced $288.23. The provider enforces nothing geometric (P4/F31).
- RECORDED: 105017 60x40 print + 5in mat (glass 70 x 50in, bounds 60 x 40in) — provider priced $288.23. The provider enforces nothing geometric (P4/F31).
- RECORDED: 105018 60x40 print + 5in mat (glass 70 x 50in, bounds 60 x 40in) — provider priced $359.92. The provider enforces nothing geometric (P4/F31).
- RECORDED: 105019 60x40 print + 5in mat (glass 70 x 50in, bounds 60 x 40in) — provider priced $359.92. The provider enforces nothing geometric (P4/F31).
- RECORDED: 105020 60x40 print + 5in mat (glass 70 x 50in, bounds 60 x 40in) — provider priced $379.36. The provider enforces nothing geometric (P4/F31).
- RECORDED: 105022 60x40 print + 5in mat (glass 70 x 50in, bounds 60 x 40in) — provider priced $238.75. The provider enforces nothing geometric (P4/F31).
- RECORDED: 105023 60x40 print + 5in mat (glass 70 x 50in, bounds 60 x 40in) — provider priced $315.71. The provider enforces nothing geometric (P4/F31).
- RECORDED: 105024 60x40 print + 5in mat (glass 70 x 50in, bounds 60 x 40in) — provider priced $231.52. The provider enforces nothing geometric (P4/F31).
- RECORDED: 105025 60x40 print + 5in mat (glass 70 x 50in, bounds 60 x 40in) — provider priced $246.86. The provider enforces nothing geometric (P4/F31).
- RECORDED: 105026 60x40 print + 5in mat (glass 70 x 50in, bounds 60 x 40in) — provider priced $248.49. The provider enforces nothing geometric (P4/F31).
- RECORDED: 105027 60x40 print + 5in mat (glass 70 x 50in, bounds 60 x 40in) — provider priced $248.49. The provider enforces nothing geometric (P4/F31).
- RECORDED: 105028 60x40 print + 5in mat (glass 70 x 50in, bounds 60 x 40in) — provider priced $248.49. The provider enforces nothing geometric (P4/F31).
- SKIPPED (190): 105012 pricing assertions — FINDING F37 (per-item sandbox drop): 95 of 128 priced item(s) came back success:false with no message after 2 retry pass(es)
- FINDING F37: 105012 "0.875w x 1.125h Espresso Frame" dropped 95 of 128 priced item(s) on us.api-sandbox.lumaprints.com — a silent success:false in a subcategory that priced other items in the same run, which is throughput and not capability (the same configuration prices on its own moments later). Counted as SKIPPED, never as passed; re-run with --strict, or on the production host, to judge them.
- SKIPPED (128): 105015 pricing assertions — FINDING F37 (per-item sandbox drop): 64 of 128 priced item(s) came back success:false with no message after 2 retry pass(es)
- FINDING F37: 105015 "3w x 0.875h Concerto Black with Gold Frame" dropped 64 of 128 priced item(s) on us.api-sandbox.lumaprints.com — a silent success:false in a subcategory that priced other items in the same run, which is throughput and not capability (the same configuration prices on its own moments later). Counted as SKIPPED, never as passed; re-run with --strict, or on the production host, to judge them.
- SKIPPED (4): 105016 pricing assertions — FINDING F37 (per-item sandbox drop): 2 of 128 priced item(s) came back success:false with no message after 2 retry pass(es)
- FINDING F37: 105016 "1.125w x 0.75h Slimwoods Black Silver Frame" dropped 2 of 128 priced item(s) on us.api-sandbox.lumaprints.com — a silent success:false in a subcategory that priced other items in the same run, which is throughput and not capability (the same configuration prices on its own moments later). Counted as SKIPPED, never as passed; re-run with --strict, or on the production host, to judge them.
- SKIPPED (14): 105020 pricing assertions — FINDING F37 (per-item sandbox drop): 7 of 128 priced item(s) came back success:false with no message after 2 retry pass(es)
- FINDING F37: 105020 "2.5625w x 1h Plein Air Espresso Gold Frame" dropped 7 of 128 priced item(s) on us.api-sandbox.lumaprints.com — a silent success:false in a subcategory that priced other items in the same run, which is throughput and not capability (the same configuration prices on its own moments later). Counted as SKIPPED, never as passed; re-run with --strict, or on the production host, to judge them.
- SKIPPED (220): 105022 pricing assertions — FINDING F37 (per-item sandbox drop): 110 of 128 priced item(s) came back success:false with no message after 2 retry pass(es)
- FINDING F37: 105022 "1.25w x 0.875h Maple Wood Frame" dropped 110 of 128 priced item(s) on us.api-sandbox.lumaprints.com — a silent success:false in a subcategory that priced other items in the same run, which is throughput and not capability (the same configuration prices on its own moments later). Counted as SKIPPED, never as passed; re-run with --strict, or on the production host, to judge them.
- SKIPPED (108): 105024 pricing assertions — FINDING F37 (per-item sandbox drop): 54 of 128 priced item(s) came back success:false with no message after 2 retry pass(es)
- FINDING F37: 105024 "0.875w x 1.125h Maple Wood Frame" dropped 54 of 128 priced item(s) on us.api-sandbox.lumaprints.com — a silent success:false in a subcategory that priced other items in the same run, which is throughput and not capability (the same configuration prices on its own moments later). Counted as SKIPPED, never as passed; re-run with --strict, or on the production host, to judge them.
- SKIPPED (70): 105026 pricing assertions — FINDING F37 (per-item sandbox drop): 35 of 128 priced item(s) came back success:false with no message after 2 retry pass(es)
- FINDING F37: 105026 "1w x 2.25h Matte Black Frame" dropped 35 of 128 priced item(s) on us.api-sandbox.lumaprints.com — a silent success:false in a subcategory that priced other items in the same run, which is throughput and not capability (the same configuration prices on its own moments later). Counted as SKIPPED, never as passed; re-run with --strict, or on the production host, to judge them.
- SKIPPED (168): 105027 pricing assertions — FINDING F37 (per-item sandbox drop): 84 of 128 priced item(s) came back success:false with no message after 2 retry pass(es)
- FINDING F37: 105027 "1w x 2.25h Matte White Frame" dropped 84 of 128 priced item(s) on us.api-sandbox.lumaprints.com — a silent success:false in a subcategory that priced other items in the same run, which is throughput and not capability (the same configuration prices on its own moments later). Counted as SKIPPED, never as passed; re-run with --strict, or on the production host, to judge them.
- SKIPPED (2): 105028 pricing assertions — FINDING F37 (per-item sandbox drop): 1 of 128 priced item(s) came back success:false with no message after 2 retry pass(es)
- FINDING F37: 105028 "1w x 2.25h Matte Maple Frame" dropped 1 of 128 priced item(s) on us.api-sandbox.lumaprints.com — a silent success:false in a subcategory that priced other items in the same run, which is throughput and not capability (the same configuration prices on its own moments later). Counted as SKIPPED, never as passed; re-run with --strict, or on the production host, to judge them.
- FINDING F36: 105013 "2w x 1.0625h Framer's Choice Black with Gold Frame" UNPRICEABLE (this environment) — 0 of 23 in-bounds default-set sizes priced on us.api-sandbox.lumaprints.com, even after a retry. Provider's answer: success:false with no message (row present, price undefined). Its option and configuration assertions were SKIPPED, not failed; verify this profile on the production host before enabling it.
- FINDING F36: 105023 "3w x 1.125h Gold Plein Air Frame" UNPRICEABLE (this environment) — 0 of 23 in-bounds default-set sizes priced on us.api-sandbox.lumaprints.com, even after a retry. Provider's answer: success:false with no message (row present, price undefined). Its option and configuration assertions were SKIPPED, not failed; verify this profile on the production host before enabling it.
- FINDING F35: 101001 Canvas Finish option ids [212, 213] are accepted by pricing but never echoed; cannot be verified through pricing. Exempt from the echo assertion, not a failure.
- FINDING F35: 101002 Canvas Finish option ids [259] are accepted by pricing but never echoed; cannot be verified through pricing. Exempt from the echo assertion, not a failure.
- FINDING F35: 101003 Canvas Finish option ids [212, 213] are accepted by pricing but never echoed; cannot be verified through pricing. Exempt from the echo assertion, not a failure.
- FINDING F35: 101005 Canvas Finish option ids [212, 213] are accepted by pricing but never echoed; cannot be verified through pricing. Exempt from the echo assertion, not a failure.
- FINDING F35: 102001 Canvas Finish option ids [212, 213] are accepted by pricing but never echoed; cannot be verified through pricing. Exempt from the echo assertion, not a failure.
- FINDING F35: 102002 Canvas Finish option ids [259] are accepted by pricing but never echoed; cannot be verified through pricing. Exempt from the echo assertion, not a failure.
- FINDING F35: 102003 Canvas Finish option ids [212, 213] are accepted by pricing but never echoed; cannot be verified through pricing. Exempt from the echo assertion, not a failure.
- RETRY: 1904 item(s) came back unpriced on the first pass and 1224 priced on a later pass. Only the 680 still unpriced at the end were judged. Passes: pass1 retry 1: asked 1904, priced 720 · pass1 retry 2: asked 1184, priced 504.
- Provider budget headers over 184 response(s): x-ratelimit-remaining min 31, last 37.
- Default option sets came from src/lib/catalog/seed-rules.ts (pickSeededDefault), keyed on provider NAMES and never [] (an empty array resolves to Image Wrap / 0.25in bleed — P15).
- Sizes outside a subcategory's published bounds are documented drops, not failures (see the per-subcategory table).

### Failures

None.

#### Per subcategory

| subcategory | medium | sizes priced | options priced | additive ok/total | recorded (105) | glass-ceiling edge | sizes dropped (out of bounds) |
| --- | --- | --- | --- | --- | --- | --- | --- |
| 108001 | foam_mounted_fine_art_paper | 22 | 3 | 0/0 | 0 | n/a | 30x40 |
| 108002 | foam_mounted_fine_art_paper | 22 | 3 | 0/0 | 0 | n/a | 30x40 |
| 108003 | foam_mounted_fine_art_paper | 22 | 3 | 0/0 | 0 | n/a | 30x40 |
| 108005 | foam_mounted_fine_art_paper | 22 | 3 | 0/0 | 0 | n/a | 30x40 |
| 108006 | foam_mounted_fine_art_paper | 22 | 3 | 0/0 | 0 | n/a | 30x40 |
| 108007 | foam_mounted_fine_art_paper | 22 | 3 | 0/0 | 0 | n/a | 30x40 |
| 108009 | foam_mounted_fine_art_paper | 22 | 3 | 0/0 | 0 | n/a | 30x40 |
| 108010 | foam_mounted_fine_art_paper | 22 | 3 | 0/0 | 0 | n/a | 30x40 |
| 101001 | canvas | 22 | 8 | 2/2 | 0 | n/a | 30x40 |
| 101002 | canvas | 23 | 2 | 0/0 | 0 | n/a | none |
| 101003 | canvas | 23 | 9 | 2/2 | 0 | n/a | none |
| 101005 | canvas | 23 | 6 | 2/2 | 0 | n/a | none |
| 102001 | framed_canvas | 23 | 32 | 2/2 | 0 | n/a | none |
| 102002 | framed_canvas | 23 | 4 | 2/2 | 0 | n/a | none |
| 102003 | framed_canvas | 23 | 14 | 2/2 | 0 | n/a | none |
| 103001 | fine_art_paper | 23 | 3 | 0/0 | 0 | n/a | none |
| 103002 | fine_art_paper | 23 | 3 | 0/0 | 0 | n/a | none |
| 103003 | fine_art_paper | 23 | 3 | 0/0 | 0 | n/a | none |
| 103005 | fine_art_paper | 23 | 3 | 0/0 | 0 | n/a | none |
| 103006 | fine_art_paper | 23 | 3 | 0/0 | 0 | n/a | none |
| 103007 | fine_art_paper | 23 | 3 | 0/0 | 0 | n/a | none |
| 103009 | fine_art_paper | 23 | 3 | 0/0 | 0 | n/a | none |
| 105001 | framed_fine_art_paper | 18 | 35 | 0/2 | 2 | provider priced $116.88 | 24x30 24x36 30x40 30x30 40x30 |
| 105002 | framed_fine_art_paper | 18 | 35 | 0/2 | 2 | provider priced $116.88 | 24x30 24x36 30x40 30x30 40x30 |
| 105003 | framed_fine_art_paper | 18 | 35 | 0/2 | 2 | provider priced $116.88 | 24x30 24x36 30x40 30x30 40x30 |
| 105005 | framed_fine_art_paper | 23 | 35 | 0/2 | 2 | provider priced $231.52 | none |
| 105006 | framed_fine_art_paper | 23 | 35 | 0/2 | 2 | provider priced $231.52 | none |
| 105007 | framed_fine_art_paper | 23 | 35 | 0/2 | 2 | provider priced $231.52 | none |
| 105008 | framed_fine_art_paper | 23 | 35 | 0/2 | 2 | provider priced $231.52 | none |
| 105009 | framed_fine_art_paper | 23 | 35 | 0/2 | 2 | provider priced $231.52 | none |
| 105010 | framed_fine_art_paper | 23 | 35 | 0/2 | 2 | provider priced $231.52 | none |
| 105011 | framed_fine_art_paper | 23 | 35 | 0/2 | 2 | provider priced $231.52 | none |
| 105012 | framed_fine_art_paper | 23 | 35 | 0/0 | 0 | provider priced $231.52 | none |
| 105013 | framed_fine_art_paper | 23 | 35 | 0/0 | 0 | provider priced $328.73 | none |
| 105015 | framed_fine_art_paper | 23 | 35 | 0/1 | 1 | provider priced $369.24 | none |
| 105016 | framed_fine_art_paper | 23 | 35 | 0/2 | 2 | provider priced $288.23 | none |
| 105017 | framed_fine_art_paper | 23 | 35 | 0/2 | 2 | provider priced $288.23 | none |
| 105018 | framed_fine_art_paper | 23 | 35 | 0/2 | 2 | provider priced $359.92 | none |
| 105019 | framed_fine_art_paper | 23 | 35 | 0/2 | 2 | provider priced $359.92 | none |
| 105020 | framed_fine_art_paper | 23 | 35 | 0/2 | 2 | provider priced $379.36 | none |
| 105022 | framed_fine_art_paper | 23 | 35 | 0/0 | 0 | provider priced $238.75 | none |
| 105023 | framed_fine_art_paper | 23 | 35 | 0/0 | 0 | provider priced $315.71 | none |
| 105024 | framed_fine_art_paper | 23 | 35 | 0/2 | 2 | provider priced $231.52 | none |
| 105025 | framed_fine_art_paper | 23 | 35 | 0/2 | 2 | provider priced $246.86 | none |
| 105026 | framed_fine_art_paper | 23 | 35 | 0/2 | 2 | provider priced $248.49 | none |
| 105027 | framed_fine_art_paper | 23 | 35 | 0/1 | 1 | provider priced $248.49 | none |
| 105028 | framed_fine_art_paper | 23 | 35 | 0/1 | 1 | provider priced $248.49 | none |
| 106001 | metal | 23 | 5 | 0/0 | 0 | n/a | none |
| 106002 | metal | 16 | 5 | 0/0 | 0 | n/a | 8x10 24x30 24x36 30x40 8x8 30x30 40x30 |
| 107001 | peel_and_stick | 23 | 0 | 0/0 | 0 | n/a | none |

#### Not priceable in this environment (F36)

| subcategory | medium | name | in-bounds sizes tried | assertions skipped | provider's answer |
| --- | --- | --- | --- | --- | --- |
| 105013 | framed_fine_art_paper | 2w x 1.0625h Framer's Choice Black with Gold Frame | 23 | 256 | success:false with no message (row present, price undefined) |
| 105023 | framed_fine_art_paper | 3w x 1.125h Gold Plein Air Frame | 23 | 256 | success:false with no message (row present, price undefined) |

#### Whole-configuration additivity

| subcategory | size | groups | base $ | predicted $ | api $ | diff $ | verdict | treatment |
| --- | --- | --- | --- | --- | --- | --- | --- | --- |
| 101001 | 8x8 | 3 | 14.61 | 23.69 | 23.69 | 0.00 | additive | asserted |
| 101001 | 40x30 | 3 | 66.85 | 75.93 | 75.93 | 0.00 | additive | asserted |
| 101003 | 8x8 | 4 | 18.57 | 30.66 | 30.66 | 0.00 | additive | asserted |
| 101003 | 40x30 | 4 | 60.29 | 86.69 | 86.69 | 0.00 | additive | asserted |
| 101005 | 8x8 | 3 | 7.28 | 7.28 | 7.28 | 0.00 | additive | asserted |
| 101005 | 40x30 | 3 | 32.83 | 32.83 | 32.83 | 0.00 | additive | asserted |
| 102001 | 8x8 | 4 | 38.48 | 77.58 | 77.58 | 0.00 | additive | asserted |
| 102001 | 40x30 | 4 | 101.07 | 246.90 | 246.90 | 0.00 | additive | asserted |
| 102002 | 8x8 | 2 | 36.58 | 36.58 | 36.58 | 0.00 | additive | asserted |
| 102002 | 40x30 | 2 | 94.87 | 94.87 | 94.87 | 0.00 | additive | asserted |
| 102003 | 8x8 | 5 | 45.59 | 56.08 | 56.08 | 0.00 | additive | asserted |
| 102003 | 40x30 | 5 | 122.76 | 147.56 | 147.56 | 0.00 | additive | asserted |
| 105001 | 8x8 | 7 | 20.57 | 45.88 | 53.21 | 7.33 | NOT additive | recorded (F26) |
| 105001 | 36x24 | 7 | 68.90 | 133.53 | 161.18 | 27.65 | NOT additive | recorded (F26) |
| 105002 | 8x8 | 7 | 20.57 | 45.88 | 53.21 | 7.33 | NOT additive | recorded (F26) |
| 105002 | 36x24 | 7 | 68.90 | 133.53 | 161.18 | 27.65 | NOT additive | recorded (F26) |
| 105003 | 8x8 | 7 | 20.57 | 45.88 | 53.21 | 7.33 | NOT additive | recorded (F26) |
| 105003 | 36x24 | 7 | 68.90 | 133.53 | 161.18 | 27.65 | NOT additive | recorded (F26) |
| 105005 | 8x8 | 7 | 21.21 | 47.31 | 54.64 | 7.33 | NOT additive | recorded (F26) |
| 105005 | 40x30 | 7 | 89.81 | 167.27 | 201.23 | 33.96 | NOT additive | recorded (F26) |
| 105006 | 8x8 | 7 | 21.21 | 47.31 | 54.64 | 7.33 | NOT additive | recorded (F26) |
| 105006 | 40x30 | 7 | 89.81 | 167.27 | 201.23 | 33.96 | NOT additive | recorded (F26) |
| 105007 | 8x8 | 7 | 21.21 | 47.31 | 54.64 | 7.33 | NOT additive | recorded (F26) |
| 105007 | 40x30 | 7 | 89.81 | 167.27 | 201.23 | 33.96 | NOT additive | recorded (F26) |
| 105008 | 8x8 | 7 | 21.21 | 47.31 | 54.64 | 7.33 | NOT additive | recorded (F26) |
| 105008 | 40x30 | 7 | 89.81 | 167.27 | 201.23 | 33.96 | NOT additive | recorded (F26) |
| 105009 | 8x8 | 7 | 21.21 | 47.31 | 54.64 | 7.33 | NOT additive | recorded (F26) |
| 105009 | 40x30 | 7 | 89.81 | 167.27 | 201.23 | 33.96 | NOT additive | recorded (F26) |
| 105010 | 8x8 | 7 | 21.21 | 47.31 | 54.64 | 7.33 | NOT additive | recorded (F26) |
| 105010 | 40x30 | 7 | 89.81 | 167.27 | 201.23 | 33.96 | NOT additive | recorded (F26) |
| 105011 | 8x8 | 7 | 21.21 | 47.31 | 54.64 | 7.33 | NOT additive | recorded (F26) |
| 105011 | 40x30 | 7 | 89.81 | 167.27 | 201.23 | 33.96 | NOT additive | recorded (F26) |
| 105015 | 8x8 | 6 | 39.66 | 86.32 | 92.63 | 6.31 | NOT additive | recorded (F26) |
| 105016 | 8x8 | 7 | 28.81 | 64.13 | 71.46 | 7.33 | NOT additive | recorded (F26) |
| 105016 | 40x30 | 7 | 123.04 | 209.72 | 243.68 | 33.96 | NOT additive | recorded (F26) |
| 105017 | 8x8 | 7 | 28.81 | 64.13 | 71.46 | 7.33 | NOT additive | recorded (F26) |
| 105017 | 40x30 | 7 | 123.04 | 209.72 | 243.68 | 33.96 | NOT additive | recorded (F26) |
| 105018 | 8x8 | 7 | 38.41 | 85.39 | 92.72 | 7.33 | NOT additive | recorded (F26) |
| 105018 | 40x30 | 7 | 165.07 | 263.41 | 297.37 | 33.96 | NOT additive | recorded (F26) |
| 105019 | 8x8 | 7 | 38.41 | 85.39 | 92.72 | 7.33 | NOT additive | recorded (F26) |
| 105019 | 40x30 | 7 | 165.07 | 263.41 | 297.37 | 33.96 | NOT additive | recorded (F26) |
| 105020 | 8x8 | 5 | 41.02 | 91.16 | 98.49 | 7.33 | NOT additive | recorded (F26) |
| 105020 | 40x30 | 7 | 176.46 | 277.96 | 311.92 | 33.96 | NOT additive | recorded (F26) |
| 105024 | 8x8 | 6 | 21.22 | 45.51 | 50.58 | 5.07 | NOT additive | recorded (F26) |
| 105024 | 40x30 | 6 | 89.80 | 159.29 | 184.11 | 24.82 | NOT additive | recorded (F26) |
| 105025 | 8x8 | 7 | 23.39 | 51.92 | 59.25 | 7.33 | NOT additive | recorded (F26) |
| 105025 | 40x30 | 7 | 99.30 | 178.76 | 212.72 | 33.96 | NOT additive | recorded (F26) |
| 105026 | 8x8 | 5 | 23.60 | 46.58 | 51.92 | 5.34 | NOT additive | recorded (F26) |
| 105026 | 40x30 | 4 | 100.25 | 177.34 | 204.13 | 26.79 | NOT additive | recorded (F26) |
| 105027 | 8x8 | 3 | 23.60 | 47.21 | 49.15 | 1.94 | NOT additive | recorded (F26) |
| 105028 | 40x30 | 7 | 100.25 | 179.98 | 213.94 | 33.96 | NOT additive | recorded (F26) |

## V3 — Geometry sweep (checkImageConfig against the rules engine)

- Status: **GREEN**
- Assertions: 16 (passed 14, failed 0, skipped 2)
- Commit: `fe1a802a6c3c8e180e6b7915056114526195af5f`
- Host: `us.api-sandbox.lumaprints.com`
- Finished: 2026-09-17T13:56:04.383Z
- Source: V3.json

> 2 assertion(s) did not run. A skipped guard is no guard: the reasons are in the notes.

### Notes

- RECORDED (P2, provider behaviour the engine is written to): Frame profile IS the subcategory axis: 25 subcategories in 105, each named for a frame profile, and NO frame-style option group exists (confirmed). Mat Size, Mat Color, Paper Type, Glazing, Hardware, Backing and Print Mounting are option...
- RECORDED (P4, provider behaviour the engine is written to): 60x40 No Mat: $153.87; +5in mat (glass would be 70x50): $231.52; 105001 36x24 +5in mat: $116.88; over-max width 62: PRICED (published bounds are NOT enforced by pricing). checkImageConfig 200, recommended 40x60in (= the ordered print siz...
- RECORDED (P5, provider behaviour the engine is written to): No Bleed 200 (control, recommended 8x10in = the ordered size); 0.25in bleed 406 expecting 2x4in; 1.00in bleed 406 expecting -16x-14in — a NEGATIVE size, which no image can satisfy; re-check with an image at the API's own expectation: 200...
- SKIPPED (P6): checkImageConfig 200 with Solid Color selected; submit not attempted order n/a; price $10.99. Submit did not return 201 — read the raw body before enabling the option.
- RECORDED (P7, provider behaviour the engine is written to): single /pricing/product 6/6 accepted; batch /pricing/products 6/6 accepted (HTTP 200); /pricing/shipping 200; checkImageConfig 103001 200 (recommended 9.25x11in vs ordered 9.25x11), 101002 200 (recommended 9.25x11in); fractional sandbox ...
- RECORDED (P8, provider behaviour the engine is written to): No Mat + White mat colour: $22.45 [64,74,83,94,96,146,148]; 2in mat + White: $31.38 [67,74,83,94,96,146,148]. The API silently accepts a mat colour with No Mat (it is echoed in the resolved options at $0), so Mat Color visibility is OURS...
- RECORDED (P9, provider behaviour the engine is written to): 8x10 (whitelisted): $30.57 [32]; 13x19: $68.74 [32]; 30x40: $252.50 [32]; inset frame 13x19 (control): $68.74 [31]. Pricing accepts the easel at sizes outside the published whitelist — the size_whitelist rule is OURS alone, and an unguar...
- RECORDED (P10, provider behaviour the engine is written to): own sawtooth id 11: $21.68 [2,11]; foreign hardware ids 4,5,6,7,8,133 -> 4:rejected 5:rejected 6:rejected 7:rejected 8:rejected 133:rejected. Every foreign hardware id is rejected: per-subcategory option lists are self-enforcing and no s...
- RECORDED (P11, provider behaviour the engine is written to): foamcore id 10 on 101002: REJECTED "orderItemOptions contains an option that is not associated to subcategory 101002."; on 101003 (control): $30.02 [2,4,10]. Rejected as expected: the group boundary is provider-enforced.
- RECORDED (P14, provider behaviour the engine is written to): 16/20 multi-option configurations are additive (apiTotal === base + Σ individually-priced deltas), across 5 families. NON-ADDITIVE: framed paper 105005 [3in mat instead of none [Mat Size] + Somerset Velvet paper [Paper Type]] base $38.54...
- RECORDED (P15, provider behaviour the engine is written to): Pricing with [] returns resolved options — 101002: [1=Image Wrap, 11=Sawtooth Hanger installed]; 103001: [36=0.25in Bleed (0.25in on each side)]. checkImageConfig with []: canvas 406 (expects 11.75x13.75in for an 8x10 order), paper 406 (...
- SKIPPED (P16): SKIPPED: orders disabled (--no-orders)

### Failures

None.

#### Probes

| probe | key | verdict | requests | question |
| --- | --- | --- | --- | --- |
| P1 | required | PASS | 3 | Which subcategories reject an empty options array, and what is the MINIMAL required group set? |
| P2 | cat105 | FINDING | 0 | Is the frame profile the SUBCATEGORY axis on Framed Fine Art Paper (105), or an option group? |
| P3 | mat | PASS | 4 | For framed paper with a mat, does the API take the PRINT size (glass derived) or the glass size — and what expectedAspectRatio comes back? |
| P4 | ceiling | FINDING | 2 | At the glass ceiling (largest in-bounds print + 5in mat), does the API 4xx, price anyway, or silently accept? |
| P5 | bleed | FINDING | 5 | Does a paper Bleed option behave like a mat (per_side_in, image stays at the ordered aspect) or does it shrink the image inside the sheet (blocked)? |
| P6 | solid | SKIPPED | 3 | Does Solid Color Wrap with solidColorHexCode pass checkImageConfig, submit, and echo back on GET /orders? |
| P7 | fractional | FINDING | 11 | Which endpoints accept fractional inches (9.25 x 11)? |
| P8 | matcolor | FINDING | 1 | Is a Mat Color accepted when Mat Size = No Mat (dependent-visible group)? |
| P9 | easel | FINDING | 1 | Does the metal easel price only at the published whitelist sizes? |
| P10 | hardware | FINDING | 1 | On 1.25in canvas (sawtooth-only hardware group), what happens to the other depths’ hardware ids? |
| P11 | foamcore | FINDING | 1 | Is the foamcore underlayer rejected on a depth that does not publish that group? |
| P12 | glazing | PASS | 1 | Is glazing a real option group on framed paper (priced), or always-on? |
| P13 | deltas | PASS | 2 | Do per-option prices vary by print size (the cache-key assumption)? |
| P14 | additivity | FINDING | 1 | Does a whole configuration price equal base + the sum of individually-priced option deltas? |
| P15 | defaults | FINDING | 3 | What does an EMPTY options array resolve to, and is that default safe for aspect-exact masters? |
| P16 | orderecho | SKIPPED | 0 | Do queued sandbox orders materialise, and does GET /orders/{n} echo the option ids, the fractional dimensions and solidColorHexCode? |

## V4 — Sandbox order suite (one maximal-option order per medium)

- Status: **GREEN**
- Assertions: 49 (passed 49, failed 0, skipped 0)
- Commit: `fe1a802a6c3c8e180e6b7915056114526195af5f`
- Host: `us.api-sandbox.lumaprints.com`
- Finished: 2026-09-17T13:54:21.140Z
- Source: V4.json

### Notes

- FINDING F35: 101001 Canvas Finish id(s) [213] sent with order 10000339587; echoed back. Exempt from the echo assertion, not a failure.
- RECORDED (P16): order 10000339587 carries solidColorHexCode #c8102e in the request; the provider's order item echoes only [subcategoryId, externalItemId, quantity, width, height, file, itemCostTotal, orderItemOptions] and never the hex, so our own record is the sole evidence of the colour.
- FINDING F35: 102001 Canvas Finish id(s) [213] sent with order 10000339588; echoed back. Exempt from the echo assertion, not a failure.
- FINDING F35: 101005 Canvas Finish id(s) [212] sent with order 10000339594; echoed back. Exempt from the echo assertion, not a failure.
- Every configuration was proved against evaluateSelection before the provider was called; a configuration the engine refuses aborts the run as a harness bug (F30).
- Canvas Finish ids are exempt from the echo assertion (F35: accepted, never echoed) and the solid-colour hex is asserted from the request record (P16: never echoed).

### Failures

None.

#### One order per medium family

| medium | subcategory | size (in) | option ids | order number | echo |
| --- | --- | --- | --- | --- | --- |
| canvas | 101001 0.75in Stretched Canvas | 16 x 20 | 3,5,213 | 10000339587 | exact |
| framed_canvas | 102001 0.75in Framed Canvas | 16 x 20 | 2,17,213,243 | 10000339588 | exact |
| fine_art_paper | 103001 Archival Matte Fine Art Paper | 9.25 x 11 | 39 | 10000339589 | exact |
| framed_fine_art_paper | 105005 1.25w x 0.875h Black Frame | 11 x 14 | 69,75,93,95,107,146,148 | 10000339590 | exact |
| foam_mounted_fine_art_paper | 108001 Foam-mounted Archival Matte Fine Art Paper | 12.5 x 16 | 39 | 10000339591 | exact |
| metal | 106002 Glossy Silver Metal Print | 8 x 10 | 32 | 10000339592 | exact |
| peel_and_stick | 107001 Peel and Stick Art Print | 12 x 12 | (none published) | 10000339593 | exact |
| rolled_canvas | 101005 Rolled Canvas | 16 x 20 | 2,212 | 10000339594 | exact |

## V5 — Money-path integration tests

- Status: **GREEN**
- Assertions: 127 (passed 122, failed 0, skipped 5)
- Source: /private/tmp/claude-501/-Users-skylarwebber/33beeda3-a4f7-420a-a41c-550c8e0868bd/scratchpad/vitest.json

> 5 assertion(s) did not run. A skipped guard is no guard: the reasons are in the notes.

### Notes

- 13 test file(s) matched the money-path filter /checkout|cart|snapshot|router|fulfillment/i.

### Failures

None.

## V6.1 — Legacy parity: today’s variants re-derive and re-price identically

- Status: **GREEN**
- Assertions: 834 (passed 834, failed 0, skipped 0)
- Commit: `fe1a802a6c3c8e180e6b7915056114526195af5f`
- Host: `klwkajukicsoiwpsgftt.supabase.co`
- Finished: 2026-09-17T13:41:02.360Z
- Source: V6.1.json

### Notes

- Default option sets were computed by src/lib/catalog/rules.ts (defaultOptionIds).
- live sample: not requested

### Failures

None.

#### Per medium

| medium | active print variants | price parity ok | default set ok | subcategory ok |
| --- | --- | --- | --- | --- |
| framed_fine_art_paper | 34 | 34 | 34 | 34 |
| fine_art_paper | 91 | 91 | 91 | 91 |
| canvas | 94 | 94 | 94 | 94 |
| framed_canvas | 29 | 29 | 29 | 29 |
| foam_mounted_fine_art_paper | 30 | 30 | 30 | 30 |

## V7 — Production launch gate (checklist)

- Status: **GREEN**
- Assertions: 10 (passed 6, failed 0, skipped 4)
- Source: V7.checklist.json

> 4 assertion(s) did not run. A skipped guard is no guard: the reasons are in the notes.

| Item | Title | Status | Evidence |
| --- | --- | --- | --- |
| V7.1 | Production catalog sync run, zero unmapped rows | **green** | P1 exit on production (BUILD_LOG #p1-schema-sync, blueprint Proof): sync run bf79e8ce completed (11 chunks, 69 requests, 51/225/1,265 rows, 0 tombstoned); dry run 1f4b624a: 62 requests, 0 new / 0 removed / 0 changed; F12 name-mapping 1,239 same-name-same-id, 0 mismatches (fixtures/lumaprints/id-diff.2026-09-16.md). NEW rows: none (every row acknowledged by the bootstrap); the admin manager shows the NEW badge for future rows. |
| V7.2 | V2 production pricing sweep green; five configurations spot-checked against the provider dashboard | **human** | App side recorded on production (2026-09-17 14:20 UTC, deploy e2b51d0, POST /api/admin/catalog/check from the aal2 admin session, provider called live: fromCache=false, stale=false, 0 violations): canvas 101002 6.05x6 cost $14.44 + ship $7.80; framed canvas 102002 6.05x6 $34.65 + $14.09; paper 103001 4.1x12 $2.48 + $6.67; framed paper 105005 8x8 $21.21 + $9.18; foam 108001 8x8 $12.92 + $6.67. Every cost and shipping figure equals the stored variant row (lumaprints_cost_cents / shipping_cost_cents) to the cent; customer prices differ only by the per-variant margin overrides (200/150/150/150 vs the product margin 100 the check applies), which V6.1 covers. The dashboard comparison of those five costs is the person's step. |
| V7.3 | Margin defaults set per medium (gate: no enabled configuration priced below cost plus shipping) | **green** | SQL on production 2026-09-17: live print variants 278; below cost+shipping 0; unpriced (cost 0) 0; minimum gross margin 2.0% (two Live variants carry a margin_override_pct of 2: Flower Power 20x20 fine_art_paper and Think Again 12x9 canvas; flagged to the owner as accidental overrides, not a gate failure). Per-medium margin defaults remain Margaret's decision (plan §11) before any new medium is enabled. |
| V7.4 | Swatch completeness: no enabled frame or mat option without a swatch | **green** | SQL on production 2026-09-17: enabled frame_style/mat_color options without a swatch (no color_hex and no image_path) = 0 across enabled subcategories; the admin manager header counts the same number live. |
| V7.5 | Billing address configured on the production provider account and the webhook subscription live | **human** | Provider dashboard check by a person (LAUNCH-CHECKLIST 2C: default billing address + valid card on the production LumaPrints account; sandbox orders sit at "Pending Payment" without it). The shipping webhook subscription is the existing one (reachable, gate-exempt, verified 2026-07-30). |
| V7.6 | DB invariants query pack: one default per enabled required group, no enabled option under a disabled group, no live variant on a disabled subcategory, cache hygiene | **green** | SQL query pack on production 2026-09-17, every check 0 violations: required enabled groups without default 0; groups with >1 default 0; enabled options under disabled group 0; enabled groups under disabled subcategory 0; enabled blocked options 0; live variants on disabled medium 0; live variants whose medium has no enabled subcategory 0; enabled frame/mat options without swatch 0; pricing cache v2 rows 0 (expired 0); orders 0; order_items 0. |
| V7.7 | Kill-switch drill: fulfillment flag off and on in production, pause and resume confirmed | **green** | Drill on production 2026-09-17 (SQL, recorded in one transaction-free sequence): site_settings.lumaprints_enabled true -> false -> get_fulfillment_policy().lumaprints_enabled = "false" -> true -> "true"; paused order_items 0 (no in-flight items; the router pause/resume path is covered by test/lumaprints-switch.test.ts and the router tests). |
| V7.8 | Rollback drill on preview: storefront flag off returns the legacy product page | **green** | Production (deploy e2b51d0, 2026-09-17 14:19 UTC): with print_configurator_enabled=false the product page /shop/art/the-dual renders the legacy picker ("Choose artwork or print size", Add Original to Cart) with V6.1-parity prices and no configurator; the same commit on the preview with the door forced open renders the configurator, so the door alone decides (rollback = flag off). Preview rollback with PRINT_CONFIGURATOR_FORCE=off is the same code path (test/catalog/door.test.ts). |
| V7.9 | One real production QC order on live keys, verified in the provider dashboard and on arrival | **human** | — |
| FLAG | Production flag flip, then per-medium enablement of the launch selection | **human** | — |

### Notes

- 10 checklist item(s): 6 green, 0 owed, 4 declared human gate(s).
- A human gate is a step a person performs and records; it is never auto-checked and never counted as green.

### Failures

None.

## Verdict

GO — every automatable step is green and every checklist item is green or a declared human gate.
