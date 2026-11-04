-- Owner approved matching Margaret's uploaded flier on November 4, 2026.
-- $20 applies through November 19 at 11:59 PM Central; $25 starts at midnight.
-- festive_reserve reads this deadline for all newly created registrations.
-- Existing registrations retain their agreed price.
update public.festive_classes
set early_ends_at = '2026-11-20 00:00:00-06'::timestamptz
where slug = 'festive-paint-at-the-market';
