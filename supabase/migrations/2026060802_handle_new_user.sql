-- A-9 / A-24: Provision a public.profiles row for every new auth.users signup.
-- Without this, new signups have no profile, so requireAdmin() 403s and every
-- is_admin_or_artist()-gated RLS check fails for them. Default role 'customer'.
-- Down (manual revert):
--   DROP TRIGGER IF EXISTS on_auth_user_created ON auth.users;
--   DROP FUNCTION IF EXISTS public.handle_new_user();

CREATE OR REPLACE FUNCTION public.handle_new_user()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
BEGIN
  INSERT INTO public.profiles (id, email, full_name, avatar_url, role)
  VALUES (
    NEW.id,
    NEW.email,
    COALESCE(NEW.raw_user_meta_data->>'full_name', split_part(NEW.email, '@', 1)),
    NEW.raw_user_meta_data->>'avatar_url',
    'customer'
  )
  ON CONFLICT (id) DO NOTHING;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS on_auth_user_created ON auth.users;
CREATE TRIGGER on_auth_user_created
  AFTER INSERT ON auth.users
  FOR EACH ROW EXECUTE FUNCTION public.handle_new_user();

-- The function is only ever invoked by the trigger above; it is never a valid
-- RPC (it dereferences NEW). Revoke the default PUBLIC execute so it is not
-- exposed at /rest/v1/rpc/handle_new_user. The trigger still fires regardless.
REVOKE EXECUTE ON FUNCTION public.handle_new_user() FROM PUBLIC, anon, authenticated;
