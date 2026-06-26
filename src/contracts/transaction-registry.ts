// Authored by DotWin
// Declared cross-domain atomic operations. Each entry MUST be implemented once as a single
// database transaction (a SECURITY DEFINER RPC) whose body writes exactly `touches`.
// check-rpc-exists verifies the function exists in a migration and its body writes exactly the
// declared touches. Rule 1: ACID invariants outrank module purity.
//
// Reverse-engineered for the ArtByME app during adopt (2026-06-24). Only operations that cross a
// domain's write boundary are listed here. Same-domain atomic owners and a staged (not-yet-built)
// owner are documented below the array — they are intentionally NOT array entries.
//
// CROSS-DOMAIN ATOMIC OWNERS (verified against migrations; check-rpc-exists asserts touches):
//   record_order_for_contact — crm x promo. The webhook records an order's effect on a CRM
//     contact and redeems a promo in one transaction: updates crm_contacts loyalty totals,
//     inserts promo_code_redemptions (single-use unique index), and increments promo_codes
//     usage_count. Body verified in supabase/migrations/20260522_crm_anon_rpcs.sql.
export const transactions: Array<{
  name: string;
  owner: string;
  touches: string[];
  atomic: true;
}> = [
  {
    name: 'record_order_for_contact',
    owner: 'crm',
    touches: ['crm_contacts', 'promo_code_redemptions', 'promo_codes'],
    atomic: true,
  },
];

// SAME-DOMAIN ATOMIC OWNERS (not cross-domain, so not gated entries, but they ARE the declared
// SECURITY DEFINER owners of their invariant — enumerated here for the audit's privilege surface):
//   book_class_session  — classes. Locks class_sessions FOR UPDATE, capacity-checks, inserts
//                         class_bookings atomically (no oversell). migration 2026060806.
//   reserve_original    — catalog. Locks product_variants FOR UPDATE, decrements one-of-a-kind
//                         original inventory atomically (no oversell). migration 2026060806.
//   upsert_contact_to_list — crm. Upserts crm_contacts + contact_list_members. migration 20260522.
//
// STAGED (TO BUILD — see audit/ADOPT-2026-06-24/STAGED-REFACTOR-PLAN.md, finding ACID-1):
//   create_order_with_items — commerce. Would consolidate the webhook's orders + order_items
//     (+ carts conversion) writes into one RPC, replacing the current resume-safe / idempotent
//     sequential PostgREST writes (P2). NOT registered until the function exists, or check-rpc-exists
//     would fail (the registry forbids aspirational entries). The current path is correct under
//     partial failure (Stripe redelivery + onConflict + side_effects_completed_at claim); this is a
//     Tier-B atomicity-of-record upgrade, not a defect fix.
