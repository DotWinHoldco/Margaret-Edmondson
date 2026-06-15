-- Rename the cactus piece "Sometime" -> "Royal" across the catalog. Runs after
-- 2026061503 (which seeds the cactuses sort_order while the slug is still
-- 'sometime'), so replay order is correct. Storage object moves
-- (web/cactuses/sometime.webp -> royal.webp, masters/cactuses/sometime.jpg ->
-- royal.jpg) are handled by scripts/rename-royal.mjs; this migration repoints
-- the DB references.
update products
   set title = 'Royal', slug = 'royal', updated_at = now()
 where slug = 'sometime';

update product_images pi
   set alt_text = 'Royal - water gouache cactus painting',
       print_master_path = 'masters/cactuses/royal.jpg',
       url = replace(replace(url, 'cactuses/sometime.webp', 'cactuses/royal.webp'), '?v=2', '?v=3')
  from products p
 where pi.product_id = p.id and p.slug = 'royal';

update master_artworks
   set title = 'Royal', file_name = 'royal.jpg', storage_path = 'masters/cactuses/royal.jpg'
 where storage_path = 'masters/cactuses/sometime.jpg';

update product_variants pv
   set sku = replace(pv.sku, 'sometime-', 'royal-')
  from products p
 where pv.product_id = p.id and p.slug = 'royal' and pv.sku like 'sometime-%';
