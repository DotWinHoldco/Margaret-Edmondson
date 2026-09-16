# LumaPrints catalog fixtures (Phase 0)

Recorded facts about the live print API, captured so that later phases build against
evidence instead of assumptions (`audit/FULL-CATALOG-BUILD-PLAN.md` §6 P0).

| file | what it is |
|---|---|
| `catalog.<host>.<date>.json` | Verbatim walk: categories → subcategories (bounds + DPI) → option groups/items. One file per API host, because sandbox and production ids are not guaranteed to match (plan §9 F12). |
| `coverage.<host>.<date>.md` | That snapshot scored against the §2 target-catalog checklist: present / MISSING / **EXTRA**, plus a full inventory table of every subcategory. |
| `PROBES.md` | The probe matrix: one section per question, with every request, every status code, the raw body, a verdict and the implication for the plan. |
| `probes.<date>.json` | The same run, machine-readable: probe data plus every request/response record. |
| `id-diff.<date>.md` | Written by `--diff`: sandbox vs production ids mapped **by name**. |

Signed-URL tokens are redacted (`token=REDACTED`) in both committed probe files; the
storage path is what the record needs.

## Running the snapshot

```sh
# Sandbox (credentials in .env.luma; never commit that file)
node scripts/catalog-snapshot.mjs --env .env.luma

# Production, which has no local credentials: capture per category through the
# deployed admin route, save each response as JSON in one directory, then assemble.
#   GET /api/admin/lumaprints/snapshot                      -> category list
#   GET /api/admin/lumaprints/snapshot?category=105         -> one category
#   GET /api/admin/lumaprints/snapshot?category=105&offset=N -> resume when `incomplete`
node scripts/catalog-snapshot.mjs --assemble <dir-of-json-captures>

# Reconcile the two hosts by NAME; exits non-zero if any same-name row has a
# different id (the F12 signal that launch config must be seeded from production).
node scripts/catalog-snapshot.mjs --diff <sandbox.json> <production.json>
```

## Running the probes

```sh
node scripts/verify-catalog-geometry.mjs --env .env.luma \
  --snapshot fixtures/lumaprints/catalog.us.api-sandbox.lumaprints.com.<date>.json
# --no-orders runs the whole matrix without placing sandbox orders.
```

Probe images are generated locally with `sharp` at the exact print aspect and at least
the subcategory's `requiredDPI`, uploaded to the private `print-masters` bucket under
`probes/<run>/`, served through 2-hour signed URLs, and proven reachable (HTTP 200 +
`image/png`) before any provider call uses them. `.env.local` supplies the storage
credentials.

## Budgets and safety

- **Rate:** the provider publishes 40 requests/minute for the whole key, shared with the
  live storefront. Both scripts go through `scripts/lib/lumaprints-probe-client.mjs`,
  which enforces a hard token bucket of **25 requests per rolling 60 seconds**, backs off
  on 429/5xx honouring `x-ratelimit-reset`, and prints `requests`, wall time and the peak
  count in any rolling 60s window at exit. Reference runs: snapshot 58 requests / 122s;
  probe matrix 38 requests / 79s; zero 429s.
- **Orders:** the probe harness submits at most **8** sandbox orders per run (3 in the
  reference run) to store 82222 only, with `externalId` prefix `p0-probe-<run>` and
  `saveImage:false`. The client refuses to submit unless the base URL is the sandbox
  host, and the script refuses to run at all against any other host.
- **Writes:** nothing here writes to the database. The admin snapshot route is read-only
  as well: three GET endpoints, no rows, no prices, no orders.

## Reading the results

Start with the verdict/implication lines in `PROBES.md`; every claim there is backed by
the status code and body printed directly above it. `coverage.*.md` is where the §2
checklist gets its present/missing/EXTRA answer, and its inventory table is the seed data
for the catalog schema.
