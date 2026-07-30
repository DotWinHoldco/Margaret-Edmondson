-- Smoke-test finding F14 (completion): tables with admin WRITE policies but no admin
-- SELECT policy leave admin surfaces (reading with the user-scoped client) blind to
-- draft/inactive rows (same class as orders showing "No orders found"). Add an
-- admin read-all SELECT policy to the remaining 20 such tables. Additive: non-admin
-- reads stay governed by the existing public SELECT policies (RLS policies are OR'd).
-- Applied to prod via MCP 2026-07-30.
DO $$
DECLARE t text;
DECLARE tables text[] := ARRAY[
  'bio_credentials_block','categories','change_requests','course_modules','courses',
  'email_automation_steps','email_automations','email_campaigns','email_sends','email_templates',
  'faqs','lessons','page_blocks','pages','product_categories','product_images',
  'product_variants','products','site_content','testimonial_media'
];
BEGIN
  FOREACH t IN ARRAY tables LOOP
    EXECUTE format('DROP POLICY IF EXISTS %I ON public.%I', t||'_admin_read_all', t);
    EXECUTE format('CREATE POLICY %I ON public.%I FOR SELECT USING (is_admin_or_artist())', t||'_admin_read_all', t);
  END LOOP;
END $$;
