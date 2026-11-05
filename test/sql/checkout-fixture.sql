-- Minimal previous-schema fixture. Runs ONLY in a disposable local PostgreSQL cluster.
create role anon;
create role authenticated;
create role service_role bypassrls;
create schema auth;
create table auth.users(id uuid primary key);
create function auth.uid() returns uuid language sql stable as $$ select nullif(current_setting('test.user_id',true),'')::uuid $$;
create function public.is_admin_or_artist() returns boolean language sql stable as $$ select coalesce(current_setting('test.is_admin',true),'false')='true' $$;
grant usage on schema auth,public to anon,authenticated,service_role;
grant execute on function auth.uid(),public.is_admin_or_artist() to anon,authenticated,service_role;
create table public.site_settings(id boolean primary key default true,lumaprints_enabled boolean not null default true);
insert into public.site_settings default values;
create table public.master_artworks(id uuid primary key default gen_random_uuid(),print_status text,print_storage_path text);
create table public.products(id uuid primary key default gen_random_uuid(),title text,master_artwork_id uuid references master_artworks(id),prints_enabled boolean,updated_at timestamptz default now());
create table public.product_variants(id uuid primary key default gen_random_uuid(),product_id uuid references products(id),name text,inventory_count integer,price numeric,variant_type text,medium text,width_in numeric,height_in numeric,size_label text,is_active boolean,is_lumaprints_available boolean,updated_at timestamptz default now());
create table public.orders(id uuid primary key default gen_random_uuid(),stripe_payment_intent_id text,stripe_checkout_session_id text,email text,order_number integer,status text default 'processing',updated_at timestamptz default now());
create table public.order_items(id uuid primary key default gen_random_uuid(),order_id uuid references orders(id),product_id uuid references products(id),variant_id uuid references product_variants(id),unit_price numeric,quantity integer,fulfillment_type text,fulfillment_status text default 'pending',external_order_id text,carrier text,tracking_number text,tracking_url text,shipped_at timestamptz,delivered_at timestamptz,medium text,size_label text,print_width_in numeric,print_height_in numeric);
create table public.checkout_snapshots(id uuid primary key default gen_random_uuid());
grant select,insert,update on all tables in schema public to authenticated;
grant all on all tables in schema public to service_role;
alter table orders enable row level security;
create policy order_admin on orders for all to authenticated using(public.is_admin_or_artist()) with check(public.is_admin_or_artist());
alter table order_items enable row level security;
create policy item_admin on order_items for all to authenticated using(public.is_admin_or_artist()) with check(public.is_admin_or_artist());



create table public.fulfillment_jobs(id uuid primary key default gen_random_uuid(),order_id uuid,status text default 'queued');
create unique index fulfillment_jobs_active_order_uniq on public.fulfillment_jobs(order_id) where status in ('queued','running');

-- Checkout-only fixture additions. No app credentials or external services are used.
alter table site_settings add column stripe_test_mode boolean default true;
alter table products add column slug text, add column base_price numeric,
 add column is_original boolean default false, add column fulfillment_type text,
 add column status text default 'available';
alter table product_variants add column sort_order integer default 0;
create table artwork_funnels(id uuid primary key);
create table carts(id uuid primary key);
create table promo_code_redemptions(promo_code_id uuid,contact_id uuid);
create table class_sessions(id uuid primary key,capacity integer);
create table class_bookings(id uuid primary key,session_id uuid references class_sessions(id),name text,email text,phone text,special_notes text,pet_photo_urls text[],status text);
create function auth.jwt() returns jsonb language sql stable as $$select coalesce(nullif(current_setting('request.jwt.claims',true),''),'{}')::jsonb$$;
-- PGlite lacks pgcrypto. Use PostgreSQL's built-in SHA-256 for the same fixture hashing.
create schema extensions;
create function extensions.digest(text,text) returns bytea language plpgsql immutable as $$begin
 if $2 <> 'sha256' then raise exception 'Unsupported fixture digest';end if;
 return sha256(convert_to($1,'UTF8'));end$$;
