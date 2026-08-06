-- Materialized verbatim from the production migration ledger
-- (supabase_migrations.schema_migrations) on 2026-08-06 for disaster-recovery
-- completeness.
--
-- This change was applied to the production project through the management API and
-- had no corresponding file in supabase/migrations/. The body below is the ledger
-- row's statements joined with a blank line, each terminated by a semicolon, and is
-- reproduced without modification.
--
-- Ledger version: 20260401174048
-- Ledger name:    add_print_ecommerce_columns


-- Add prints_enabled flag to products
ALTER TABLE products ADD COLUMN IF NOT EXISTS prints_enabled BOOLEAN NOT NULL DEFAULT false;

-- Add variant_type to product_variants
ALTER TABLE product_variants ADD COLUMN IF NOT EXISTS variant_type TEXT;

-- Index for efficient variant type queries
CREATE INDEX IF NOT EXISTS idx_product_variants_type ON product_variants(product_id, variant_type);
