// Insert print variants for the 4 new products with unique per-product SKUs.
import { createClient } from '@supabase/supabase-js';
const sb = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL, process.env.SUPABASE_SERVICE_ROLE_KEY, { auth: { persistSession: false } });
const SLUGS = ['saguaro', 'love-birds', 'dont-mind-me', 'girls-trip'];
const { data: tmpl } = await sb.from('products').select('id').eq('slug', 'the-dual').single();
const { data: tvars } = await sb.from('product_variants').select('*').eq('product_id', tmpl.id).neq('variant_type', 'original');
for (const slug of SLUGS) {
  const { data: p } = await sb.from('products').select('id').eq('slug', slug).single();
  const { count } = await sb.from('product_variants').select('*', { count: 'exact', head: true }).eq('product_id', p.id);
  if (count > 0) { console.log(`[skip] ${slug} already has ${count} variants`); continue; }
  const rows = tvars.map(v => { const c = { ...v }; delete c.id; c.product_id = p.id; c.sku = `${slug}-${(c.size_label || 'x')}-${c.variant_type}`; return c; });
  const { error } = await sb.from('product_variants').insert(rows);
  console.log(error ? `[ERR ${slug}] ${error.message}` : `  ✓ ${slug}: ${rows.length} variants inserted`);
}
console.log('done');
