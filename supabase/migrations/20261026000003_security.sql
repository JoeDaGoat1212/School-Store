-- =============================================================================
-- School Store — security: Row Level Security, function permissions, storage
-- =============================================================================
-- The short version:
--   * Students (the "anon" role) can't read or write ANY table directly.
--     They can only call get_menu, get_store_info and lookup_order.
--   * place_order can only be called by the website's server (service_role).
--   * The admin (a logged-in user listed in `admins`) can do everything.
-- =============================================================================

-- Turn on RLS for every table. With RLS on and no policy, access is denied.
alter table public.admins           enable row level security;
alter table public.settings         enable row level security;
alter table public.pickup_windows   enable row level security;
alter table public.closed_dates     enable row level security;
alter table public.suppliers        enable row level security;
alter table public.products         enable row level security;
alter table public.product_aliases  enable row level security;
alter table public.orders           enable row level security;
alter table public.order_items      enable row level security;
alter table public.stock_movements  enable row level security;
alter table public.product_batches  enable row level security;
alter table public.expenses         enable row level security;
alter table public.expense_items    enable row level security;
alter table public.sales_imports    enable row level security;
alter table public.sales_lines      enable row level security;

-- One "admin can do anything" policy per table.
do $$
declare
  t text;
begin
  foreach t in array array[
    'settings', 'pickup_windows', 'closed_dates', 'suppliers', 'products',
    'product_aliases', 'orders', 'order_items', 'product_batches',
    'expenses', 'expense_items', 'sales_imports', 'sales_lines'
  ] loop
    execute format(
      'create policy "admin full access" on public.%I for all to authenticated
         using (public.is_admin()) with check (public.is_admin())', t);
  end loop;
end $$;

-- Stock history: admin can read and add, never edit (a trigger also blocks it).
create policy "admin reads stock history" on public.stock_movements
  for select to authenticated using (public.is_admin());
create policy "admin adds stock history" on public.stock_movements
  for insert to authenticated with check (public.is_admin());

-- The admin can see their own row (used to check "am I the admin?").
create policy "admin sees self" on public.admins
  for select to authenticated using (user_id = auth.uid());


-- -----------------------------------------------------------------------------
-- Function permissions
-- -----------------------------------------------------------------------------
-- Postgres lets everyone run new functions by default. Take that away, then
-- give back exactly what each role needs.
revoke execute on all functions in schema public from public, anon, authenticated;

-- Students (and everyone else)
grant execute on function public.get_menu()                to anon, authenticated;
grant execute on function public.get_store_info()          to anon, authenticated;
grant execute on function public.lookup_order(int, text)   to anon, authenticated;

-- Small date helpers (harmless; they reveal nothing private).
grant execute on function public.store_today()        to anon, authenticated, service_role;
grant execute on function public.store_now_time()     to anon, authenticated, service_role;
grant execute on function public.is_open_day(date)    to anon, authenticated, service_role;
grant execute on function public.next_open_day(date)  to anon, authenticated, service_role;

-- Used inside RLS policies, so the logged-in user must be able to run it.
grant execute on function public.is_admin()           to authenticated;

-- Staff actions (each one also checks is_admin() inside)
grant execute on function public.set_order_status(uuid, public.order_status) to authenticated;
-- reconcile_sales_stock is only called from inside other functions.

-- The website server only
grant execute on function public.place_order(text, text, text, int, date, jsonb, text) to service_role;
grant execute on function public.expire_uncollected_orders() to service_role;
grant execute on function public.delete_old_orders()         to service_role;

-- Future functions start locked down too.
alter default privileges in schema public revoke execute on functions from public, anon, authenticated;

-- The reserved-stock view is for the admin only.
revoke all on public.product_reserved from anon;


-- -----------------------------------------------------------------------------
-- File storage
-- -----------------------------------------------------------------------------
-- product-photos: anyone can view (they're on the menu); only the admin uploads.
-- receipts:       private; only the admin can view or upload.
insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values
  ('product-photos', 'product-photos', true,  5242880,  array['image/jpeg', 'image/png', 'image/webp']),
  ('receipts',       'receipts',       false, 10485760, array['image/jpeg', 'image/png', 'image/webp', 'image/heic', 'application/pdf'])
on conflict (id) do nothing;

create policy "admin manages product photos" on storage.objects
  for all to authenticated
  using (bucket_id = 'product-photos' and public.is_admin())
  with check (bucket_id = 'product-photos' and public.is_admin());

create policy "admin manages receipts" on storage.objects
  for all to authenticated
  using (bucket_id = 'receipts' and public.is_admin())
  with check (bucket_id = 'receipts' and public.is_admin());
