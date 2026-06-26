# Derived Domain Map + Collision Register

Authored by DotWin
Date: 2026-06-24 · Source: live schema `klwkajukicsoiwpsgftt` (73 public tables)

The authoritative machine-readable map is `src/contracts/domain-map.ts` (area → tables) and
`src/contracts/table-ownership.ts` (table → owner + class). This file records the clustering
rationale and the collisions, which the protocol requires because each collision is a future
write-boundary decision.

## 17 business areas
identity · catalog · commerce · promo · fulfillmentPricing · commissions · lms · classes · cms ·
crm · email · social · analytics · workspace · media · platform.

## Collision / naming register (each is a write-boundary decision deferred to the staged plan)

| Observation | Tables | Why it matters | Decision |
|---|---|---|---|
| No common prefix in commerce | `orders`, `order_items`, `carts`, `wishlist_items` | `check-table-ownership` maps by prefix; these can't be owned by prefix | Own by explicit `tables: []` in the future `commerce` manifest, or rename under `order_*`/`cart_*`. |
| Catalog naming split | `categories` vs `product_categories` | two category concepts; ambiguous ownership | Both owned by `catalog`; clarify in manifest; `categories` is the legacy taxonomy, `product_categories` the join. |
| LMS prefix mix | `enrollments`, `lesson_progress`, `lesson_comments`, `courses`, `course_modules`, `lessons` | mixed `lesson_`/`course_`/bare | Own by explicit `tables` list under `lms`. |
| Shared recoverable logs (by design) | `audit_log`, `webhook_logs` | written from several areas (admin actions, 3 fulfillment webhooks, expire-bookings cron) | Owned by `platform`, class `recoverable`. NOT a violation — side-effect logs are allowed multi-writer. |
| Analytics multi-writer | `meta_events` | written by pixel route + meta-event-sync cron | Owned by `analytics`, class `recoverable`. Fine. |
| Consistent prefix (good) | `commission*`, `bio_*`, `cv_*`, `email_automation_*`, `social_*` | already clean | Direct prefix ownership when converted. |

## Class summary (core vs recoverable)
Core (invariant) tables: 52. Recoverable (side-effect/log/cache) tables: 21 — `product_images`,
`wishlist_items`, `lumaprints_pricing_cache`, `lesson_comments`, `page_revisions`,
`testimonial_media`, `email_sends`, `email_automation_sends`, `email_automation_triggers`,
`unsubscribe_events`, `social_post_media`, `meta_events`, `feedback_audit_log`,
`work_request_audit_log`, `artwork_funnels`, `media_library`, `shared_file_tags`, `audit_log`,
`webhook_logs` (full mapping in `table-ownership.ts`). The class labels feed `check-event-boundaries`
(an event handler may write only recoverable tables) once cells exist.
