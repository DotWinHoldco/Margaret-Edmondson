-- Per-category manual display order for products. NULL = fall back to
-- created_at (newest first). Set per collection so the grid renders in a
-- deliberate, uniform order.
alter table public.product_categories
  add column if not exists sort_order integer;

-- Cactuses collection ordering. The shop grid renders row-major (left to right,
-- top to bottom), so this order is row-major and maps directly to the rows
-- Margaret laid out:
--   Row 1: Hot Air        | The Dual    | Solo
--   Row 2: Sometime       | Hot Air II  | Pins and Needles
--   Row 3: Don't Mind Me  | Saguaro     | Love Birds
with ord(slug, pos) as (
  values
    ('hot-air', 1), ('the-dual', 2), ('solo-print', 3),
    ('sometime', 4), ('hot-air-ii', 5), ('pins-and-needles', 6),
    ('dont-mind-me', 7), ('saguaro', 8), ('love-birds', 9)
)
update public.product_categories pc
set sort_order = ord.pos
from ord
join products p on p.slug = ord.slug
join categories c on c.slug = 'cactuses'
where pc.product_id = p.id and pc.category_id = c.id;
