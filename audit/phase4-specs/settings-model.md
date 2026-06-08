# Phase 4.5 Settings Model — Spec

## Summary

Add ~20 missing site settings to `site_settings` table as typed columns (business/contact info, email configuration, shipping origin, tax, social links, SEO/OG defaults, announcement bar, maintenance mode, currency, order-notification recipients). Create a server-side settings accessor library with type safety. Wire admin UI sections in `SettingsClient.tsx` to edit each category. Implement real "Clear All Carts" and "Revalidate Cache" actions. Reference all currently hardcoded values and replace them with dynamic lookups.

---

## Database Schema

### ALTER TABLE site_settings

```sql
ALTER TABLE site_settings
  -- Business & Contact Info
  ADD COLUMN IF NOT EXISTS business_name TEXT DEFAULT 'ArtByME',
  ADD COLUMN IF NOT EXISTS business_email TEXT DEFAULT 'hello@artbyme.studio',
  ADD COLUMN IF NOT EXISTS business_phone TEXT,
  ADD COLUMN IF NOT EXISTS business_address JSONB,
  
  -- Email Configuration
  ADD COLUMN IF NOT EXISTS email_from_name TEXT DEFAULT 'ArtByME',
  ADD COLUMN IF NOT EXISTS email_from_address TEXT DEFAULT 'hello@artbyme.studio',
  ADD COLUMN IF NOT EXISTS order_notification_email TEXT,
  
  -- Shipping Configuration
  ADD COLUMN IF NOT EXISTS shipping_origin_zip TEXT,
  ADD COLUMN IF NOT EXISTS shipping_origin_state TEXT,
  ADD COLUMN IF NOT EXISTS free_shipping_threshold_cents INTEGER,
  
  -- Tax Configuration
  ADD COLUMN IF NOT EXISTS tax_enabled BOOLEAN DEFAULT false,
  ADD COLUMN IF NOT EXISTS tax_rate_pct NUMERIC(5,2),
  ADD COLUMN IF NOT EXISTS tax_nexus_states TEXT[],
  
  -- SEO & Metadata
  ADD COLUMN IF NOT EXISTS seo_title TEXT,
  ADD COLUMN IF NOT EXISTS seo_description TEXT,
  ADD COLUMN IF NOT EXISTS og_image_url TEXT,
  
  -- Social Links
  ADD COLUMN IF NOT EXISTS instagram_url TEXT,
  ADD COLUMN IF NOT EXISTS facebook_url TEXT,
  ADD COLUMN IF NOT EXISTS pinterest_url TEXT,
  
  -- Site Configuration
  ADD COLUMN IF NOT EXISTS announcement_bar_text TEXT,
  ADD COLUMN IF NOT EXISTS announcement_bar_enabled BOOLEAN DEFAULT false,
  ADD COLUMN IF NOT EXISTS maintenance_mode BOOLEAN DEFAULT false,
  ADD COLUMN IF NOT EXISTS currency_code TEXT DEFAULT 'usd',
  
  -- Integration Toggles
  ADD COLUMN IF NOT EXISTS lumaprints_enabled BOOLEAN DEFAULT true,
  ADD COLUMN IF NOT EXISTS printful_enabled BOOLEAN DEFAULT true,
  ADD COLUMN IF NOT EXISTS shipstation_enabled BOOLEAN DEFAULT true,
  ADD COLUMN IF NOT EXISTS meta_pixel_enabled BOOLEAN DEFAULT true,
  
  -- Legal Page Visibility
  ADD COLUMN IF NOT EXISTS show_tos BOOLEAN DEFAULT true,
  ADD COLUMN IF NOT EXISTS show_privacy BOOLEAN DEFAULT true,
  ADD COLUMN IF NOT EXISTS show_shipping_policy BOOLEAN DEFAULT true;

UPDATE site_settings SET 
  email_from_name = 'ArtByME',
  email_from_address = 'hello@artbyme.studio'
WHERE id = true AND email_from_address IS NULL;
```

---

## Current Hardcoded Values to Replace

| Location | Hardcoded | Setting | Usage |
|---|---|---|---|
| `src/lib/email/send.ts:26` | `'ArtByME <hello@artbyme.studio>'` | email_from_name, email_from_address | Resend from line |
| `src/lib/email/send.ts:96` | `'hello@artbyme.studio'` | business_email | Order reply-to |
| `src/app/layout.tsx` | TBD | seo_title, seo_description, og_image_url | Metadata |
| `src/lib/pricing/shipping-quote.ts` | shipping origin logic | shipping_origin_zip, shipping_origin_state | LumaPrints quotes |
| Integration feature gates | env checks | lumaprints_enabled, printful_enabled, etc. | Variant creation toggles |

---

## Admin UI Sections (SettingsClient.tsx)

New sections to create and add to main render:
1. **BusinessInfoSection** — business_name, business_email, business_phone, business_address (5 fields: street, city, state, postal_code, country)
2. **EmailConfigSection** — email_from_name, email_from_address, order_notification_email
3. **ShippingConfigSection** — shipping_origin_zip, shipping_origin_state, free_shipping_threshold_cents
4. **SocialLinksSection** — instagram_url, facebook_url, pinterest_url
5. **SiteConfigSection** — announcement_bar_text + toggle, maintenance_mode toggle, currency_code dropdown
6. **LegalPagesSection** — show_tos, show_privacy, show_shipping_policy (toggles)
7. **IntegrationTogglesSection** — lumaprints_enabled, printful_enabled, shipstation_enabled, meta_pixel_enabled (toggles, not just status)
8. **Update DangerZoneSection** — wire Clear Carts and Revalidate Cache to real API calls (currently stubbed with placeholder delays)

Render order in SettingsClient: Account → StripeMode → PricingSettings → BusinessInfo → EmailConfig → ShippingConfig → SocialLinks → SiteConfig → LegalPages → IntegrationToggles → PromoCodes → DangerZone

---

## API Endpoints

### PATCH /api/admin/settings (extend existing)
- Accept all settings columns as optional fields
- Return full updated settings row
- Clear in-memory cache on success
- Auth: requireAdmin()

### DELETE /api/admin/carts (new)
- Query: `DELETE FROM carts WHERE updated_at < now() - interval '24 hours'`
- Response: `{ success: true, clearedCount: number }`
- Auth: requireAdmin()

### POST /api/admin/revalidate (new)
- Call: `revalidatePath('/', 'layout')`
- Auth: requireAdmin() OR CRON_SECRET (per vercel.json pattern)
- Response: `{ success: true, message: 'All pages revalidated' }`

---

## Server Lib: src/lib/settings/accessor.ts

Export typed `SiteSettings` interface (all 30+ columns) and `getSettings(supabase)` function. Cache in memory with 5-min TTL. Fall back to safe defaults if row missing. Optionally export individual getters (getEmailFromAddress, getOrderNotificationEmail, etc.) for routes that only need one value.

