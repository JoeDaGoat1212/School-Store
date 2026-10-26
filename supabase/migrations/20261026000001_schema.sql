-- =============================================================================
-- School Store — database schema
-- =============================================================================
-- How this file is organized:
--   1. Types (enums)
--   2. Tables
--   3. Helper functions (today in Arizona, is_admin, reserved stock)
--   4. Triggers (keep products.stock in sync with the stock ledger)
--
-- Conventions used everywhere:
--   * Money is stored as whole CENTS in integer columns (price_cents = 150 means
--     $1.50). Decimals cause rounding bugs; integers don't.
--   * Every stock change is a row in `stock_movements`. Never edit
--     products.stock directly — insert a movement and the trigger updates it.
--   * "Today" means today in the store's timezone (America/Phoenix), not UTC.
-- =============================================================================


-- -----------------------------------------------------------------------------
-- 1. Types
-- -----------------------------------------------------------------------------

-- Order life cycle. Open statuses (received, preparing, ready) reserve stock.
create type public.order_status as enum (
  'received',   -- student placed it
  'preparing',  -- staff is bagging it
  'ready',      -- waiting at the pickup spot
  'picked_up',  -- student paid at pickup (stock is subtracted now)
  'canceled',   -- canceled by staff
  'no_show',    -- staff marked it as never collected
  'expired'     -- automatically closed at the end of the pickup day
);

-- Why stock changed. Shown in the inventory history.
create type public.movement_reason as enum (
  'initial',            -- starting stock when a product is created
  'restock',            -- added by a shopping trip (expense)
  'online_pickup',      -- online order picked up and paid
  'online_pickup_undo', -- a picked-up order was moved back to another status
  'sale_import',        -- in-person sales from the InTouchPay import
  'manual_adjustment',  -- staff fixed the count by hand (note required)
  'spoilage'            -- thrown away / expired (note required)
);

create type public.payment_type as enum ('cash', 'debit', 'other');


-- -----------------------------------------------------------------------------
-- 2. Tables
-- -----------------------------------------------------------------------------

-- The one admin account. Being logged in is NOT enough to see staff data:
-- the user's id must also be in this table. That way, even if someone found
-- a way to create a Supabase account, they would see nothing.
create table public.admins (
  user_id    uuid primary key references auth.users (id) on delete cascade,
  created_at timestamptz not null default now()
);

-- Store-wide settings. There is exactly one row (id = 1).
create table public.settings (
  id                         int primary key default 1 check (id = 1),
  store_name                 text not null default 'School Store',
  store_hours                text not null default 'Mon–Fri, before school through 7th hour',
  pickup_location            text not null default 'Store window by the cafeteria',
  banner_text                text,               -- optional announcement on the menu
  timezone                   text not null default 'America/Phoenix',
  -- Ordering rules
  order_cutoff_time          time not null default '14:00', -- no more same-day orders after this
  order_lead_minutes         int  not null default 20 check (order_lead_minutes between 0 and 240),
  max_orders_per_student_day int  not null default 2  check (max_orders_per_student_day between 1 and 20),
  max_items_per_order        int  not null default 10 check (max_items_per_order between 1 and 50),
  max_orders_per_hour_per_device int not null default 5 check (max_orders_per_hour_per_device between 1 and 100),
  -- Privacy
  order_retention_days       int  not null default 90 check (order_retention_days between 7 and 730),
  -- Inventory math (see src/lib/calculations.ts)
  sales_average_days         int  not null default 28 check (sales_average_days between 7 and 180),
  reorder_buffer_days        int  not null default 2  check (reorder_buffer_days between 0 and 30),
  shopping_interval_days     int  not null default 7  check (shopping_interval_days between 1 and 60),
  next_shopping_date         date,
  updated_at                 timestamptz not null default now()
);
insert into public.settings (id) values (1);

-- Pickup windows students can choose at checkout.
-- `starts_at` is when the window happens (e.g. the end of 1st hour).
-- Orders for a window close `order_lead_minutes` before it starts.
create table public.pickup_windows (
  id         serial primary key,
  label      text not null,
  starts_at  time not null,
  sort_order int  not null default 0,
  active     boolean not null default true
);

-- Days the store is closed (holidays, breaks, testing days). Weekends are
-- always closed and don't need to be listed.
create table public.closed_dates (
  closed_on date primary key,
  reason    text
);

create table public.suppliers (
  id         uuid primary key default gen_random_uuid(),
  name       text not null unique,
  notes      text,
  created_at timestamptz not null default now()
);

create table public.products (
  id               uuid primary key default gen_random_uuid(),
  name             text not null,
  description      text,
  category         text not null default 'Snacks',
  emoji            text,                 -- shown when there is no photo yet
  photo_path       text,                 -- path inside the "product-photos" bucket
  price_cents      int  not null check (price_cents >= 0),
  unit_cost_cents  int  not null default 0 check (unit_cost_cents >= 0),
  stock            int  not null default 0,  -- kept in sync by stock_movements; can go negative if counts are off
  reorder_point    int  not null default 10 check (reorder_point >= 0),
  lead_days        int  not null default 2  check (lead_days >= 0), -- days between noticing and restocking
  supplier_id      uuid references public.suppliers (id) on delete set null,
  is_perishable    boolean not null default false,
  available_online boolean not null default true,
  archived         boolean not null default false,
  tags             text[] not null default '{}',  -- e.g. {new, limited}
  created_at       timestamptz not null default now(),
  updated_at       timestamptz not null default now()
);
create index on public.products (archived, category);

-- Names the InTouchPay export uses for a product ("HOT CHEETOS 1OZ").
-- Stored lowercase and trimmed so matching ignores case and extra spaces.
create table public.product_aliases (
  id         uuid primary key default gen_random_uuid(),
  product_id uuid not null references public.products (id) on delete cascade,
  alias      text not null unique check (alias = lower(btrim(alias)) and alias <> ''),
  created_at timestamptz not null default now()
);

-- Online orders. Only first name, last name and grade are collected.
create sequence public.order_number_seq start 1;

create table public.orders (
  id               uuid primary key default gen_random_uuid(),
  order_number     int  not null unique default nextval('public.order_number_seq'),
  first_name       text not null check (char_length(first_name) between 1 and 40),
  last_name        text not null check (char_length(last_name)  between 1 and 40),
  grade            text not null check (char_length(grade) between 1 and 20),
  pickup_window_id int  not null references public.pickup_windows (id),
  pickup_date      date not null,
  status           public.order_status not null default 'received',
  total_cents      int  not null check (total_cents >= 0),
  staff_notes      text,
  ip_hash          text,  -- one-way hash of the device's IP, only used for rate limiting
  created_at       timestamptz not null default now(),
  status_changed_at timestamptz not null default now(),
  picked_up_at     timestamptz
);
alter sequence public.order_number_seq owned by public.orders.order_number;
create index on public.orders (pickup_date, status);
create index on public.orders (ip_hash, created_at);
create index on public.orders (lower(last_name));

create table public.order_items (
  id               uuid primary key default gen_random_uuid(),
  order_id         uuid not null references public.orders (id) on delete cascade,
  product_id       uuid not null references public.products (id),
  product_name     text not null,        -- copy of the name at order time
  unit_price_cents int  not null check (unit_price_cents >= 0),
  quantity         int  not null check (quantity > 0)
);
create index on public.order_items (order_id);
create index on public.order_items (product_id);

-- The stock ledger. products.stock always equals the sum of these rows.
create table public.stock_movements (
  id             bigint generated always as identity primary key,
  product_id     uuid not null references public.products (id) on delete cascade,
  change         int  not null check (change <> 0),
  reason         public.movement_reason not null,
  -- The day the change belongs to (Arizona time). Used to line up
  -- online pickups with that day's imported sales.
  effective_date date not null,
  note           text,
  source_id      uuid,   -- the order, import, or expense that caused it (if any)
  created_by     uuid references auth.users (id) on delete set null,
  created_at     timestamptz not null default now(),
  -- Hand-made changes must say why.
  constraint manual_changes_need_a_note check (
    reason not in ('manual_adjustment', 'spoilage') or coalesce(btrim(note), '') <> ''
  )
);
create index on public.stock_movements (product_id, effective_date);
create index on public.stock_movements (source_id);

-- Perishable restocks and their expiration dates. We don't track which exact
-- package was sold; instead the app assumes the oldest batch sells first
-- (see src/lib/calculations.ts → batchesStillOnShelf).
create table public.product_batches (
  id          uuid primary key default gen_random_uuid(),
  product_id  uuid not null references public.products (id) on delete cascade,
  quantity    int  not null check (quantity > 0),
  received_on date not null,
  expires_on  date not null,
  expense_id  uuid,   -- linked after expenses table exists (below)
  created_at  timestamptz not null default now()
);
create index on public.product_batches (product_id, received_on);

-- Shopping trips.
create table public.expenses (
  id           uuid primary key default gen_random_uuid(),
  purchased_on date not null,
  supplier_id  uuid references public.suppliers (id) on delete set null,
  buyer_name   text not null,
  receipt_path text,   -- path inside the private "receipts" bucket
  notes        text,
  total_cents  int  not null default 0 check (total_cents >= 0),
  created_by   uuid references auth.users (id) on delete set null,
  created_at   timestamptz not null default now()
);
create index on public.expenses (purchased_on);

-- Line items on a shopping trip. product_id is empty for supplies that
-- aren't sold (napkins, bags) — they still count as spending.
create table public.expense_items (
  id              uuid primary key default gen_random_uuid(),
  expense_id      uuid not null references public.expenses (id) on delete cascade,
  product_id      uuid references public.products (id) on delete set null,
  description     text not null,
  quantity        int  not null check (quantity > 0),
  unit_cost_cents int  not null check (unit_cost_cents >= 0),
  line_total_cents int generated always as (quantity * unit_cost_cents) stored
);
create index on public.expense_items (expense_id);
create index on public.expense_items (product_id);

alter table public.product_batches
  add constraint product_batches_expense_fk
  foreign key (expense_id) references public.expenses (id) on delete cascade;

-- One uploaded InTouchPay export.
create table public.sales_imports (
  id              uuid primary key default gen_random_uuid(),
  file_name       text not null,
  file_hash       text not null,         -- SHA-256 of the file, to block re-uploading the same file
  column_mapping  jsonb not null default '{}',
  row_count       int  not null default 0,  -- rows in the file
  imported_count  int  not null default 0,  -- rows saved
  duplicate_count int  not null default 0,  -- rows skipped because they were already imported
  date_from       date,
  date_to         date,
  revenue_cents   int  not null default 0,
  imported_by     uuid references auth.users (id) on delete set null,
  created_at      timestamptz not null default now(),
  undone_at       timestamptz,
  undone_by       uuid references auth.users (id) on delete set null
);
-- The same file can't be active twice (it can be re-imported after an undo).
create unique index sales_imports_active_file on public.sales_imports (file_hash) where undone_at is null;

-- One row per line in the export.
create table public.sales_lines (
  id               uuid primary key default gen_random_uuid(),
  import_id        uuid not null references public.sales_imports (id) on delete cascade,
  sold_at          timestamptz,
  sale_date        date not null,
  raw_item_name    text not null,        -- exactly as it appeared in the file
  product_id       uuid references public.products (id) on delete set null, -- empty = unmatched
  quantity         int  not null,        -- negative for refunds
  unit_price_cents int  not null,
  total_cents      int  not null,
  payment_type     public.payment_type not null default 'other',
  transaction_ref  text,
  -- A fingerprint of the line's contents. Unique, so the same sale can never
  -- be imported twice even if it shows up in two different export files.
  fingerprint      text not null unique
);
create index on public.sales_lines (sale_date);
create index on public.sales_lines (product_id, sale_date);
create index on public.sales_lines (import_id);


-- -----------------------------------------------------------------------------
-- 3. Helper functions
-- -----------------------------------------------------------------------------

-- Today's date in the store's timezone.
create or replace function public.store_today()
returns date
language sql stable
set search_path = public
as $$
  select (now() at time zone (select timezone from public.settings where id = 1))::date;
$$;

-- The current time of day in the store's timezone.
create or replace function public.store_now_time()
returns time
language sql stable
set search_path = public
as $$
  select (now() at time zone (select timezone from public.settings where id = 1))::time;
$$;

-- True when the logged-in user is the store admin.
-- SECURITY DEFINER so it can read `admins` even though RLS protects it.
create or replace function public.is_admin()
returns boolean
language sql stable security definer
set search_path = public
as $$
  select exists (select 1 from public.admins where user_id = auth.uid());
$$;

-- Is the store open for pickups on this date? (Not a weekend, not a closed date.)
create or replace function public.is_open_day(d date)
returns boolean
language sql stable
set search_path = public
as $$
  select extract(isodow from d) < 6
     and not exists (select 1 from public.closed_dates where closed_on = d);
$$;

-- The first open day strictly after `d` (looks up to 60 days ahead).
create or replace function public.next_open_day(d date)
returns date
language sql stable
set search_path = public
as $$
  select min(day)::date
  from generate_series(d + 1, d + 60, interval '1 day') as day
  where public.is_open_day(day::date);
$$;

-- Units of each product held by open online orders (today or later).
-- Orders from past days don't count even if nobody closed them yet.
create or replace view public.product_reserved
with (security_invoker = true)
as
  select oi.product_id, sum(oi.quantity)::int as reserved
  from public.order_items oi
  join public.orders o on o.id = oi.order_id
  where o.status in ('received', 'preparing', 'ready')
    and o.pickup_date >= public.store_today()
  group by oi.product_id;


-- -----------------------------------------------------------------------------
-- 4. Triggers
-- -----------------------------------------------------------------------------

-- Every new stock movement updates the product's stock count.
create or replace function public.apply_stock_movement()
returns trigger
language plpgsql
set search_path = public
as $$
begin
  update public.products
     set stock = stock + new.change,
         updated_at = now()
   where id = new.product_id;
  return new;
end;
$$;

create trigger stock_movements_apply
after insert on public.stock_movements
for each row execute function public.apply_stock_movement();

-- Movements are a permanent history: block edits and deletes.
-- (To fix a mistake, add a new movement that reverses it.)
create or replace function public.block_movement_changes()
returns trigger
language plpgsql
as $$
begin
  raise exception 'Stock history cannot be edited. Add a new adjustment instead.';
end;
$$;

create trigger stock_movements_readonly
before update or delete on public.stock_movements
for each row
when (pg_trigger_depth() = 0)  -- allow cascades when a whole product is deleted
execute function public.block_movement_changes();

-- Keep updated_at fresh.
create or replace function public.touch_updated_at()
returns trigger
language plpgsql
as $$
begin
  new.updated_at = now();
  return new;
end;
$$;

create trigger products_touch before update on public.products
for each row execute function public.touch_updated_at();
create trigger settings_touch before update on public.settings
for each row execute function public.touch_updated_at();
