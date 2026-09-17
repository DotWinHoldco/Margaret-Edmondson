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
5. `finalize` — rows this run did not see are tombstoned (`removed_from_api`, switched off, never
   deleted), the catalog cache tag is evicted, and on a host with nothing enabled yet the live
   configuration is seeded.

A full walk of the current catalog is 59 provider requests: 1 + 7 + 50 + 1.

## Merge rules (what sync will and will not change)

Sync owns: `name`, bounds, `required_dpi`, `api_group_name`, `api_option_name`, `required`,
`provider_default`, the dependency links, `last_seen_at`, `last_synced_at`, `removed_from_api`.

Sync never touches, on a row that already exists: `enabled`, `is_default`, `display_label`,
`description`, `customer_note`, `sort_order`, `swatch`, `geometry`, `pricing_mode`,
`acknowledged_at`. Those are yours. Re-running a sync cannot undo your configuration.

New rows always arrive `enabled = false` with `acknowledged_at` null, which is the NEW badge in
the admin. A row that vanishes from the provider is tombstoned and switched off; it is never
deleted, because paid orders reference it.

## Chunks

A walk is minutes of provider time and a serverless invocation has sixty seconds, so a run is a
row that successive invocations advance. Each chunk takes at most 20 provider requests and 45
seconds, and writes its cursor only after its own writes succeeded. Re-running a chunk produces
the same rows, so a timeout costs one repeat and never a half-merged catalog. A full walk is
three to four chunks.

Requests are paced to 25 per minute. The provider allows 40 per minute on the key the storefront
also quotes with, so the remaining 15 stay free for customers.

## Cron window

`/api/cron/lumaprints-catalog-sync` runs `*/5 8-10 * * *` (UTC), which is about 03:00 to 05:00
Central. Each tick advances an in-flight run by one chunk. When no run is in flight it opens one
only if the last completed walk is more than six days old, so the five-minute cadence never
starts a second walk. It answers `{ "skipped": true }` otherwise.

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

A run that throws is marked `failed` with the message on the row, and it will not resume: its
cursor points at a chunk that did not finish. Read the row, fix the cause, then start a new run.
Starting a new one is allowed as soon as the failed one is terminal. A run stuck in `running`
with an old `updated_at` means invocations stopped arriving, not that the catalog is damaged;
continue it with `?continue=<runId>`.
