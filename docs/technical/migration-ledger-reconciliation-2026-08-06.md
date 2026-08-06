# Migration ledger reconciliation, 2026-08-06

Authored by DotWin

Project: `klwkajukicsoiwpsgftt` (production). Ledger table: `supabase_migrations.schema_migrations`.

## Why

The remote ledger and `supabase/migrations/` had drifted apart. Most migrations were applied
through a management API that stamped its own 14-digit apply-time version, while the repo kept
human-curated filenames with shorter, hand-written date prefixes. The two sets did not map one
to one: some applied changes had no file at all, and some files had no ledger row. In that state
`supabase db push` cannot be trusted (it would try to re-apply work already in production), and a
disaster-recovery rebuild from the repo would not reproduce the live schema.

This pass establishes a one-to-one correspondence: every file `<version>_<name>.sql` has exactly
one ledger row with the same version and name, and every applied change has a file.

Canonical version strings are the ledger's existing 14-digit versions wherever a row exists, since
those encode real apply order. Files were renamed to match. Files with no row received a generated
14-digit version derived from their date prefix.

## Result

| Outcome | Count |
| --- | ---: |
| Files renamed | 62 |
| Files materialized from ledger rows | 14 |
| Ledger name normalisations proposed (UPDATE) | 14 |
| Ledger backfills proposed (INSERT) | 14 |
| Ledger rows found non-materializable | 0 |
| Files flagged genuinely unapplied | 1 |
| Ledger rows proposed for DELETE | 0 |

Starting state: 61 ledger rows, 62 in-scope files (68 total minus the 6 ignored).
End state: 76 in-scope files, 75 existing-or-proposed ledger rows. The single file without a row
is the one verified as not applied, covered below.

Out of scope and untouched, per the parallel work in progress: local files `2026080601` through
`2026080606`, and any ledger row with version `>= 20260806000000`. The ledger currently holds no
row at or above that version (its maximum is `20260801062820`), so the ignore set on the ledger
side was empty in practice.

## Ledger fidelity

The working copy of the ledger used for matching was proven faithful before any decision was made:
61 rows both sides, and `md5(string_agg(version || '|' || name, E'\n' ORDER BY version))` returned
`9c99b191029a2913615a740bd8246759` from the server, matching the locally computed digest exactly.

## Twin confirmations

Three ledger rows had no same-name file but were believed to be twins of differently-named files.
All three are confirmed. Evidence below is from comparing the ledger row's `statements` against the
file contents.

### 1. `account_self_service_rls` (20260608151825) and `2026060809_account_rls.sql`

Confirmed, exact semantic match. Both contain the same 10 operations in the same order:
`ALTER TABLE public.wishlist_items ENABLE ROW LEVEL SECURITY`, `ALTER TABLE public.addresses ENABLE
ROW LEVEL SECURITY`, and eight `DROP POLICY IF EXISTS` plus `CREATE POLICY` pairs covering
wishlist read/insert/delete and addresses read/insert/update/delete, every one with the predicate
`auth.uid() = profile_id`. The file differs only by added comments.

### 2. `align_email_campaigns_automations_shape` (20260520194601) and `20260522_align_email_tables_shape.sql`

Confirmed by identical object signature. The same extraction regex was run server-side over the
ledger row's statements and locally over the file. Both sides returned exactly the same ten
operations with the same counts:

| Operation | Ledger | File |
| --- | ---: | ---: |
| alter table public.email_campaigns | 26 | 26 |
| alter table public.email_automation_steps | 11 | 11 |
| alter table public.email_automations | 5 | 5 |
| create index email_campaigns_status_idx | 1 | 1 |
| create index email_campaigns_scheduled_idx | 1 | 1 |
| create index email_automation_steps_auto_idx | 1 | 1 |
| create trigger email_campaigns_touch | 1 | 1 |
| create trigger email_automations_touch | 1 | 1 |
| drop trigger email_campaigns_touch | 1 | 1 |
| drop trigger email_automations_touch | 1 | 1 |

Sizes differ only by comments and whitespace (ledger 8036 bytes, file 7855 bytes).

### 3. `handle_new_user_trigger` (20260608051235) and `2026060802_handle_new_user.sql`

Confirmed, with one thing worth recording. The ledger row contains
`CREATE OR REPLACE FUNCTION public.handle_new_user()` (identical body, `SECURITY DEFINER`,
`SET search_path = ''`, `ON CONFLICT (id) DO NOTHING`), then `DROP TRIGGER IF EXISTS
on_auth_user_created ON auth.users` and `CREATE TRIGGER on_auth_user_created`. The file reproduces
all of that verbatim and adds one trailing statement:

```sql
REVOKE EXECUTE ON FUNCTION public.handle_new_user() FROM PUBLIC, anon, authenticated;
```

That REVOKE is not an unrecorded change. It is the entire body of a separate ledger row,
`lock_handle_new_user_from_public` (20260608053610), confirmed by reading that row: its statements
are exactly that one line. So the curated file is the union of two applied ledger rows.

The pairing is still correct, and both rows keep their own file, so the REVOKE now appears in two
files: `20260608051235_handle_new_user_trigger.sql` and
`20260608053610_lock_handle_new_user_from_public.sql`. REVOKE is idempotent, so a replay runs it
twice with no difference in outcome. Recorded here so nobody later reads it as a duplicate to be
cleaned up without understanding why it is there.

## Applied-verification of files with no ledger row

Fifteen local files had no ledger row under any name. Each was checked against the live catalog.
The brief allowed one or two characteristic objects per file; that turned out to be too weak, since
`20260521_carts_extend.sql` passes a two-object spot check but is only partially applied. Every
object each file declares was therefore extracted and checked: 62 objects across 14 files, plus a
data probe for the one pure data migration.

Probe queries used (all read-only):

```sql
-- table
to_regclass('public.' || :obj) IS NOT NULL
-- index
EXISTS (SELECT 1 FROM pg_indexes WHERE schemaname = 'public' AND indexname = :obj)
-- function
EXISTS (SELECT 1 FROM pg_proc p JOIN pg_namespace n ON n.oid = p.pronamespace
        WHERE n.nspname = 'public' AND p.proname = :obj)
-- column
EXISTS (SELECT 1 FROM information_schema.columns WHERE table_schema = 'public'
        AND table_name = split_part(:obj, '.', 1) AND column_name = split_part(:obj, '.', 2))
```

| File | Objects checked | Present | Result | Detail |
| --- | ---: | ---: | --- | --- |
| `20260515_margin_protected_pricing.sql` | 5 | 5 | applied | table site_settings; columns products.margin_pct, product_variants.wholesale_cost, product_variants.worst_case_shipping, product_variants.shipping_quoted_at |
| `20260519_cv_entries.sql` | 3 | 3 | applied | tables cv_entries, cv_settings; index cv_entries_section_sort_idx |
| `20260519_media_library.sql` | 4 | 4 | applied | table media_library; indexes media_library_bucket_idx, media_library_categories_idx, media_library_created_at_idx |
| `20260519_phase5b_cleanup.sql` | 2 | 2 | applied | columns bio_sections.image_url, bio_sections.image_alt |
| `20260519_variant_builder.sql` | 16 | 16 | applied | table lumaprints_pricing_cache; 12 product_variants/products columns; indexes product_variants_product_medium_idx, lumaprints_pricing_cache_expires_idx |
| `20260520_lumaprints_mediums.sql` | 1 | 1 | applied | table lumaprints_mediums |
| `20260521_carts_extend.sql` | 8 | 7 | **NOT applied** | 5 carts columns; indexes carts_contact_idx, carts_status_idx present; index carts_nurture_idx ABSENT |
| `20260521_email_campaigns.sql` | 9 | 9 | applied | tables email_campaigns, email_campaign_recipients, email_automations, email_automation_steps; 5 indexes |
| `20260521_unsubscribes.sql` | 3 | 3 | applied | table unsubscribe_events; indexes unsubscribe_events_contact_idx, unsubscribe_events_email_idx |
| `2026061501_margin_cascade_categories.sql` | 5 | 5 | applied | table product_categories; column categories.default_margin_pct; column product_variants.updated_at; index product_categories_pk; function reprice_variants |
| `2026061502_gross_margin_basis.sql` | 2 | 2 | applied | function reprice_variants exists, and its prosrc contains shipping_cost_cents (proves the gross-margin rewrite, not the earlier definition) |
| `2026061503_product_category_sort.sql` | 2 | 2 | applied | column product_categories.sort_order; data effect: 41 rows have sort_order set |
| `2026061504_rename_sometime_to_royal.sql` | 2 | 2 | applied | data migration, no DDL objects: products with slug=royal is 1, products with slug=sometime is 0 |
| `2026061505_product_image_crop_original.sql` | 3 | 3 | applied | columns product_images.original_url, original_width, original_height |
| `2026080501_public_print_readiness.sql` | 1 | 1 | applied | function public.get_public_print_readiness |

Fourteen of fifteen verified as fully applied and receive a proposed ledger INSERT. The exception
is covered next.

## Unapplied file: carts_extend

**`20260521_carts_extend.sql`, now `20260521000001_carts_extend.sql`, is not applied in production.**

Seven of its eight declared objects exist, but `carts_nurture_idx` does not. The full index list on
`public.carts` in production is `carts_pkey`, `carts_contact_idx`, `carts_status_idx`,
`idx_carts_email`, `idx_carts_activity`. All three of the file's indexes are created by consecutive
`create index if not exists` lines, so if the file had ever run as a unit, all three would exist.

The reason the other seven objects exist is that a later, differently-scoped migration re-implemented
most of this file. Ledger row `unsubscribes_carts_extend_email_recipients` (20260520190949, whose
file is now `20260520190949_unsubscribes_carts_extend_email_recipients.sql`) adds the same carts
columns and creates `carts_contact_idx` and `carts_status_idx`, but it does not create
`carts_nurture_idx`. Confirmed by matching that row's statements: it references `nurture_started_at`
and `carts_contact_idx`, and does not reference `carts_nurture_idx`.

So `20260521_carts_extend.sql` was superseded before it was ever applied, and `carts_nurture_idx`
exists in no applied migration.

Consequences and the recommendation:

- **No ledger INSERT is proposed for this file.** Recording it as applied would be false.
- This is the one place the repo and production genuinely diverge. A replay of the repo produces
  `carts_nurture_idx`; production does not have it.
- The file is fully idempotent (`add column if not exists` five times, `create index if not exists`
  three times, `drop policy if exists` then `create policy` twice). The `status` column carries its
  CHECK constraint inside `add column if not exists`, so that is skipped too when the column exists.
  Applying it forward is therefore safe and would create only the one missing index.
- Recommended resolution, for the integrator to decide: let `supabase db push` apply it, which
  creates `carts_nurture_idx` and records the row automatically. Because its version sorts below
  already-applied versions, the CLI will treat it as out of order and may require `--include-all`.
  The alternative, if the index is not wanted, is to drop the index line and backfill the row.
  Either way the decision is a schema change and is deliberately left out of this pass.

## Materialized files

Fourteen ledger rows had no file. Each is now written to `supabase/migrations/` as
`<version>_<name>.sql`, with a header stating it was materialized verbatim from the production
ledger on 2026-08-06 for disaster-recovery completeness.

Every row in this ledger holds exactly one element in `statements`, so the documented join rule
(each statement trimmed of trailing whitespace, given a terminating semicolon if it lacks one, then
joined with a blank line) reduces to a single statement per file.

No row was non-materializable: all 61 rows have a non-null `statements` array of length 1, so there
is **no replay caveat** from missing ledger content.

Each materialized body was verified byte-identical to the ledger. The server computed
`md5(canonical_body)` and the local file was hashed the same way; all 14 matched.

| Ledger version | Name | Bytes | md5 (server and file) |
| --- | --- | ---: | --- |
| `20260401002724` | create_core_schema | 17778 | `e4db2cf9f71802c1edf32c188abe7b2d` |
| `20260401003826` | add_rls_policies | 4778 | `310c64def9edfa77ec4e7411f6ae27c1` |
| `20260401174048` | add_print_ecommerce_columns | 391 | `e2a1de92ad31768328786d7e661a849a` |
| `20260415214421` | testimonials_expand_and_media | 2235 | `70dab8602bbca3dde10ad609ac69690c` |
| `20260421185851` | shared_files_module | 3167 | `5a05584e82b9898018039306928f0f4f` |
| `20260421191257` | add_testimonial_image_url | 72 | `5a31240176b8863d5d2e426ddd976c1e` |
| `20260421193151` | shared_file_tags | 1828 | `f3fbd75af101f95bddb65ea03e096d0a` |
| `20260421193542` | testimonials_admin_rls | 1699 | `4e6b83b43858906b3c275d6cab53753e` |
| `20260520155453` | page_revisions_pin_search_path | 634 | `87d6accd15a62c4288732eb04d4b83fb` |
| `20260520155626` | page_revisions_deterministic_trim | 966 | `81f8c743cdb462d7436eb96e0a9d2330` |
| `20260520190327` | subscribe_to_newsletter_rpc_fix_random | 2741 | `604d0a86218626f007ce994e5d0cc74d` |
| `20260520191058` | validate_promo_code_public_fix | 3658 | `3f1ebf20ba2bc23492c689ddd636ce9e` |
| `20260608052030` | lock_rls_auto_enable_from_public | 85 | `df2f2884ebdd6e2454eaeb74b053ee14` |
| `20260608053610` | lock_handle_new_user_from_public | 85 | `b67eb6b0acadea0b70bc91e97d1ae5c8` |

Two fidelity notes, since these bodies are reproduced without modification and should not be
"corrected" by a later reader:

- `20260401002724_create_core_schema.sql` defines `courses.instructor_name` with
  `DEFAULT 'ArtByMe'`. House branding is "ArtByME". This is the live production default, so it is
  preserved here as-is. Fixing it is a schema change and belongs in its own forward migration.
- `20260520155626_page_revisions_deterministic_trim.sql` contains an em dash inside a SQL comment.
  It is part of the applied statement text and is kept verbatim.

## Generated versions and collision check

Files with no ledger row received a 14-digit version built from their existing date prefix plus a
sequence that preserves their current relative order. Each was checked against the live ledger for
collisions and for correct sort position against its neighbouring rows. No collisions were found.

| Generated version | File | Previous ledger version | Next ledger version |
| --- | --- | --- | --- |
| `20260515000001` | `20260515000001_margin_protected_pricing.sql` | `20260421193542` | `20260520155222` |
| `20260519000001` | `20260519000001_cv_entries.sql` | `20260421193542` | `20260520155222` |
| `20260519000002` | `20260519000002_media_library.sql` | `20260421193542` | `20260520155222` |
| `20260519000003` | `20260519000003_phase5b_cleanup.sql` | `20260421193542` | `20260520155222` |
| `20260519000004` | `20260519000004_variant_builder.sql` | `20260421193542` | `20260520155222` |
| `20260520000001` | `20260520000001_lumaprints_mediums.sql` | `20260421193542` | `20260520155222` |
| `20260521000001` | `20260521000001_carts_extend.sql` | `20260520214148` | `20260521145659` |
| `20260521000002` | `20260521000002_email_campaigns.sql` | `20260520214148` | `20260521145659` |
| `20260521000003` | `20260521000003_unsubscribes.sql` | `20260520214148` | `20260521145659` |
| `20260615000001` | `20260615000001_margin_cascade_categories.sql` | `20260608151944` | `20260622144000` |
| `20260615000002` | `20260615000002_gross_margin_basis.sql` | `20260608151944` | `20260622144000` |
| `20260615000003` | `20260615000003_product_category_sort.sql` | `20260608151944` | `20260622144000` |
| `20260615000004` | `20260615000004_rename_sometime_to_royal.sql` | `20260608151944` | `20260622144000` |
| `20260615000005` | `20260615000005_product_image_crop_original.sql` | `20260608151944` | `20260622144000` |
| `20260805000001` | `20260805000001_public_print_readiness.sql` | `20260801062820` | none (highest) |

Replay-order safety was checked rather than assumed. The risk case was
`20260521000002_email_campaigns.sql`, which creates `email_campaigns`, sorting after
`20260520194601_align_email_campaigns_automations_shape.sql`, which alters that table. It is safe:
`create_core_schema` (20260401002724) already creates `email_campaigns`, `email_automations`,
`email_automation_steps` and `carts`, so the ALTERs always find their tables. Confirmed by matching
`create table` targets across all ledger rows. The later `create table if not exists` in the
file is a no-op on replay. Likewise `unsubscribe_events` and `email_campaign_recipients` are created
by 20260520190949, and `crm_contacts` (referenced by the carts foreign key) by 20260520185923, both
of which sort before the generated versions that depend on them.

## Full mapping

| Old filename | New filename | Ledger version | Action |
| --- | --- | --- | --- |
| `(none, ledger row only)` | `20260401002724_create_core_schema.sql` | `20260401002724` | materialized from ledger |
| `(none, ledger row only)` | `20260401003826_add_rls_policies.sql` | `20260401003826` | materialized from ledger |
| `(none, ledger row only)` | `20260401174048_add_print_ecommerce_columns.sql` | `20260401174048` | materialized from ledger |
| `(none, ledger row only)` | `20260415214421_testimonials_expand_and_media.sql` | `20260415214421` | materialized from ledger |
| `(none, ledger row only)` | `20260421185851_shared_files_module.sql` | `20260421185851` | materialized from ledger |
| `(none, ledger row only)` | `20260421191257_add_testimonial_image_url.sql` | `20260421191257` | materialized from ledger |
| `(none, ledger row only)` | `20260421193151_shared_file_tags.sql` | `20260421193151` | materialized from ledger |
| `(none, ledger row only)` | `20260421193542_testimonials_admin_rls.sql` | `20260421193542` | materialized from ledger |
| `20260515_margin_protected_pricing.sql` | `20260515000001_margin_protected_pricing.sql` | `20260515000001` | rename, ledger INSERT proposed |
| `20260519_cv_entries.sql` | `20260519000001_cv_entries.sql` | `20260519000001` | rename, ledger INSERT proposed |
| `20260519_media_library.sql` | `20260519000002_media_library.sql` | `20260519000002` | rename, ledger INSERT proposed |
| `20260519_phase5b_cleanup.sql` | `20260519000003_phase5b_cleanup.sql` | `20260519000003` | rename, ledger INSERT proposed |
| `20260519_variant_builder.sql` | `20260519000004_variant_builder.sql` | `20260519000004` | rename, ledger INSERT proposed |
| `20260520_lumaprints_mediums.sql` | `20260520000001_lumaprints_mediums.sql` | `20260520000001` | rename, ledger INSERT proposed |
| `20260522_page_revisions.sql` | `20260520155222_page_revisions.sql` | `20260520155222` | rename to ledger version |
| `20260522_pages_extend.sql` | `20260520155246_pages_extend.sql` | `20260520155246` | rename to ledger version |
| `(none, ledger row only)` | `20260520155453_page_revisions_pin_search_path.sql` | `20260520155453` | materialized from ledger |
| `(none, ledger row only)` | `20260520155626_page_revisions_deterministic_trim.sql` | `20260520155626` | materialized from ledger |
| `20260522_seed_legal_page_bodies.sql` | `20260520173401_seed_legal_page_bodies.sql` | `20260520173401` | rename to ledger version |
| `20260522_page_blocks_backfill_about_keys.sql` | `20260520183145_page_blocks_backfill_about_keys.sql` | `20260520183145` | rename to ledger version |
| `20260521_crm_contacts.sql` | `20260520185923_crm_contacts.sql` | `20260520185923` | rename to ledger version |
| `20260521_promo_codes_extend.sql` | `20260520190055_promo_codes_extend.sql` | `20260520190055` | rename to ledger version |
| `20260522_subscribe_to_newsletter_rpc.sql` | `20260520190136_subscribe_to_newsletter_rpc.sql` | `20260520190136` | rename to ledger version |
| `(none, ledger row only)` | `20260520190327_subscribe_to_newsletter_rpc_fix_random.sql` | `20260520190327` | materialized from ledger |
| `20260522_crm_anon_rpcs.sql` | `20260520190850_crm_anon_rpcs.sql` | `20260520190850` | rename to ledger version |
| `20260522_unsubscribes_carts_extend_email_recipients.sql` | `20260520190949_unsubscribes_carts_extend_email_recipients.sql` | `20260520190949` | rename to ledger version |
| `(none, ledger row only)` | `20260520191058_validate_promo_code_public_fix.sql` | `20260520191058` | materialized from ledger |
| `20260522_drop_anon_insert_on_crm_tables.sql` | `20260520192517_drop_anon_insert_on_crm_tables.sql` | `20260520192517` | rename to ledger version |
| `20260522_align_email_tables_shape.sql` | `20260520194601_align_email_campaigns_automations_shape.sql` | `20260520194601` | rename, confirmed twin |
| `20260522_track_cart_rpc.sql` | `20260520205602_track_cart_rpc.sql` | `20260520205602` | rename to ledger version |
| `20260522_seed_blog_posts_batch_1.sql` | `20260520211441_seed_blog_posts_batch_1.sql` | `20260520211441` | rename to ledger version |
| `20260520_stripe_test_mode.sql` | `20260520214148_stripe_test_mode.sql` | `20260520214148` | rename to ledger version |
| `20260521_carts_extend.sql` | `20260521000001_carts_extend.sql` | `20260521000001` | rename, NO insert (verified unapplied) |
| `20260521_email_campaigns.sql` | `20260521000002_email_campaigns.sql` | `20260521000002` | rename, ledger INSERT proposed |
| `20260521_unsubscribes.sql` | `20260521000003_unsubscribes.sql` | `20260521000003` | rename, ledger INSERT proposed |
| `20260521_master_artworks.sql` | `20260521145659_master_artworks.sql` | `20260521145659` | rename to ledger version |
| `20260521_print_masters_bucket.sql` | `20260521145715_print_masters_bucket.sql` | `20260521145715` | rename to ledger version |
| `20260521_order_items_failed_statuses.sql` | `20260521152456_order_items_failed_statuses.sql` | `20260521152456` | rename to ledger version |
| `2026060801_webhook_idempotency.sql` | `20260608051222_webhook_idempotency.sql` | `20260608051222` | rename to ledger version |
| `2026060802_handle_new_user.sql` | `20260608051235_handle_new_user_trigger.sql` | `20260608051235` | rename, confirmed twin |
| `2026060803_policy_less_table_rls.sql` | `20260608051330_policy_less_table_rls.sql` | `20260608051330` | rename to ledger version |
| `2026060804_lock_security_definer_grants.sql` | `20260608051409_lock_security_definer_grants.sql` | `20260608051409` | rename to ledger version |
| `2026060805_pii_buckets_private.sql` | `20260608051444_pii_buckets_private.sql` | `20260608051444` | rename to ledger version |
| `(none, ledger row only)` | `20260608052030_lock_rls_auto_enable_from_public.sql` | `20260608052030` | materialized from ledger |
| `(none, ledger row only)` | `20260608053610_lock_handle_new_user_from_public.sql` | `20260608053610` | materialized from ledger |
| `2026060806_money_path_atomicity.sql` | `20260608055342_money_path_atomicity.sql` | `20260608055342` | rename to ledger version |
| `2026060807_blog_scheduled_publish.sql` | `20260608063420_blog_scheduled_publish.sql` | `20260608063420` | rename to ledger version |
| `2026060808_site_settings_expand.sql` | `20260608151808_site_settings_expand.sql` | `20260608151808` | rename to ledger version |
| `2026060809_account_rls.sql` | `20260608151825_account_self_service_rls.sql` | `20260608151825` | rename, confirmed twin |
| `2026060810_social_calendar.sql` | `20260608151859_social_calendar.sql` | `20260608151859` | rename to ledger version |
| `2026060811_email_automation_sends.sql` | `20260608151944_email_automation_sends.sql` | `20260608151944` | rename to ledger version |
| `2026061501_margin_cascade_categories.sql` | `20260615000001_margin_cascade_categories.sql` | `20260615000001` | rename, ledger INSERT proposed |
| `2026061502_gross_margin_basis.sql` | `20260615000002_gross_margin_basis.sql` | `20260615000002` | rename, ledger INSERT proposed |
| `2026061503_product_category_sort.sql` | `20260615000003_product_category_sort.sql` | `20260615000003` | rename, ledger INSERT proposed |
| `2026061504_rename_sometime_to_royal.sql` | `20260615000004_rename_sometime_to_royal.sql` | `20260615000004` | rename, ledger INSERT proposed |
| `2026061505_product_image_crop_original.sql` | `20260615000005_product_image_crop_original.sql` | `20260615000005` | rename, ledger INSERT proposed |
| `2026062201_orders_payment_intent_unique.sql` | `20260622144000_orders_payment_intent_unique.sql` | `20260622144000` | rename, ledger name normalised from `2026062201_orders_payment_intent_unique` |
| `2026062204_newsletter_subscribers_admin_read.sql` | `20260622144007_newsletter_subscribers_admin_read.sql` | `20260622144007` | rename, ledger name normalised from `2026062204_newsletter_subscribers_admin_read` |
| `2026062202_order_items_idempotency.sql` | `20260622144016_order_items_idempotency.sql` | `20260622144016` | rename, ledger name normalised from `2026062202_order_items_idempotency` |
| `2026062203_order_items_submitting_state.sql` | `20260622144023_order_items_submitting_state.sql` | `20260622144023` | rename, ledger name normalised from `2026062203_order_items_submitting_state` |
| `2026062205_adopt_rls_conformance.sql` | `20260622212139_adopt_rls_conformance.sql` | `20260622212139` | rename, ledger name normalised from `2026062205_adopt_rls_conformance` |
| `2026062501_harden_data_exposure.sql` | `20260625185939_harden_data_exposure.sql` | `20260625185939` | rename to ledger version |
| `2026062502_storage_limits.sql` | `20260625214343_storage_limits.sql` | `20260625214343` | rename to ledger version |
| `2026062503_drop_public_bucket_listing.sql` | `20260625223021_drop_public_bucket_listing.sql` | `20260625223021` | rename to ledger version |
| `2026062504_lock_storage_write_policies.sql` | `20260625223040_lock_storage_write_policies.sql` | `20260625223040` | rename to ledger version |
| `2026061601_variant_custom_sizing.sql` | `20260626001156_variant_custom_sizing.sql` | `20260626001156` | rename, ledger name normalised from `2026061601_variant_custom_sizing` |
| `2026061602_retire_legacy_print_variants.sql` | `20260626001204_retire_legacy_print_variants.sql` | `20260626001204` | rename, ledger name normalised from `2026061602_retire_legacy_print_variants` |
| `2026061603_master_print_status.sql` | `20260626003422_master_print_status.sql` | `20260626003422` | rename, ledger name normalised from `2026061603_master_print_status` |
| `2026062800_checkout_snapshots.sql` | `20260628030738_checkout_snapshots.sql` | `20260628030738` | rename, ledger name normalised from `2026062800_checkout_snapshots` |
| `2026062801_g2_account_linkage.sql` | `20260628152929_g2_account_linkage.sql` | `20260628152929` | rename, ledger name normalised from `2026062801_g2_account_linkage` |
| `2026062900_fulfillment_jobs.sql` | `20260629155434_fulfillment_jobs.sql` | `20260629155434` | rename, ledger name normalised from `2026062900_fulfillment_jobs` |
| `2026073001_class_bookings_allow_stripe_payment_method.sql` | `20260730154032_class_bookings_allow_stripe_payment_method.sql` | `20260730154032` | rename, ledger name normalised from `2026073001_class_bookings_allow_stripe_payment_method` |
| `2026073002_admin_read_policies_orders_items_enrollments_blog.sql` | `20260730154541_admin_read_policies_orders_items_enrollments_blog.sql` | `20260730154541` | rename, ledger name normalised from `2026073002_admin_read_policies_orders_items_enrollments_blog` |
| `2026073003_admin_read_all_remaining_tables.sql` | `20260730191129_admin_read_all_remaining_tables.sql` | `20260730191129` | rename, ledger name normalised from `2026073003_admin_read_all_remaining_tables` |
| `2026080101_gate_config_and_launch_checklist.sql` | `20260801062820_gate_config_and_launch_checklist.sql` | `20260801062820` | rename to ledger version |
| `2026080501_public_print_readiness.sql` | `20260805000001_public_print_readiness.sql` | `20260805000001` | rename, ledger INSERT proposed |

Total rows in the table: 76 (62 renames plus 14 materialized).

## Proposed ledger changes

All ledger changes are in `scripts/ledger-reconciliation-2026-08-06.sql`, deliberately outside
`supabase/migrations/` so it is never picked up by `db push`. Nothing in this pass wrote to the
database; every database call was a read-only SELECT.

The script is wrapped in `BEGIN`/`COMMIT`, every statement is guarded (UPDATEs match on the old
name, INSERTs use `WHERE NOT EXISTS`), so a second run is a no-op. It ends with two verification
queries that must both return 0 before committing.

No DELETE statements are proposed. No ledger row was found to be a provable duplicate of another
row for the same change.

### Name normalisations (14)

These rows recorded the old file prefix inside the name column. The version already carries apply
order, so the embedded prefix is stripped in both the filename and the ledger name.

| Version | Old name | New name |
| --- | --- | --- |
| `20260622144000` | `2026062201_orders_payment_intent_unique` | `orders_payment_intent_unique` |
| `20260622144007` | `2026062204_newsletter_subscribers_admin_read` | `newsletter_subscribers_admin_read` |
| `20260622144016` | `2026062202_order_items_idempotency` | `order_items_idempotency` |
| `20260622144023` | `2026062203_order_items_submitting_state` | `order_items_submitting_state` |
| `20260622212139` | `2026062205_adopt_rls_conformance` | `adopt_rls_conformance` |
| `20260626001156` | `2026061601_variant_custom_sizing` | `variant_custom_sizing` |
| `20260626001204` | `2026061602_retire_legacy_print_variants` | `retire_legacy_print_variants` |
| `20260626003422` | `2026061603_master_print_status` | `master_print_status` |
| `20260628030738` | `2026062800_checkout_snapshots` | `checkout_snapshots` |
| `20260628152929` | `2026062801_g2_account_linkage` | `g2_account_linkage` |
| `20260629155434` | `2026062900_fulfillment_jobs` | `fulfillment_jobs` |
| `20260730154032` | `2026073001_class_bookings_allow_stripe_payment_method` | `class_bookings_allow_stripe_payment_method` |
| `20260730154541` | `2026073002_admin_read_policies_orders_items_enrollments_blog` | `admin_read_policies_orders_items_enrollments_blog` |
| `20260730191129` | `2026073003_admin_read_all_remaining_tables` | `admin_read_all_remaining_tables` |

### Backfill inserts (14)

`statements` is the file body split into top-level statements by a splitter that respects single
and double quotes, dollar-quoting (including tagged `$tag$` and nested function bodies), line
comments and block comments. Each split was round-trip checked: rejoining the parts reproduces every
non-whitespace character of the file. Array elements are emitted with a dollar tag chosen to not
occur in the statement text, and the array literal shape was parsed by the server to confirm it is
valid.

| Version | Name | Statements |
| --- | --- | ---: |
| `20260515000001` | margin_protected_pricing | 9 |
| `20260519000001` | cv_entries | 14 |
| `20260519000002` | media_library | 12 |
| `20260519000003` | phase5b_cleanup | 7 |
| `20260519000004` | variant_builder | 13 |
| `20260520000001` | lumaprints_mediums | 8 |
| `20260521000002` | email_campaigns | 27 |
| `20260521000003` | unsubscribes | 8 |
| `20260615000001` | margin_cascade_categories | 8 |
| `20260615000002` | gross_margin_basis | 3 |
| `20260615000003` | product_category_sort | 2 |
| `20260615000004` | rename_sometime_to_royal | 5 |
| `20260615000005` | product_image_crop_original | 1 |
| `20260805000001` | public_print_readiness | 4 |

## Sanity pass

Run after all renames and writes.

**(a) Filenames unique and strictly ordered.** 76 in-scope files, no duplicates, lexicographic order
matches sorted order, every filename matches `^\d{14}_[a-z0-9_]+\.sql$`, and versions are strictly
increasing with no repeats. The 6 ignored files (`2026080601` to `2026080606`) were left untouched.

**(b) One-to-one mapping.** 76 in-scope files against 75 existing-or-proposed ledger rows. Every
ledger row has exactly one file, and every file except one has exactly one row, with matching name in
every case. The single exception is `20260521000001_carts_extend.sql`, the file verified as not
applied, which is intentionally left without a row.

**(c) Migrations gate.** `scripts/check-migrations.mjs` is runnable standalone and was run directly:

```
migrations: pass (82 migration file(s))
```

It emits one non-blocking finding alongside that status line: severity `medium`, rule `types-stale`,
against `src/lib/supabase/database.types.ts`.

The gate passes. The one medium finding is expected and not caused by any schema change: renaming
and writing migration files updates their mtimes, and the gate compares the newest migration mtime
against `src/lib/supabase/database.types.ts`. Only high and critical findings block. Regenerating
the types file will clear it; no schema changed in this pass, so the generated types are still
accurate in content.

## Anything unresolved

One item, stated plainly: `20260521000001_carts_extend.sql` is not applied, and `carts_nurture_idx`
is missing from production. That is a live divergence between the repo and the database and it needs
a decision from the integrator (see the section above). Everything else reconciles cleanly.
