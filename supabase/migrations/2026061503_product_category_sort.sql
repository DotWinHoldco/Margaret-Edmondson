-- Per-category manual display order for products. NULL = fall back to
-- created_at (newest first). Set per collection so like-sized pieces can be
-- grouped into the same masonry row.
alter table public.product_categories
  add column if not exists sort_order integer;

-- Cactuses collection ordering. The shop masonry is a CSS multi-column grid
-- (fills column-major, then balances column heights). Because like-sized
-- pieces are grouped, the balanced split lands on 3-per-column, so this
-- column-major order renders as the rows Margaret laid out:
--   Row 1: Hot Air        | The Dual    | Solo
--   Row 2: Sometime       | Hot Air II  | Pins and Needles
--   Row 3: Don't Mind Me  | Saguaro     | Love Birds
with ord(slug, pos) as (
  values
    ('hot-air', 1), ('sometime', 2), ('dont-mind-me', 3),
    ('the-dual', 4), ('hot-air-ii', 5), ('saguaro', 6),
    ('solo-print', 7), ('pins-and-needles', 8), ('love-birds', 9)
)
update public.product_categories pc
set sort_order = ord.pos
from ord
join products p on p.slug = ord.slug
join categories c on c.slug = 'cactuses'
where pc.product_id = p.id and pc.category_id = c.id;
