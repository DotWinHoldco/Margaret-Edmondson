-- Phase 4.3 Account self-service: own-row RLS for wishlist_items + addresses.
--
-- A signed-in user may manage ONLY their own rows (profile_id = auth.uid()).
-- profiles.id IS auth.uid() (no auth_user_id column), so addresses.profile_id
-- and wishlist_items.profile_id are the auth UID directly.
--
-- Idempotent: enables RLS unconditionally (no-op if already on) and re-creates
-- each policy via DROP POLICY IF EXISTS + CREATE so a re-run is safe and the
-- definitions converge on the canonical own-row predicate.
--
-- Down (manual revert): DROP POLICY IF EXISTS each policy created below.

-- ---------------------------------------------------------------------------
-- wishlist_items
-- ---------------------------------------------------------------------------
ALTER TABLE public.wishlist_items ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Users can read own wishlist" ON public.wishlist_items;
CREATE POLICY "Users can read own wishlist" ON public.wishlist_items
  FOR SELECT TO authenticated USING (auth.uid() = profile_id);

DROP POLICY IF EXISTS "Users can insert own wishlist" ON public.wishlist_items;
CREATE POLICY "Users can insert own wishlist" ON public.wishlist_items
  FOR INSERT TO authenticated WITH CHECK (auth.uid() = profile_id);

DROP POLICY IF EXISTS "Users can delete own wishlist" ON public.wishlist_items;
CREATE POLICY "Users can delete own wishlist" ON public.wishlist_items
  FOR DELETE TO authenticated USING (auth.uid() = profile_id);

-- ---------------------------------------------------------------------------
-- addresses
-- ---------------------------------------------------------------------------
ALTER TABLE public.addresses ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Users can read own addresses" ON public.addresses;
CREATE POLICY "Users can read own addresses" ON public.addresses
  FOR SELECT TO authenticated USING (auth.uid() = profile_id);

DROP POLICY IF EXISTS "Users can insert own addresses" ON public.addresses;
CREATE POLICY "Users can insert own addresses" ON public.addresses
  FOR INSERT TO authenticated WITH CHECK (auth.uid() = profile_id);

DROP POLICY IF EXISTS "Users can update own addresses" ON public.addresses;
CREATE POLICY "Users can update own addresses" ON public.addresses
  FOR UPDATE TO authenticated USING (auth.uid() = profile_id) WITH CHECK (auth.uid() = profile_id);

DROP POLICY IF EXISTS "Users can delete own addresses" ON public.addresses;
CREATE POLICY "Users can delete own addresses" ON public.addresses
  FOR DELETE TO authenticated USING (auth.uid() = profile_id);
