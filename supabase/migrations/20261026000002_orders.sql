-- =============================================================================
-- School Store — ordering, stock reconciliation, and public read functions
-- =============================================================================
-- The public (students) never read or write tables directly. They only call
-- these functions:
--   get_menu()             products students can see, with "available" counts
--   get_store_info()       hours, banner, pickup windows, what days are open
--   lookup_order(n, last)  status of one order, needs the matching last name
--   place_order(...)       creates an order (called by the website server only)
--
-- Errors use short codes in the message (e.g. 'SOLD_OUT') and a friendly
-- sentence in the HINT. The website shows the hint to students.
-- =============================================================================


-- -----------------------------------------------------------------------------
-- Public: menu and store info
-- -----------------------------------------------------------------------------

-- Products students can order. Leaves out cost, supplier, and exact stock.
-- `available` = stock − reserved, never below 0.
create or replace function public.get_menu()
returns table (
  id          uuid,
  name        text,
  description text,
  category    text,
  emoji       text,
  photo_path  text,
  price_cents int,
  tags        text[],
  available   int
)
language sql stable security definer
set search_path = public
as $$
  select p.id, p.name, p.description, p.category, p.emoji, p.photo_path,
         p.price_cents, p.tags,
         greatest(p.stock - coalesce(r.reserved, 0), 0) as available
  from public.products p
  left join public.product_reserved r on r.product_id = p.id
  where p.available_online and not p.archived
  order by p.category, p.name;
$$;

-- Everything the public pages need to know about the store, as one JSON object.
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
-- Public: order lookup (order number + last name)
-- -----------------------------------------------------------------------------
-- Returns no rows unless BOTH match, so guessing order numbers reveals nothing.
-- The student's name is not returned.
create or replace function public.lookup_order(p_order_number int, p_last_name text)
returns jsonb
language sql stable security definer
set search_path = public
as $$
  select jsonb_build_object(
    'order_number', o.order_number,
    'status',       o.status,
    'pickup_date',  o.pickup_date,
    'pickup_window', w.label,
    'total_cents',  o.total_cents,
    'created_at',   o.created_at,
    'items', (
      select jsonb_agg(jsonb_build_object(
               'name', oi.product_name,
               'quantity', oi.quantity,
               'unit_price_cents', oi.unit_price_cents)
             order by oi.product_name)
      from public.order_items oi where oi.order_id = o.id)
  )
  from public.orders o
  join public.pickup_windows w on w.id = o.pickup_window_id
  where o.order_number = p_order_number
    and lower(btrim(o.last_name)) = lower(btrim(p_last_name));
$$;


-- -----------------------------------------------------------------------------
-- place_order: the only way an order gets created
-- -----------------------------------------------------------------------------
-- Called by the website's server (with the service role key), never directly
-- from a browser — that's how we know the ip_hash is real and can't be faked.
--
-- p_items is a JSON array: [{"product_id": "...", "quantity": 2}, ...]
--
-- Everything happens in one transaction. Product rows are locked while we
-- check stock, so two students can't both buy the last bag of chips.
create or replace function public.place_order(
  p_first_name       text,
  p_last_name        text,
  p_grade            text,
  p_pickup_window_id int,
  p_pickup_date      date,
  p_items            jsonb,
  p_ip_hash          text
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
  v_item       record;
  v_product    public.products;
  v_available  int;
  v_total      int := 0;
  v_count      int;
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

  -- ---- When -------------------------------------------------------------------
  -- Students can order for today or for the next open school day.
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
  -- 1) Limit orders per student per day (same first + last name).
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

  -- 2) Limit orders per device per hour.
  if p_ip_hash is not null then
    select count(*) into v_count
    from public.orders
    where ip_hash = p_ip_hash and created_at > now() - interval '1 hour';
    if v_count >= s.max_orders_per_hour_per_device then
      raise exception 'RATE_LIMIT' using hint = 'Too many orders from this device. Please try again later.';
    end if;
  end if;

  -- ---- What -------------------------------------------------------------------
  if p_items is null or jsonb_typeof(p_items) <> 'array' or jsonb_array_length(p_items) = 0 then
    raise exception 'EMPTY_CART' using hint = 'Your cart is empty.';
  end if;

  -- Combine duplicate lines and check quantities.
  drop table if exists _cart;
  create temporary table _cart on commit drop as
    select (x->>'product_id')::uuid as product_id, sum((x->>'quantity')::int)::int as quantity
    from jsonb_array_elements(p_items) as x
    group by 1;

  if exists (select 1 from _cart where quantity is null or quantity < 1) then
    raise exception 'BAD_QUANTITY' using hint = 'Each item needs a quantity of at least 1.';
  end if;
  if (select sum(quantity) from _cart) > s.max_items_per_order then
    raise exception 'TOO_MANY_ITEMS' using hint = format(
      'Orders are limited to %s items.', s.max_items_per_order);
  end if;

  -- Create the order first (total filled in below).
  insert into public.orders (first_name, last_name, grade, pickup_window_id, pickup_date, total_cents, ip_hash)
  values (v_first, v_last, v_grade, w.id, p_pickup_date, 0, p_ip_hash)
  returning * into v_order;

  -- Lock each product (in a fixed order to avoid deadlocks) and check stock.
  for v_item in select * from _cart order by product_id loop
    select * into v_product from public.products where id = v_item.product_id for update;

    if not found or v_product.archived or not v_product.available_online then
      raise exception 'UNAVAILABLE' using hint = 'An item in your cart is no longer available. Please refresh the menu.';
    end if;

    select v_product.stock - coalesce((select reserved from public.product_reserved where product_id = v_product.id), 0)
      into v_available;

    if v_available < v_item.quantity then
      raise exception 'SOLD_OUT' using hint = case
        when v_available <= 0 then format('%s just sold out.', v_product.name)
        else format('Only %s %s left.', v_available, v_product.name) end;
    end if;

    insert into public.order_items (order_id, product_id, product_name, unit_price_cents, quantity)
    values (v_order.id, v_product.id, v_product.name, v_product.price_cents, v_item.quantity);

    v_total := v_total + v_product.price_cents * v_item.quantity;
  end loop;

  update public.orders set total_cents = v_total where id = v_order.id;

  return jsonb_build_object(
    'order_number',  v_order.order_number,
    'pickup_date',   v_order.pickup_date,
    'pickup_window', w.label,
    'total_cents',   v_total
  );
end;
$$;


-- -----------------------------------------------------------------------------
-- Stock reconciliation between online pickups and imported sales
-- -----------------------------------------------------------------------------
-- The rule: stock goes down when an item is paid for.
--   * Online orders are paid at pickup → stock goes down when marked Picked up.
--   * In-person sales only reach us through the InTouchPay import.
--   * BUT online orders are also rung up in InTouchPay, so they appear in the
--     import too. Subtracting both would count them twice.
--
-- So for each product and day:
--     I = units in imported sales that day
--     P = units from online orders picked up that day
--   The import should only subtract what the pickups didn't already:
--     import share = max(0, I − P)
--
-- This function compares that target with what imports have already
-- subtracted for that product/day, and adds one movement for the difference.
-- It's safe to call any number of times (calling it twice changes nothing).
create or replace function public.reconcile_sales_stock(p_product_id uuid, p_day date)
returns void
language plpgsql security definer
set search_path = public
as $$
declare
  v_imported  int;
  v_picked_up int;
  v_target    int;
  v_current   int;
begin
  select coalesce(sum(quantity), 0) into v_imported
  from public.sales_lines
  where product_id = p_product_id and sale_date = p_day;

  select coalesce(-sum(change), 0) into v_picked_up
  from public.stock_movements
  where product_id = p_product_id and effective_date = p_day
    and reason in ('online_pickup', 'online_pickup_undo');

  v_target := greatest(v_imported - v_picked_up, 0);

  select coalesce(-sum(change), 0) into v_current
  from public.stock_movements
  where product_id = p_product_id and effective_date = p_day
    and reason = 'sale_import';

  if v_target <> v_current then
    insert into public.stock_movements (product_id, change, reason, effective_date, note, created_by)
    values (p_product_id, -(v_target - v_current), 'sale_import', p_day,
            format('In-person sales on %s (imported %s, online pickups %s)', p_day, v_imported, v_picked_up),
            auth.uid());
  end if;
end;
$$;


-- -----------------------------------------------------------------------------
-- Staff: change an order's status
-- -----------------------------------------------------------------------------
-- Moving TO picked_up subtracts the items from stock (they've been paid for).
-- Moving AWAY from picked_up (a mistake) puts them back.
create or replace function public.set_order_status(p_order_id uuid, p_status public.order_status)
returns void
language plpgsql security definer
set search_path = public
as $$
declare
  v_order public.orders;
  v_day   date := public.store_today();
  v_item  record;
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

  if p_status = 'picked_up' then
    for v_item in select product_id, sum(quantity)::int as qty from public.order_items
                  where order_id = p_order_id group by product_id loop
      insert into public.stock_movements (product_id, change, reason, effective_date, note, source_id, created_by)
      values (v_item.product_id, -v_item.qty, 'online_pickup', v_day,
              format('Online order SS-%s picked up', lpad(v_order.order_number::text, 4, '0')),
              p_order_id, auth.uid());
      perform public.reconcile_sales_stock(v_item.product_id, v_day);
    end loop;

  elsif v_order.status = 'picked_up' then
    -- Undo on the day it was picked up, so the day's math still lines up.
    v_day := (v_order.picked_up_at at time zone (select timezone from public.settings where id = 1))::date;
    for v_item in select product_id, sum(quantity)::int as qty from public.order_items
                  where order_id = p_order_id group by product_id loop
      insert into public.stock_movements (product_id, change, reason, effective_date, note, source_id, created_by)
      values (v_item.product_id, v_item.qty, 'online_pickup_undo', v_day,
              format('Order SS-%s moved back from Picked up', lpad(v_order.order_number::text, 4, '0')),
              p_order_id, auth.uid());
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
end;
$$;


-- -----------------------------------------------------------------------------
-- Scheduled housekeeping (run by pg_cron, see the jobs migration)
-- -----------------------------------------------------------------------------

-- Close orders nobody collected on past days. This releases their reserved
-- stock (reservations only count open orders).
create or replace function public.expire_uncollected_orders()
returns int
language sql security definer
set search_path = public
as $$
  with expired as (
    update public.orders
       set status = 'expired', status_changed_at = now()
     where status in ('received', 'preparing', 'ready')
       and pickup_date < public.store_today()
    returning 1
  )
  select count(*)::int from expired;
$$;

-- Delete orders older than the retention setting (default 90 days).
-- Stock history keeps its rows (they hold no personal info).
create or replace function public.delete_old_orders()
returns int
language sql security definer
set search_path = public
as $$
  with gone as (
    delete from public.orders
     where created_at < now() - make_interval(days => (select order_retention_days from public.settings where id = 1))
    returning 1
  )
  select count(*)::int from gone;
$$;
