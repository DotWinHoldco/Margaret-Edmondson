-- Materialized verbatim from the production migration ledger
-- (supabase_migrations.schema_migrations) on 2026-08-06 for disaster-recovery
-- completeness.
--
-- This change was applied to the production project through the management API and
-- had no corresponding file in supabase/migrations/. The body below is the ledger
-- row's statements joined with a blank line, each terminated by a semicolon, and is
-- reproduced without modification.
--
-- Ledger version: 20260401003826
-- Ledger name:    add_rls_policies


-- Public read policies for content tables
CREATE POLICY "Public can read active products" ON products FOR SELECT USING (status = 'active');
CREATE POLICY "Public can read product images" ON product_images FOR SELECT USING (true);
CREATE POLICY "Public can read product variants" ON product_variants FOR SELECT USING (true);
CREATE POLICY "Public can read categories" ON categories FOR SELECT USING (true);
CREATE POLICY "Public can read site content" ON site_content FOR SELECT USING (is_active = true);
CREATE POLICY "Public can read visible page blocks" ON page_blocks FOR SELECT USING (is_visible = true);
CREATE POLICY "Public can read featured testimonials" ON testimonials FOR SELECT USING (true);
CREATE POLICY "Public can read published faqs" ON faqs FOR SELECT USING (is_published = true);
CREATE POLICY "Public can read published blog posts" ON blog_posts FOR SELECT USING (status = 'published');
CREATE POLICY "Public can read published courses" ON courses FOR SELECT USING (status = 'published');
CREATE POLICY "Public can read pages" ON pages FOR SELECT USING (true);

-- Newsletter subscribers: public insert
CREATE POLICY "Anyone can subscribe to newsletter" ON newsletter_subscribers FOR INSERT WITH CHECK (true);

-- Profiles: users can read/update own
CREATE POLICY "Users can read own profile" ON profiles FOR SELECT USING (auth.uid() = id);
CREATE POLICY "Users can update own profile" ON profiles FOR UPDATE USING (auth.uid() = id);

-- Orders: users can read own
CREATE POLICY "Users can read own orders" ON orders FOR SELECT USING (auth.uid() = profile_id);
CREATE POLICY "Users can read own order items" ON order_items FOR SELECT USING (
  order_id IN (SELECT id FROM orders WHERE profile_id = auth.uid())
);

-- Commissions: users can read own, public can create
CREATE POLICY "Users can read own commissions" ON commissions FOR SELECT USING (auth.uid() = profile_id);
CREATE POLICY "Anyone can create commission" ON commissions FOR INSERT WITH CHECK (true);

-- Commission messages: users can read own commission messages
CREATE POLICY "Users can read own commission messages" ON commission_messages FOR SELECT USING (
  commission_id IN (SELECT id FROM commissions WHERE profile_id = auth.uid())
);

-- Enrollments: users can read own
CREATE POLICY "Users can read own enrollments" ON enrollments FOR SELECT USING (auth.uid() = profile_id);

-- Lesson progress: users can manage own
CREATE POLICY "Users can read own progress" ON lesson_progress FOR SELECT USING (
  enrollment_id IN (SELECT id FROM enrollments WHERE profile_id = auth.uid())
);
CREATE POLICY "Users can update own progress" ON lesson_progress FOR UPDATE USING (
  enrollment_id IN (SELECT id FROM enrollments WHERE profile_id = auth.uid())
);
CREATE POLICY "Users can insert own progress" ON lesson_progress FOR INSERT WITH CHECK (
  enrollment_id IN (SELECT id FROM enrollments WHERE profile_id = auth.uid())
);

-- Carts: users can manage own
CREATE POLICY "Users can read own cart" ON carts FOR SELECT USING (auth.uid() = profile_id);
CREATE POLICY "Users can update own cart" ON carts FOR UPDATE USING (auth.uid() = profile_id);
CREATE POLICY "Users can create cart" ON carts FOR INSERT WITH CHECK (true);

-- Wishlist: users can manage own
CREATE POLICY "Users can read own wishlist" ON wishlist_items FOR SELECT USING (auth.uid() = profile_id);
CREATE POLICY "Users can insert own wishlist" ON wishlist_items FOR INSERT WITH CHECK (auth.uid() = profile_id);
CREATE POLICY "Users can delete own wishlist" ON wishlist_items FOR DELETE USING (auth.uid() = profile_id);

-- Addresses: users can manage own
CREATE POLICY "Users can read own addresses" ON addresses FOR SELECT USING (auth.uid() = profile_id);
CREATE POLICY "Users can insert own addresses" ON addresses FOR INSERT WITH CHECK (auth.uid() = profile_id);
CREATE POLICY "Users can update own addresses" ON addresses FOR UPDATE USING (auth.uid() = profile_id);
CREATE POLICY "Users can delete own addresses" ON addresses FOR DELETE USING (auth.uid() = profile_id);

-- Change requests: users can create and read own
CREATE POLICY "Users can create change requests" ON change_requests FOR INSERT WITH CHECK (auth.uid() = requester_id);
CREATE POLICY "Users can read own change requests" ON change_requests FOR SELECT USING (auth.uid() = requester_id);

-- Lesson comments: enrolled users can read/write
CREATE POLICY "Users can read lesson comments" ON lesson_comments FOR SELECT USING (true);
CREATE POLICY "Users can create lesson comments" ON lesson_comments FOR INSERT WITH CHECK (auth.uid() = profile_id);

-- Course modules and lessons: public read
CREATE POLICY "Public can read course modules" ON course_modules FOR SELECT USING (true);
CREATE POLICY "Public can read lessons" ON lessons FOR SELECT USING (true);
