# Catalog sync v2 — operator notes

Authored by DotWin

What the print catalog is, how it refreshes, and what to do when a run stops. Covers
`lumaprints_subcategories`, `lumaprints_option_groups`, `lumaprints_options` and
`catalog_sync_runs`. The legacy medium sync at `/api/admin/lumaprints/sync` is a different
thing and still feeds the live store; nothing here touches it.

## What a run does

A run walks the provider catalog in five stages and merges what it finds:

1. `categories` — one request, lists the provider's categories.
2. `subcategories` — one request per category, writes the subcategory rows (bounds, DPI, name).
3. `options` — one request per subcategory, writes its option groups and options.
4. `defaults` — one batch pricing request that asks for every subcategory with an empty options
   array. This is the only place in the codebase that sends an empty set, and its purpose is to
   record what the provider would have picked, never to accept it. Subcategories that refuse the
   empty set have their frame style group marked `required`.
5. `finalize` — rows this run did not see are tombstoned (`removed_from_api`, never deleted), the
   catalog cache tag is evicted, and on a host that has never completed a walk the live
   configuration is seeded once.

Finalize refuses to tombstone anything when the run saw fewer than half the subcategories the host
already knows. A provider outage that answers with an empty index would otherwise switch the whole
catalog off in one tick. The run fails instead, and the next one starts over.

A full walk of the current catalog is 59 provider requests: 1 + 7 + 50 + 1.

## Merge rules (what sync will and will not change)

Sync owns: `name`, bounds, `required_dpi`, `api_group_name`, `api_option_name`, `required`,
`provider_default`, the dependency links, `last_seen_at`, `last_synced_at`, `removed_from_api`.

Sync never touches, on a row that already exists: `enabled`, `is_default`, `display_label`,
`description`, `customer_note`, `sort_order`, `swatch`, `geometry`, `pricing_mode`,
`acknowledged_at`. Those are yours. Re-running a sync cannot undo your configuration.

New rows always arrive `enabled = false` with `acknowledged_at` null, which is the NEW badge in
the admin.

**A tombstone is not a toggle.** A row that vanishes from the provider gets `removed_from_api` and
nothing else. Your `enabled` answer stays exactly as you left it. The row stops being offered the
moment it is tombstoned, because the loader treats a tombstoned row as unsellable whatever its
toggle says, and if the provider lists the row again your answer is still there. Rows are never
deleted, because paid orders reference them.

## Chunks

A walk is minutes of provider time and a serverless invocation has sixty seconds, so a run is a
row that successive invocations advance. Each chunk takes at most **8 provider requests** and 45
seconds, and stops starting a new call within ten seconds of the end of its budget so a slow
response is never killed mid-flight. It writes its cursor only after its own writes succeeded, and
re-running a chunk produces the same rows, so a timeout costs one repeat and never a half-merged
catalog. A full walk is **8 chunks**.

Requests are paced to **12 per minute**. The provider allows 40 per minute on the key the
storefront also quotes with, so more than two thirds stay free for customers even mid-walk.

Only one invocation walks a run at a time. Each chunk claims the run first (a conditional write on
its heartbeat), so an admin pressing the button while the cron is working does not double-spend the
request budget: the loser returns the run untouched and reports `claimed: false`.

## Cron window

`/api/cron/lumaprints-catalog-sync` runs `*/5 8-10 * * *` (UTC), which is about 03:00 to 05:00
Central. A tick does one of four things:

| Situation | What happens |
|---|---|
| A run is in flight | advance it by one chunk |
| A run failed less than an hour ago | `{ "skipped": true, "reason": "cooldown" }` |
| A walk completed in the last six days | `{ "skipped": true, "reason": "fresh" }` |
| Otherwise | open a run and walk its first chunk |

The cooldown matters: without it a provider outage would be retried every five minutes all night,
spending the shared request budget on the same failure. Pressing the admin button is not subject to
the cooldown, so you can always retry by hand.

Before any of that, a run still marked `running` whose heartbeat stopped more than fifteen minutes
ago is failed with `stale: no heartbeat for 15 minutes`. Only one run per host may be `running`, so
without this a single killed invocation would wedge the catalog permanently.

## Running one by hand

- `GET /api/admin/lumaprints/catalog-sync` — the last ten runs for this provider host plus the
  one in flight.
- `POST /api/admin/lumaprints/catalog-sync` — open a run and walk its first chunk. Answers 409
  when a run is already in flight for the host.
- `POST /api/admin/lumaprints/catalog-sync?continue=<runId>` — walk one more chunk.
- `POST /api/admin/lumaprints/catalog-sync` with `{"dryRun": true}` — the same walk, writing
  nothing. The run row's `diff` lists what a real run would insert, tombstone and change.

Both routes are admin-gated. The walk itself then runs as a system process, the same one the
cron runs, so a manual run and a nightly run cannot diverge in what they are able to write.

## Badges and what they mean

- **NEW** (`acknowledged_at` is null): the provider added this row since the last time anyone
  looked. It is off. Read it, price it, then decide.
- **Removed** (`removed_from_api`): the provider dropped it. It is off and stays in the table so
  order history still reads. Nothing to do unless it was enabled, in which case customers lost an
  option and the replacement needs choosing.
- **Blocked**: an option whose `geometry` says it cannot be enabled yet. The rolled-canvas border
  sizes carry `probe_owed` until the V3 geometry probe records an image check for each of them.

## When a run stops

A run that throws is marked `failed` and will not resume: its cursor points at a chunk that did not
finish, and re-entering it would bury the reason. Read the row, fix the cause, then start a new run.
Starting a new one is allowed as soon as the failed one is terminal.

`error` is a classification, never provider text. A provider 4xx body is written by a third party
and can quote the request that produced it, and a request to this provider carries a key, so the
row keeps only the class and the detail goes to the server log, where it expires.

| `error` | What it means |
|---|---|
| `provider_error:<status>` | The provider answered with that HTTP status. Check the server log for the body. |
| `budget_exhausted` | The key-wide request budget was already spent. It will pass on its own. |
| `disabled` | The LumaPrints kill switch is off. Nothing to fix here. |
| `refused_tombstone` | The walk was too short to be trusted with tombstones. Usually a provider outage. |
| `stale: no heartbeat for 15 minutes` | An invocation was killed. The next tick opens a fresh run. |
| `internal` | A bug on our side. The log has it. |
