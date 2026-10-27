-- =============================================================================
-- Firebirds Nest — rewards accounts, deals and bundles (phase 8)
-- =============================================================================
-- What this adds:
--   customers        students who made a rewards account (signed in by email code)
--   point_entries    the points ledger: every point earned, spent, refunded or adjusted
--   rewards          what points can buy (always "a free <product>")
--   promotions       sale prices and "buy X, get Y free" deals, each with dates
--   bundles          several products sold together at one price
--   order_bundles,
--   order_discounts  what an order's bundles and discounts were
--
-- How points work:
--   * A signed-in student earns points on an online order when staff mark it
--     Picked up (settings.points_per_dollar for each $1 paid).
--   * Using a reward takes the points right away; if the order ends up
--     canceled, a no-show or expired, they're refunded automatically.
--   * sync_order_points() keeps the ledger matching each order's status — the
--     same "compare and fix the difference" idea as the stock ledger.
--
-- How prices work (_price_cart):
--   1. Each product costs its sale price if a sale is running, else its price.
--   2. Bundles cost the bundle price.
--   3. Buy-X-get-Y deals make the cheapest qualifying items free.
--   4. A reward adds one free item.
--   Members-only sales, deals and bundles only count for signed-in students.
-- =============================================================================


-- -----------------------------------------------------------------------------
-- 1. Settings
-- -----------------------------------------------------------------------------
alter table public.settings
  add column rewards_enabled   boolean not null default true,
  add column points_per_dollar int     not null default 10 check (points_per_dollar between 1 and 100);


-- -----------------------------------------------------------------------------
-- 2. Rewards accounts and points
-- -----------------------------------------------------------------------------
create table public.customers (
  id          uuid primary key references auth.users (id) on delete cascade,
  email       text not null,
  first_name  text not null check (char_length(first_name) between 1 and 40),
  last_name   text not null check (char_length(last_name)  between 1 and 40),
  grade       text not null check (char_length(grade) between 1 and 20),
  created_at  timestamptz not null default now(),
  updated_at  timestamptz not null default now()
);

create table public.rewards (
  id           uuid primary key default gen_random_uuid(),
  product_id   uuid not null references public.products (id) on delete cascade,
  points_cost  int  not null check (points_cost between 1 and 100000),
  active       boolean not null default true,
  created_at   timestamptz not null default now()
);

create type public.points_reason as enum (
  'earned',       -- order picked up
  'earned_undo',  -- order moved back from Picked up
  'redeemed',     -- points spent on a reward
  'refunded',     -- reward order canceled / not picked up
  'adjusted'      -- added or removed by staff
);

create table public.point_entries (
  id            bigint generated always as identity primary key,
  customer_id   uuid not null references public.customers (id) on delete cascade,
  change        int  not null check (change <> 0),
  reason        public.points_reason not null,
  order_id      uuid references public.orders (id) on delete set null,
  order_number  int,  -- kept even after old orders are deleted
  note          text,
  created_by    uuid references auth.users (id) on delete set null,
  created_at    timestamptz not null default now()
);
create index on public.point_entries (customer_id, created_at desc);
create index on public.point_entries (order_id);


-- -----------------------------------------------------------------------------
-- 3. Deals and bundles
-- -----------------------------------------------------------------------------
create table public.promotions (
  id                uuid primary key default gen_random_uuid(),
  kind              text not null check (kind in ('sale', 'buy_get')),
  title             text not null check (char_length(title) between 1 and 60),
  product_id        uuid references public.products (id) on delete cascade,
  category          text,           -- buy_get deals can cover a whole category
  sale_price_cents  int  check (sale_price_cents >= 0),
  buy_qty           int  check (buy_qty between 1 and 20),
  get_qty           int  check (get_qty between 1 and 20),
  starts_on         date not null,
  ends_on           date not null,
  members_only      boolean not null default false,
  featured          boolean not null default false,  -- "deal of the day": shown at the top of the menu
  active            boolean not null default true,
  created_at        timestamptz not null default now(),
  check (ends_on >= starts_on),
  check (
    (kind = 'sale' and product_id is not null and sale_price_cents is not null and category is null)
    or
    (kind = 'buy_get' and buy_qty is not null and get_qty is not null
       and ((product_id is null) <> (category is null)))
  )
);
create index on public.promotions (starts_on, ends_on);

create table public.bundles (
  id            uuid primary key default gen_random_uuid(),
  name          text not null check (char_length(name) between 1 and 60),
  description   text check (char_length(description) <= 200),
  emoji         text,
  photo_path    text,
  price_cents   int  not null check (price_cents >= 0),
  starts_on     date,   -- empty = no start date
  ends_on       date,   -- empty = no end date
  members_only  boolean not null default false,
  active        boolean not null default true,
  created_at    timestamptz not null default now(),
  updated_at    timestamptz not null default now(),
  check (ends_on is null or starts_on is null or ends_on >= starts_on)
);

create table public.bundle_items (
  bundle_id   uuid not null references public.bundles (id) on delete cascade,
  product_id  uuid not null references public.products (id) on delete cascade,
  quantity    int  not null default 1 check (quantity between 1 and 20),
  primary key (bundle_id, product_id)
);


-- -----------------------------------------------------------------------------
-- 4. Orders remember bundles, discounts and points
-- -----------------------------------------------------------------------------
alter table public.orders
  add column customer_id     uuid references public.customers (id) on delete set null,
  add column subtotal_cents  int not null default 0 check (subtotal_cents >= 0),
  add column discount_cents  int not null default 0 check (discount_cents >= 0),
  add column points_earned   int not null default 0 check (points_earned >= 0),
  add column points_spent    int not null default 0 check (points_spent >= 0);
update public.orders set subtotal_cents = total_cents;
create index on public.orders (customer_id, created_at desc);

create table public.order_bundles (
  id                uuid primary key default gen_random_uuid(),
  order_id          uuid not null references public.orders (id) on delete cascade,
  bundle_id         uuid references public.bundles (id) on delete set null,
  bundle_name       text not null,
  unit_price_cents  int  not null check (unit_price_cents >= 0),
  quantity          int  not null check (quantity > 0)
);
create index on public.order_bundles (order_id);

-- A bundle's products are normal order_items rows (so stock, reservations and
-- the prep list just work) with a price of 0 and a link to the bundle line.
alter table public.order_items
  add column order_bundle_id uuid references public.order_bundles (id) on delete cascade;

create table public.order_discounts (
  id            uuid primary key default gen_random_uuid(),
  order_id      uuid not null references public.orders (id) on delete cascade,
  label         text not null,
  amount_cents  int  not null check (amount_cents > 0),
  kind          text not null check (kind in ('buy_get', 'reward'))
);
create index on public.order_discounts (order_id);


-- -----------------------------------------------------------------------------
-- 5. Helpers
-- -----------------------------------------------------------------------------

-- Is a deal running on this day for this shopper?
create or replace function public.deal_is_live(
  p_active boolean, p_starts date, p_ends date, p_members_only boolean, p_day date, p_member boolean)
returns boolean
language sql immutable
as $$
  select p_active
     and (p_starts is null or p_day >= p_starts)
     and (p_ends   is null or p_day <= p_ends)
     and (not p_members_only or p_member);
$$;

create or replace function public.points_balance(p_customer_id uuid)
returns int
language sql stable security definer
set search_path = public
as $$
  select coalesce(sum(change), 0)::int from public.point_entries where customer_id = p_customer_id;
$$;

-- How many of a product can still be ordered (stock − reserved, never below 0).
create or replace function public.product_available(p_product_id uuid)
returns int
language sql stable security definer
set search_path = public
as $$
  select greatest(p.stock - coalesce(r.reserved, 0), 0)::int
  from public.products p
  left join public.product_reserved r on r.product_id = p.id
  where p.id = p_product_id;
$$;


-- -----------------------------------------------------------------------------
-- 6. Pricing
-- -----------------------------------------------------------------------------
-- p_items:   [{"product_id": "...", "quantity": 2}, ...]
-- p_bundles: [{"bundle_id": "...", "quantity": 1}, ...]
-- Returns the priced cart as JSON (see the end of the function).
-- Doesn't check stock — place_order does that.
create or replace function public._price_cart(
  p_items jsonb, p_bundles jsonb, p_member boolean, p_reward_id uuid)
returns jsonb
language plpgsql security definer
set search_path = public
as $$
declare
  v_day        date := public.store_today();
  v_bundles    jsonb := '[]'::jsonb;
  v_discounts  jsonb := '[]'::jsonb;
  v_reward     jsonb := null;
  v_subtotal   int;
  v_discount   int := 0;
  v_promo      record;
  v_rw         record;
  v_count      int;
  v_free       int;
  v_amount     int;
begin
  -- ---- Products ------------------------------------------------------------
  drop table if exists _pc_lines;
  create temporary table _pc_lines on commit drop as
    select (x->>'product_id')::uuid as product_id, sum((x->>'quantity')::int)::int as quantity
    from jsonb_array_elements(coalesce(p_items, '[]'::jsonb)) as x
    group by 1;

  if exists (select 1 from _pc_lines where product_id is null or quantity is null or quantity < 1 or quantity > 100) then
    raise exception 'BAD_QUANTITY' using hint = 'Each item needs a quantity of at least 1.';
  end if;
  if exists (select 1 from _pc_lines l left join public.products p on p.id = l.product_id
             where p.id is null or p.archived or not p.available_online) then
    raise exception 'UNAVAILABLE' using hint = 'An item in your cart is no longer available. Please refresh the menu.';
  end if;

  -- Each line's price: the lowest running sale price, or the normal price.
  drop table if exists _pc_priced;
  create temporary table _pc_priced on commit drop as
    select l.product_id, p.name, p.category, l.quantity,
           p.price_cents as regular_price_cents,
           least(p.price_cents, coalesce(s.sale_price_cents, p.price_cents)) as unit_price_cents,
           s.title as deal_title,
           false as is_reward
    from _pc_lines l
    join public.products p on p.id = l.product_id
    left join lateral (
      select pm.sale_price_cents, pm.title
      from public.promotions pm
      where pm.kind = 'sale' and pm.product_id = p.id
        and public.deal_is_live(pm.active, pm.starts_on, pm.ends_on, pm.members_only, v_day, p_member)
      order by pm.sale_price_cents
      limit 1
    ) s on true;

  -- ---- Reward (one free item) ----------------------------------------------
  if p_reward_id is not null then
    if not p_member then
      raise exception 'SIGN_IN_NEEDED' using hint = 'Sign in to your rewards account to use a reward.';
    end if;
    select rw.id, rw.points_cost, p.id as product_id, p.name, p.category, p.price_cents,
           least(p.price_cents, coalesce((
             select min(pm.sale_price_cents) from public.promotions pm
             where pm.kind = 'sale' and pm.product_id = p.id
               and public.deal_is_live(pm.active, pm.starts_on, pm.ends_on, pm.members_only, v_day, p_member)
           ), p.price_cents)) as unit_price_cents
      into v_rw
      from public.rewards rw
      join public.products p on p.id = rw.product_id
     where rw.id = p_reward_id and rw.active and not p.archived and p.available_online;
    if not found then
      raise exception 'REWARD_UNAVAILABLE' using hint = 'That reward isn''t available right now.';
    end if;

    insert into _pc_priced values (v_rw.product_id, v_rw.name, v_rw.category, 1,
                                   v_rw.price_cents, v_rw.unit_price_cents, null, true);
    v_reward := jsonb_build_object('id', v_rw.id, 'product_id', v_rw.product_id,
                                   'name', v_rw.name, 'points_cost', v_rw.points_cost);
    if v_rw.unit_price_cents > 0 then
      v_discounts := v_discounts || jsonb_build_object(
        'label', 'Reward: free ' || v_rw.name, 'amount_cents', v_rw.unit_price_cents, 'kind', 'reward');
    end if;
  end if;

  -- ---- Bundles ---------------------------------------------------------------
  drop table if exists _pc_bundles;
  create temporary table _pc_bundles on commit drop as
    select (x->>'bundle_id')::uuid as bundle_id, sum((x->>'quantity')::int)::int as quantity
    from jsonb_array_elements(coalesce(p_bundles, '[]'::jsonb)) as x
    group by 1;

  if exists (select 1 from _pc_bundles where bundle_id is null or quantity is null or quantity < 1 or quantity > 20) then
    raise exception 'BAD_QUANTITY' using hint = 'Each bundle needs a quantity of at least 1.';
  end if;
  if exists (
    select 1 from _pc_bundles pb
    left join public.bundles b on b.id = pb.bundle_id
    where b.id is null
       or not public.deal_is_live(b.active, b.starts_on, b.ends_on, b.members_only, v_day, p_member)
       or not exists (select 1 from public.bundle_items bi where bi.bundle_id = b.id)
       or exists (select 1 from public.bundle_items bi join public.products p on p.id = bi.product_id
                  where bi.bundle_id = b.id and (p.archived or not p.available_online))
  ) then
    raise exception 'BUNDLE_UNAVAILABLE' using hint = 'A bundle in your cart isn''t available right now. Please refresh the menu.';
  end if;

  select coalesce(jsonb_agg(jsonb_build_object(
           'bundle_id', b.id,
           'name', b.name,
           'quantity', pb.quantity,
           'unit_price_cents', b.price_cents,
           'items', (select jsonb_agg(jsonb_build_object('product_id', p.id, 'name', p.name, 'quantity', bi.quantity)
                                      order by p.name)
                     from public.bundle_items bi join public.products p on p.id = bi.product_id
                     where bi.bundle_id = b.id))
         order by b.name), '[]'::jsonb)
    into v_bundles
    from _pc_bundles pb join public.bundles b on b.id = pb.bundle_id;

  -- ---- Buy X, get Y ----------------------------------------------------------
  -- One row per single item (not counting the reward or bundles). An item can
  -- only be used by one deal.
  drop table if exists _pc_units;
  create temporary table _pc_units on commit drop as
    select p.product_id, p.category, p.unit_price_cents, false as used
    from _pc_priced p
    cross join lateral generate_series(1, p.quantity)
    where not p.is_reward;

  for v_promo in
    select * from public.promotions pm
    where pm.kind = 'buy_get'
      and public.deal_is_live(pm.active, pm.starts_on, pm.ends_on, pm.members_only, v_day, p_member)
    order by pm.created_at
  loop
    select count(*) into v_count from _pc_units u
     where not u.used and (u.product_id = v_promo.product_id or u.category = v_promo.category);

    -- Every full group of (buy + get) items makes `get` of them free.
    v_free := (v_count / (v_promo.buy_qty + v_promo.get_qty)) * v_promo.get_qty;
    if v_free > 0 then
      select coalesce(sum(unit_price_cents), 0) into v_amount
      from (select u.unit_price_cents from _pc_units u
            where not u.used and (u.product_id = v_promo.product_id or u.category = v_promo.category)
            order by u.unit_price_cents
            limit v_free) cheapest;

      update _pc_units u set used = true
       where not u.used and (u.product_id = v_promo.product_id or u.category = v_promo.category);

      if v_amount > 0 then
        v_discounts := v_discounts || jsonb_build_object(
          'label', v_promo.title, 'amount_cents', v_amount, 'kind', 'buy_get');
      end if;
    end if;
  end loop;

  -- ---- Totals ----------------------------------------------------------------
  select coalesce(sum(unit_price_cents * quantity), 0)::int into v_subtotal from _pc_priced;
  select v_subtotal + coalesce(sum((b->>'unit_price_cents')::int * (b->>'quantity')::int), 0)::int
    into v_subtotal from jsonb_array_elements(v_bundles) b;
  select coalesce(sum((d->>'amount_cents')::int), 0)::int into v_discount from jsonb_array_elements(v_discounts) d;
  v_discount := least(v_discount, v_subtotal);

  return jsonb_build_object(
    'lines', coalesce((select jsonb_agg(jsonb_build_object(
                         'product_id', product_id,
                         'name', name,
                         'quantity', quantity,
                         'regular_price_cents', regular_price_cents,
                         'unit_price_cents', unit_price_cents,
                         'deal_title', deal_title,
                         'is_reward', is_reward) order by is_reward, name)
                       from _pc_priced), '[]'::jsonb),
    'bundles', v_bundles,
    'discounts', v_discounts,
    'reward', v_reward,
    'subtotal_cents', v_subtotal,
    'discount_cents', v_discount,
    'total_cents', v_subtotal - v_discount
  );
end;
$$;

-- Is this signed-in user a member (has finished their rewards profile)?
create or replace function public.current_member()
returns uuid
language sql stable security definer
set search_path = public
as $$
  select id from public.customers where id = auth.uid();
$$;

-- Public: price a cart for the checkout page (members get member prices).
create or replace function public.quote_cart(p_items jsonb, p_bundles jsonb default '[]', p_reward_id uuid default null)
returns jsonb
language plpgsql security definer
set search_path = public
as $$
declare
  s         public.settings;
  v_member  uuid := public.current_member();
  v_quote   jsonb;
  v_total   int;
  v_balance int := 0;
  v_points  int;
begin
  select * into s from public.settings where id = 1;
  v_quote := public._price_cart(p_items, p_bundles, v_member is not null, p_reward_id);
  v_total := (v_quote->>'total_cents')::int;
  v_points := case when s.rewards_enabled then floor(v_total * s.points_per_dollar / 100.0)::int else 0 end;

  if v_member is not null then
    v_balance := public.points_balance(v_member);
    if v_quote->'reward' <> 'null'::jsonb and v_balance < (v_quote->'reward'->>'points_cost')::int then
      raise exception 'NOT_ENOUGH_POINTS' using hint = 'You don''t have enough points for that reward yet.';
    end if;
  end if;

  return v_quote || jsonb_build_object(
    'member', v_member is not null,
    'points_balance', v_balance,
    'points_earned', case when v_member is not null then v_points else 0 end,
    'points_if_member', v_points
  );
end;
$$;


-- -----------------------------------------------------------------------------
-- 7. Points follow the order's status
-- -----------------------------------------------------------------------------
-- Run after any status change. Safe to run any number of times.
create or replace function public.sync_order_points(p_order_id uuid)
returns void
language plpgsql security definer
set search_path = public
as $$
declare
  o          public.orders;
  v_target   int;
  v_current  int;
begin
  select * into o from public.orders where id = p_order_id;
  if not found or o.customer_id is null then
    return;
  end if;

  -- Spent points: taken while the order is open or picked up, refunded otherwise.
  v_target := case when o.status in ('canceled', 'no_show', 'expired') then 0 else o.points_spent end;
  select coalesce(-sum(change), 0) into v_current from public.point_entries
   where order_id = o.id and reason in ('redeemed', 'refunded');
  if v_target <> v_current then
    insert into public.point_entries (customer_id, change, reason, order_id, order_number, note)
    values (o.customer_id, -(v_target - v_current),
            case when v_target > v_current then 'redeemed' else 'refunded' end::public.points_reason,
            o.id, o.order_number,
            case when v_target > v_current then 'Used on a reward' else 'Order wasn''t picked up' end);
  end if;

  -- Earned points: only once the order is picked up (paid).
  v_target := case when o.status = 'picked_up' then o.points_earned else 0 end;
  select coalesce(sum(change), 0) into v_current from public.point_entries
   where order_id = o.id and reason in ('earned', 'earned_undo');
  if v_target <> v_current then
    insert into public.point_entries (customer_id, change, reason, order_id, order_number, note)
    values (o.customer_id, v_target - v_current,
            case when v_target > v_current then 'earned' else 'earned_undo' end::public.points_reason,
            o.id, o.order_number,
            case when v_target > v_current then 'Order picked up' else 'Pickup undone' end);
  end if;
end;
$$;


-- -----------------------------------------------------------------------------
-- 8. place_order, now with bundles, deals, rewards and members
-- -----------------------------------------------------------------------------
drop function if exists public.place_order(text, text, text, int, date, jsonb, text);

create or replace function public.place_order(
  p_first_name       text,
  p_last_name        text,
  p_grade            text,
  p_pickup_window_id int,
  p_pickup_date      date,
  p_items            jsonb,
  p_ip_hash          text,
  p_bundles          jsonb default '[]',
  p_customer_id      uuid  default null,  -- set by the website server after checking the sign-in
  p_reward_id        uuid  default null
)
returns jsonb
language plpgsql security definer
set search_path = public
as $$
declare
  s            public.settings;
  w            public.pickup_windows;
  v_today      date := public.store_today();
  v_now        time := public.store_now_time();
  v_first      text := btrim(coalesce(p_first_name, ''));
  v_last       text := btrim(coalesce(p_last_name, ''));
  v_grade      text := btrim(coalesce(p_grade, ''));
  v_member     boolean := false;
  v_price      jsonb;
  v_item       record;
  v_bundle     jsonb;
  v_ob_id      uuid;
  v_product    public.products;
  v_available  int;
  v_count      int;
  v_total      int;
  v_spent      int := 0;
  v_earned     int := 0;
  v_order      public.orders;
begin
  select * into s from public.settings where id = 1;

  -- ---- Who is ordering --------------------------------------------------------
  if v_first = '' or v_last = '' or v_grade = '' then
    raise exception 'MISSING_INFO' using hint = 'Please fill in your first name, last name, and grade.';
  end if;
  if char_length(v_first) > 40 or char_length(v_last) > 40 or char_length(v_grade) > 20 then
    raise exception 'INFO_TOO_LONG' using hint = 'One of your answers is too long.';
  end if;
  if p_customer_id is not null then
    v_member := exists (select 1 from public.customers where id = p_customer_id);
    if not v_member then
      raise exception 'PROFILE_NEEDED' using hint = 'Finish setting up your rewards account first.';
    end if;
  end if;

  -- ---- When -------------------------------------------------------------------
  if p_pickup_date is null
     or p_pickup_date not in (v_today, public.next_open_day(v_today)) then
    raise exception 'BAD_DATE' using hint = 'Orders can only be placed for today or the next school day.';
  end if;
  if not public.is_open_day(p_pickup_date) then
    raise exception 'STORE_CLOSED' using hint = 'The store is closed that day.';
  end if;

  select * into w from public.pickup_windows where id = p_pickup_window_id and active;
  if not found then
    raise exception 'BAD_WINDOW' using hint = 'Please choose a pickup time.';
  end if;

  if p_pickup_date = v_today then
    if v_now >= s.order_cutoff_time then
      raise exception 'ORDERS_CLOSED' using hint = format(
        'Same-day orders close at %s. You can still order for the next school day.',
        to_char(s.order_cutoff_time, 'FMHH12:MI AM'));
    end if;
    if v_now >= w.starts_at - make_interval(mins => s.order_lead_minutes) then
      raise exception 'WINDOW_CLOSED' using hint = format(
        'It''s too late to order for %s today. Please pick a later time.', w.label);
    end if;
  end if;

  -- ---- Prank protection ---------------------------------------------------------
  select count(*) into v_count
  from public.orders
  where pickup_date = p_pickup_date
    and lower(first_name) = lower(v_first)
    and lower(last_name)  = lower(v_last)
    and status not in ('canceled');
  if v_count >= s.max_orders_per_student_day then
    raise exception 'STUDENT_LIMIT' using hint = format(
      'You already have %s order(s) for that day, which is the limit.', v_count);
  end if;

  if p_ip_hash is not null then
    select count(*) into v_count
    from public.orders
    where ip_hash = p_ip_hash and created_at > now() - interval '1 hour';
    if v_count >= s.max_orders_per_hour_per_device then
      raise exception 'RATE_LIMIT' using hint = 'Too many orders from this device. Please try again later.';
    end if;
  end if;

  -- ---- What -------------------------------------------------------------------
  if coalesce(jsonb_array_length(case when jsonb_typeof(p_items) = 'array' then p_items end), 0)
     + coalesce(jsonb_array_length(case when jsonb_typeof(p_bundles) = 'array' then p_bundles end), 0) = 0
     and p_reward_id is null then
    raise exception 'EMPTY_CART' using hint = 'Your cart is empty.';
  end if;

  v_price := public._price_cart(p_items, p_bundles, v_member, p_reward_id);

  -- Every single product needed, counting what's inside bundles.
  drop table if exists _need;
  create temporary table _need on commit drop as
    select product_id, sum(qty)::int as quantity from (
      select (l->>'product_id')::uuid as product_id, (l->>'quantity')::int as qty
      from jsonb_array_elements(v_price->'lines') l
      union all
      select (i->>'product_id')::uuid, (i->>'quantity')::int * (b->>'quantity')::int
      from jsonb_array_elements(v_price->'bundles') b, jsonb_array_elements(b->'items') i
    ) t
    group by product_id;

  if (select sum(quantity) from _need) > s.max_items_per_order then
    raise exception 'TOO_MANY_ITEMS' using hint = format(
      'Orders are limited to %s items (bundles count each item inside).', s.max_items_per_order);
  end if;

  -- Lock each product (in a fixed order to avoid deadlocks) and check stock.
  for v_item in select * from _need order by product_id loop
    select * into v_product from public.products where id = v_item.product_id for update;
    v_available := public.product_available(v_product.id);
    if v_available < v_item.quantity then
      raise exception 'SOLD_OUT' using hint = case
        when v_available <= 0 then format('%s just sold out.', v_product.name)
        else format('Only %s %s left.', v_available, v_product.name) end;
    end if;
  end loop;

  -- ---- Rewards points ---------------------------------------------------------
  if v_price->'reward' <> 'null'::jsonb then
    -- Lock the member so two orders at once can't spend the same points.
    perform 1 from public.customers where id = p_customer_id for update;
    v_spent := (v_price->'reward'->>'points_cost')::int;
    if public.points_balance(p_customer_id) < v_spent then
      raise exception 'NOT_ENOUGH_POINTS' using hint = 'You don''t have enough points for that reward yet.';
    end if;
  end if;

  v_total := (v_price->>'total_cents')::int;
  if v_member and s.rewards_enabled then
    v_earned := floor(v_total * s.points_per_dollar / 100.0)::int;
  end if;

  -- ---- Save it ------------------------------------------------------------------
  insert into public.orders (first_name, last_name, grade, pickup_window_id, pickup_date, ip_hash, customer_id,
                             subtotal_cents, discount_cents, total_cents, points_earned, points_spent)
  values (v_first, v_last, v_grade, w.id, p_pickup_date, p_ip_hash, p_customer_id,
          (v_price->>'subtotal_cents')::int, (v_price->>'discount_cents')::int, v_total, v_earned, v_spent)
  returning * into v_order;

  insert into public.order_items (order_id, product_id, product_name, unit_price_cents, quantity)
  select v_order.id, (l->>'product_id')::uuid, l->>'name', (l->>'unit_price_cents')::int, (l->>'quantity')::int
  from jsonb_array_elements(v_price->'lines') l;

  for v_bundle in select * from jsonb_array_elements(v_price->'bundles') loop
    insert into public.order_bundles (order_id, bundle_id, bundle_name, unit_price_cents, quantity)
    values (v_order.id, (v_bundle->>'bundle_id')::uuid, v_bundle->>'name',
            (v_bundle->>'unit_price_cents')::int, (v_bundle->>'quantity')::int)
    returning id into v_ob_id;

    insert into public.order_items (order_id, product_id, product_name, unit_price_cents, quantity, order_bundle_id)
    select v_order.id, (i->>'product_id')::uuid, i->>'name', 0,
           (i->>'quantity')::int * (v_bundle->>'quantity')::int, v_ob_id
    from jsonb_array_elements(v_bundle->'items') i;
  end loop;

  insert into public.order_discounts (order_id, label, amount_cents, kind)
  select v_order.id, d->>'label', (d->>'amount_cents')::int, d->>'kind'
  from jsonb_array_elements(v_price->'discounts') d;

  perform public.sync_order_points(v_order.id);  -- takes the reward's points

  return jsonb_build_object(
    'order_number',  v_order.order_number,
    'pickup_date',   v_order.pickup_date,
    'pickup_window', w.label,
    'total_cents',   v_total,
    'points_earned', v_earned,
    'points_spent',  v_spent
  );
end;
$$;


-- -----------------------------------------------------------------------------
-- 9. Status changes now keep points in sync too
-- -----------------------------------------------------------------------------
create or replace function public.set_order_status(p_order_id uuid, p_status public.order_status)
returns void
language plpgsql security definer
set search_path = public
as $$
declare
  v_order public.orders;
  v_day   date := public.store_today();
  v_item  record;
  v_ref   text;
begin
  if not public.is_admin() then
    raise exception 'NOT_ALLOWED' using hint = 'Only the store admin can do that.';
  end if;

  select * into v_order from public.orders where id = p_order_id for update;
  if not found then
    raise exception 'NOT_FOUND' using hint = 'That order no longer exists.';
  end if;
  if v_order.status = p_status then
    return;
  end if;
  v_ref := '#' || lpad(v_order.order_number::text, 4, '0');

  if p_status = 'picked_up' then
    for v_item in select product_id, sum(quantity)::int as qty from public.order_items
                  where order_id = p_order_id group by product_id loop
      insert into public.stock_movements (product_id, change, reason, effective_date, note, source_id, created_by)
      values (v_item.product_id, -v_item.qty, 'online_pickup', v_day,
              format('Online order %s picked up', v_ref), p_order_id, auth.uid());
      perform public.reconcile_sales_stock(v_item.product_id, v_day);
    end loop;

  elsif v_order.status = 'picked_up' then
    v_day := (v_order.picked_up_at at time zone (select timezone from public.settings where id = 1))::date;
    for v_item in select product_id, sum(quantity)::int as qty from public.order_items
                  where order_id = p_order_id group by product_id loop
      insert into public.stock_movements (product_id, change, reason, effective_date, note, source_id, created_by)
      values (v_item.product_id, v_item.qty, 'online_pickup_undo', v_day,
              format('Order %s moved back from Picked up', v_ref), p_order_id, auth.uid());
      perform public.reconcile_sales_stock(v_item.product_id, v_day);
    end loop;
  end if;

  update public.orders
     set status = p_status,
         status_changed_at = now(),
         picked_up_at = case when p_status = 'picked_up' then now()
                             when v_order.status = 'picked_up' then null
                             else picked_up_at end
   where id = p_order_id;

  perform public.sync_order_points(p_order_id);
end;
$$;

-- Expired orders give back any points spent on them.
create or replace function public.expire_uncollected_orders()
returns int
language plpgsql security definer
set search_path = public
as $$
declare
  v_id    uuid;
  v_count int := 0;
begin
  for v_id in
    update public.orders
       set status = 'expired', status_changed_at = now()
     where status in ('received', 'preparing', 'ready')
       and pickup_date < public.store_today()
    returning id
  loop
    perform public.sync_order_points(v_id);
    v_count := v_count + 1;
  end loop;
  return v_count;
end;
$$;


-- -----------------------------------------------------------------------------
-- 10. Reading orders (students)
-- -----------------------------------------------------------------------------
-- One order as JSON, for the order page. No student name inside.
create or replace function public._order_json(p_order_id uuid)
returns jsonb
language sql stable security definer
set search_path = public
as $$
  select jsonb_build_object(
    'order_number',   o.order_number,
    'status',         o.status,
    'pickup_date',    o.pickup_date,
    'pickup_window',  w.label,
    'subtotal_cents', o.subtotal_cents,
    'discount_cents', o.discount_cents,
    'total_cents',    o.total_cents,
    'points_earned',  o.points_earned,
    'points_spent',   o.points_spent,
    'member',         o.customer_id is not null,
    'created_at',     o.created_at,
    'items', coalesce((
      select jsonb_agg(jsonb_build_object(
               'name', oi.product_name,
               'quantity', oi.quantity,
               'unit_price_cents', oi.unit_price_cents)
             order by oi.product_name)
      from public.order_items oi where oi.order_id = o.id and oi.order_bundle_id is null), '[]'::jsonb),
    'bundles', coalesce((
      select jsonb_agg(jsonb_build_object(
               'name', ob.bundle_name,
               'quantity', ob.quantity,
               'unit_price_cents', ob.unit_price_cents,
               'items', (select jsonb_agg(jsonb_build_object('name', oi.product_name, 'quantity', oi.quantity)
                                          order by oi.product_name)
                         from public.order_items oi where oi.order_bundle_id = ob.id))
             order by ob.bundle_name)
      from public.order_bundles ob where ob.order_id = o.id), '[]'::jsonb),
    'discounts', coalesce((
      select jsonb_agg(jsonb_build_object('label', d.label, 'amount_cents', d.amount_cents) order by d.kind, d.label)
      from public.order_discounts d where d.order_id = o.id), '[]'::jsonb)
  )
  from public.orders o
  join public.pickup_windows w on w.id = o.pickup_window_id
  where o.id = p_order_id;
$$;

-- Order number + last name (anyone).
create or replace function public.lookup_order(p_order_number int, p_last_name text)
returns jsonb
language sql stable security definer
set search_path = public
as $$
  select public._order_json(o.id)
  from public.orders o
  where o.order_number = p_order_number
    and lower(btrim(o.last_name)) = lower(btrim(p_last_name));
$$;

-- A signed-in member's own order (no last name needed).
create or replace function public.lookup_my_order(p_order_number int)
returns jsonb
language sql stable security definer
set search_path = public
as $$
  select public._order_json(o.id)
  from public.orders o
  where o.order_number = p_order_number
    and o.customer_id = auth.uid();
$$;


-- -----------------------------------------------------------------------------
-- 11. Public: deals, bundles and rewards for the menu
-- -----------------------------------------------------------------------------
-- Everything running today. Members-only deals are included (marked) so the
-- menu can tempt people to sign in.
create or replace function public.get_deals()
returns jsonb
language sql stable security definer
set search_path = public
as $$
  select jsonb_build_object(
    'promotions', coalesce((
      select jsonb_agg(jsonb_build_object(
               'id', pm.id, 'kind', pm.kind, 'title', pm.title,
               'product_id', pm.product_id, 'category', pm.category,
               'sale_price_cents', pm.sale_price_cents,
               'buy_qty', pm.buy_qty, 'get_qty', pm.get_qty,
               'ends_on', pm.ends_on, 'members_only', pm.members_only, 'featured', pm.featured)
             order by pm.featured desc, pm.created_at)
      from public.promotions pm
      join lateral (select pm.product_id is null
                        or exists (select 1 from public.products p
                                   where p.id = pm.product_id and not p.archived and p.available_online) as ok) c on c.ok
      where public.deal_is_live(pm.active, pm.starts_on, pm.ends_on, false, public.store_today(), false)), '[]'::jsonb),
    'bundles', coalesce((
      select jsonb_agg(x order by x->>'name')
      from (
        select jsonb_build_object(
                 'id', b.id, 'name', b.name, 'description', b.description,
                 'emoji', b.emoji, 'photo_path', b.photo_path,
                 'price_cents', b.price_cents,
                 'regular_cents', (select sum(p.price_cents * bi.quantity) from public.bundle_items bi
                                   join public.products p on p.id = bi.product_id where bi.bundle_id = b.id),
                 'members_only', b.members_only, 'ends_on', b.ends_on,
                 'available', (select coalesce(min(public.product_available(bi.product_id) / bi.quantity), 0)
                               from public.bundle_items bi where bi.bundle_id = b.id),
                 'items', (select jsonb_agg(jsonb_build_object('product_id', p.id, 'name', p.name,
                                                               'emoji', p.emoji, 'quantity', bi.quantity)
                                            order by p.name)
                           from public.bundle_items bi join public.products p on p.id = bi.product_id
                           where bi.bundle_id = b.id)) as x
        from public.bundles b
        where public.deal_is_live(b.active, b.starts_on, b.ends_on, false, public.store_today(), false)
          and exists (select 1 from public.bundle_items bi where bi.bundle_id = b.id)
          and not exists (select 1 from public.bundle_items bi join public.products p on p.id = bi.product_id
                          where bi.bundle_id = b.id and (p.archived or not p.available_online))
      ) t), '[]'::jsonb)
  );
$$;

create or replace function public.get_rewards()
returns jsonb
language sql stable security definer
set search_path = public
as $$
  select coalesce(jsonb_agg(jsonb_build_object(
           'id', rw.id, 'points_cost', rw.points_cost,
           'product_id', p.id, 'name', p.name, 'emoji', p.emoji,
           'photo_path', p.photo_path, 'category', p.category,
           'available', public.product_available(p.id))
         order by rw.points_cost, p.name), '[]'::jsonb)
  from public.rewards rw
  join public.products p on p.id = rw.product_id
  where rw.active and not p.archived and p.available_online
    and (select rewards_enabled from public.settings where id = 1);
$$;

-- The store info now also says whether rewards are on and how many points per $1.
create or replace function public.get_store_info()
returns jsonb
language sql stable security definer
set search_path = public
as $$
  select jsonb_build_object(
    'store_name',        s.store_name,
    'store_hours',       s.store_hours,
    'pickup_location',   s.pickup_location,
    'banner_text',       s.banner_text,
    'today',             public.store_today(),
    'now_time',          to_char(public.store_now_time(), 'HH24:MI'),
    'order_cutoff_time', to_char(s.order_cutoff_time, 'HH24:MI'),
    'order_lead_minutes', s.order_lead_minutes,
    'max_items_per_order', s.max_items_per_order,
    'today_is_open',     public.is_open_day(public.store_today()),
    'next_open_day',     public.next_open_day(public.store_today()),
    'rewards_enabled',   s.rewards_enabled,
    'points_per_dollar', s.points_per_dollar,
    'pickup_windows', coalesce((
      select jsonb_agg(jsonb_build_object(
               'id', w.id,
               'label', w.label,
               'starts_at', to_char(w.starts_at, 'HH24:MI'))
             order by w.sort_order, w.starts_at)
      from public.pickup_windows w where w.active), '[]'::jsonb)
  )
  from public.settings s where s.id = 1;
$$;


-- -----------------------------------------------------------------------------
-- 12. Members: their own account
-- -----------------------------------------------------------------------------
-- Create or update the signed-in student's profile.
create or replace function public.save_profile(p_first_name text, p_last_name text, p_grade text)
returns void
language plpgsql security definer
set search_path = public
as $$
declare
  v_first text := btrim(coalesce(p_first_name, ''));
  v_last  text := btrim(coalesce(p_last_name, ''));
  v_grade text := btrim(coalesce(p_grade, ''));
  v_email text := auth.jwt()->>'email';
begin
  if auth.uid() is null or v_email is null then
    raise exception 'SIGN_IN_NEEDED' using hint = 'Please sign in first.';
  end if;
  if public.is_admin() then
    raise exception 'STAFF_ACCOUNT' using hint = 'The staff login can''t be a rewards account.';
  end if;
  if v_first = '' or v_last = '' or v_grade = '' then
    raise exception 'MISSING_INFO' using hint = 'Please fill in your first name, last name, and grade.';
  end if;
  if char_length(v_first) > 40 or char_length(v_last) > 40 or char_length(v_grade) > 20 then
    raise exception 'INFO_TOO_LONG' using hint = 'One of your answers is too long.';
  end if;

  insert into public.customers (id, email, first_name, last_name, grade)
  values (auth.uid(), lower(v_email), v_first, v_last, v_grade)
  on conflict (id) do update
     set first_name = excluded.first_name, last_name = excluded.last_name,
         grade = excluded.grade, email = excluded.email, updated_at = now();
end;
$$;

-- Everything the "My rewards" page shows.
create or replace function public.get_my_account()
returns jsonb
language sql stable security definer
set search_path = public
as $$
  select case when auth.uid() is null then null else jsonb_build_object(
    'email', auth.jwt()->>'email',
    'staff', public.is_admin(),
    'profile', (select jsonb_build_object('first_name', c.first_name, 'last_name', c.last_name,
                                          'grade', c.grade, 'created_at', c.created_at)
                from public.customers c where c.id = auth.uid()),
    'balance', public.points_balance(auth.uid()),
    'history', coalesce((
      select jsonb_agg(jsonb_build_object('change', e.change, 'reason', e.reason, 'note', e.note,
                                          'order_number', e.order_number, 'created_at', e.created_at)
                       order by e.created_at desc)
      from (select * from public.point_entries where customer_id = auth.uid()
            order by created_at desc limit 30) e), '[]'::jsonb),
    'orders', coalesce((
      select jsonb_agg(jsonb_build_object('order_number', o.order_number, 'status', o.status,
                                          'pickup_date', o.pickup_date, 'total_cents', o.total_cents,
                                          'points_earned', o.points_earned, 'points_spent', o.points_spent)
                       order by o.created_at desc)
      from (select * from public.orders where customer_id = auth.uid()
            order by created_at desc limit 15) o), '[]'::jsonb)
  ) end;
$$;


-- -----------------------------------------------------------------------------
-- 13. Staff: members list and point adjustments
-- -----------------------------------------------------------------------------
create or replace function public.members_list()
returns table (
  id uuid, email text, first_name text, last_name text, grade text,
  balance int, orders int, last_order_at timestamptz, created_at timestamptz)
language sql stable security definer
set search_path = public
as $$
  select c.id, c.email, c.first_name, c.last_name, c.grade,
         public.points_balance(c.id),
         (select count(*)::int from public.orders o where o.customer_id = c.id and o.status = 'picked_up'),
         (select max(o.created_at) from public.orders o where o.customer_id = c.id),
         c.created_at
  from public.customers c
  where public.is_admin()
  order by c.last_name, c.first_name;
$$;

create or replace function public.adjust_points(p_customer_id uuid, p_change int, p_note text)
returns void
language plpgsql security definer
set search_path = public
as $$
begin
  if not public.is_admin() then
    raise exception 'NOT_ALLOWED' using hint = 'Only the store admin can do that.';
  end if;
  if p_change is null or p_change = 0 or abs(p_change) > 100000 then
    raise exception 'BAD_AMOUNT' using hint = 'Enter a number of points to add or remove.';
  end if;
  if btrim(coalesce(p_note, '')) = '' then
    raise exception 'NOTE_NEEDED' using hint = 'Say why the points changed.';
  end if;
  if public.points_balance(p_customer_id) + p_change < 0 then
    raise exception 'NEGATIVE_BALANCE' using hint = 'That would make their balance go below zero.';
  end if;
  insert into public.point_entries (customer_id, change, reason, note, created_by)
  values (p_customer_id, p_change, 'adjusted', left(btrim(p_note), 200), auth.uid());
end;
$$;


-- -----------------------------------------------------------------------------
-- 14. Security
-- -----------------------------------------------------------------------------
alter table public.customers        enable row level security;
alter table public.rewards          enable row level security;
alter table public.point_entries    enable row level security;
alter table public.promotions       enable row level security;
alter table public.bundles          enable row level security;
alter table public.bundle_items     enable row level security;
alter table public.order_bundles    enable row level security;
alter table public.order_discounts  enable row level security;

do $$
declare
  t text;
begin
  foreach t in array array['customers', 'rewards', 'promotions', 'bundles', 'bundle_items',
                           'order_bundles', 'order_discounts'] loop
    execute format(
      'create policy "admin full access" on public.%I for all to authenticated
         using (public.is_admin()) with check (public.is_admin())', t);
  end loop;
end $$;

-- Members can see their own row and points; changes go through functions.
create policy "member sees self" on public.customers
  for select to authenticated using (id = auth.uid());
create policy "admin reads points" on public.point_entries
  for select to authenticated using (public.is_admin());
create policy "member reads own points" on public.point_entries
  for select to authenticated using (customer_id = auth.uid());

-- Functions: lock everything down, then open exactly what's needed.
revoke execute on function public.deal_is_live(boolean, date, date, boolean, date, boolean) from public, anon, authenticated;
revoke execute on function public.points_balance(uuid)          from public, anon, authenticated;
revoke execute on function public.product_available(uuid)       from public, anon, authenticated;
revoke execute on function public._price_cart(jsonb, jsonb, boolean, uuid) from public, anon, authenticated;
revoke execute on function public.current_member()              from public, anon, authenticated;
revoke execute on function public.sync_order_points(uuid)       from public, anon, authenticated;
revoke execute on function public._order_json(uuid)             from public, anon, authenticated;
revoke execute on function public.place_order(text, text, text, int, date, jsonb, text, jsonb, uuid, uuid)
  from public, anon, authenticated;
revoke execute on function public.expire_uncollected_orders()   from public, anon, authenticated;

grant execute on function public.quote_cart(jsonb, jsonb, uuid)  to anon, authenticated;
grant execute on function public.get_deals()                     to anon, authenticated;
grant execute on function public.get_rewards()                   to anon, authenticated;
grant execute on function public.get_store_info()                to anon, authenticated;
grant execute on function public.lookup_order(int, text)         to anon, authenticated;
grant execute on function public.lookup_my_order(int)            to authenticated;
grant execute on function public.save_profile(text, text, text)  to authenticated;
grant execute on function public.get_my_account()                to authenticated;
grant execute on function public.members_list()                  to authenticated;
grant execute on function public.adjust_points(uuid, int, text)  to authenticated;
grant execute on function public.set_order_status(uuid, public.order_status) to authenticated;
grant execute on function public.place_order(text, text, text, int, date, jsonb, text, jsonb, uuid, uuid) to service_role;
grant execute on function public.expire_uncollected_orders()     to service_role;

-- Bundle and deal photos use the same public bucket as product photos.
