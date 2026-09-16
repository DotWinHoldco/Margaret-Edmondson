# Adversarial Review of FULL-CATALOG-BUILD-PLAN rev 1 — findings & dispositions

Independent adversarial pass run 2026-09-16 against the rev 1 draft, with the reviewer instructed to verify claims against the actual repo code and to hunt for anything that would break the "complete and working on the first try" requirement. **All 14 findings were accepted and integrated into rev 2** (the version that ships alongside this file). Where each fix landed is noted per finding. The reviewer confirmed the plan's code citations (cart key `context.tsx:48`, checkout dedupe `validation.ts:44-56`, order_items upsert key, cache key `(medium,size_label)`, `isFramedSubcategory` 102xxx, hardcoded canvas copy, AK/HI path) before attacking.

## CRITICAL

**1. Snapshot-version gates would brick order creation at P5 cutover.** The Stripe webhook and `snapshot.ts` contain seven hard `=== 2` / `!== 2` checks (webhook `:153` throws on non-2 — every v3 paid webhook would throw, Stripe retries forever, zero orders created; also `:158`, `:167`, `:376` row-builder branch, `:951`/`:1333` fulfillability nets reading legacy `lumaprints_mediums` columns; plus `snapshotOrderItem`'s own throw). Rev 1 only mentioned the insert key.
→ **Integrated:** P5 now enumerates the full gate sweep (`>= 2` range checks, fulfillability nets migrated off legacy columns), §3 touch list updated, V1/V5 test v3 snapshots through webhook create, resume, attention-net, and replay paths. Finding F22.

**2. Line identity omitted the subcategory — same-size different-depth lines collide.** Option ids are shared across sibling depths (`[2,11]` on every canvas depth), so an options-only hash merges "24×36 · 0.75″" with "24×36 · 1.5″" in cart merge, checkout dedupe, and the order_items key — different physical products at different costs.
→ **Integrated:** canonical `line_hash = sha256(subcategory ‖ sorted option_ids ‖ solidHex)` distinct from the pricing `price_key_hash` (§4.2, ADR-2); dual-depth case added to V5. Finding F23.

## MAJOR

**3. Sync v2 cannot finish inside one serverless invocation** (70–150+ calls at ≤40/min vs 60s `maxDuration` house pattern; weekly cron would time out mid-merge).
→ **Integrated:** chunked, cursor-resumable sync with transactional per-chunk merge, self-re-invoking cron, progress UI (ADR-7, P1). Finding F24.

**4. No storewide variant generation** — nothing created offers for 39 products × 6 new mediums (~3,000 priced rows, hours of rate-limit budget); "sell every medium" was unreachable at store scale.
→ **Integrated:** P3 offer-coverage generator (throttled, resumable, idempotent) + admin coverage report; `bulk-create` added to touch list; P3 exit requires a full run on all 39 products. Finding F25.

**5. Production order path never exercised before real customers** — sandbox orders + prod pricing reads left the prod↔sandbox id mapping as an inference.
→ **Integrated:** V7.9 — one real production QC order (framed paper, maximal safe options) shipped to Margaret and dashboard-verified before any new medium is enabled. Closes F12 fully.

**6. Option-delta additivity assumed, never asserted** — the whole quote engine sums cached per-option deltas; a non-additive combination would misprice every multi-option quote silently.
→ **Integrated:** P0 additivity probe + V2 assertion `apiTotal === base + Σ deltas` on every maximal config, with whole-config-row fallback per subcategory (ADR-3). Finding F26.

**7. In-app help articles contradict the new store** (`src/lib/help/articles.ts`: "does not order a physical mat board or choose a frame for the buyer", "Frame is not included" listing copy, 200-DPI canvas-centric sizing) and were in no touch list.
→ **Integrated:** P8 per-medium rewrite pass with reviewed diff as exit criterion. Finding F27.

**8. A fifth line=variant layer: `cart/quoted-prices.ts`** — the server re-quote application would stamp the same price onto two same-variant lines with different options.
→ **Integrated:** added to §3 touch list, ADR-2, P5, F1 (now "five layers"), V5 assertion. Finding F23/F1.

## MINOR

**9. Plan "added" `solidColorHexCode` to a payload that already has it** (`lumaprints.ts:156`); the real gap is the router never populates it. → G7/F5/P6 text corrected.
**10. `depends_on_group` referenced but missing from the schema.** → columns `depends_on_group` + `depends_hidden_when` added to `lumaprints_option_groups` (§4.1).
**11. Framed-paper frames are almost certainly subcategories, not an option group** — the sync route's own comment says so (`105005 // 1.25w x 0.875h Black Frame … Re-point subcategory_id to offer a different frame style`). → §2 remodeled (one subcategory per frame profile, P0 confirms), §8 row rewritten; toggle coverage preserved on either axis.
**12. "options_hash" had two conflicting definitions** (pricing vs line identity). → split into `price_key_hash` and `line_hash` (§4.2).
**13. Stripe hosted checkout/receipts couldn't distinguish configurations** (title = product+variant only). → option summary appended to line-item titles (ADR-2/P5/V5). Finding F28.
**14. Weekly sync competes with live traffic for the single 40/min API key** → customer-visible 429s at cache-miss time. → sync capped at 25/min in a 03:00–05:00 CT window; quote path 429 backoff + bounded stale-serve (ADR-3/ADR-7). Finding F29.

Reviewer's closing note, verbatim: "Genuinely solid: the snapshot-first fulfillment analysis, F12/F13/F15 (all three verified accurate against the code), ADR-8's behavior-neutral cutover, and the migration/rollback story are correct as written."
