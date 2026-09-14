-- Authored by DotWin. Additive fields preserve the current tax election.
ALTER TABLE public.site_settings ADD COLUMN IF NOT EXISTS tax_included boolean NOT NULL DEFAULT false;
ALTER TABLE public.orders ADD COLUMN IF NOT EXISTS tax_included boolean NOT NULL DEFAULT false;
COMMENT ON COLUMN public.site_settings.tax_included IS 'When tax_enabled, extract Stripe Tax from prices instead of adding it. Nexus states and active Stripe registrations still apply.';
COMMENT ON COLUMN public.orders.tax_included IS 'Purchase-time tax behavior: tax is already included in subtotal/shipping when true.';
