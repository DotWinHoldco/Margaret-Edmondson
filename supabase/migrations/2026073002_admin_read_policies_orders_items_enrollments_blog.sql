-- Smoke-test findings F6/F14: several admin surfaces read with the user-scoped client,
-- but these tables had no admin SELECT policy, leaving admins blind (orders list empty,
-- blog drafts invisible/uncreatable, enrollment stats zeroed). Add admin read-all policies.
-- The remaining 20 tables with the same latent pattern are covered in the remediation build.
-- Applied to prod via MCP 2026-07-30.
CREATE POLICY "orders_admin_read_all" ON public.orders FOR SELECT USING (is_admin_or_artist());
CREATE POLICY "order_items_admin_read_all" ON public.order_items FOR SELECT USING (is_admin_or_artist());
CREATE POLICY "enrollments_admin_read_all" ON public.enrollments FOR SELECT USING (is_admin_or_artist());
CREATE POLICY "blog_posts_admin_read_all" ON public.blog_posts FOR SELECT USING (is_admin_or_artist());
