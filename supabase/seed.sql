-- =============================================================================
-- Firebirds Nest — sample data for testing
-- =============================================================================
-- Creates ~4 weeks of realistic history ending TODAY, so the dashboard and
-- charts look real whenever you run it:
--   * 20 products with InTouchPay alias names
--   * weekly shopping trips (expenses) that restock inventory
--   * one sales import of in-person + online sales for past school days
--   * online orders: past ones picked up, today's in every status
--
-- The numbers are random but repeatable (same seed = same data).
-- Safe to run only on an EMPTY database (e.g. after `supabase db reset`).
-- =============================================================================

do $$ begin perform setseed(0.42); end $$;  -- repeatable random numbers

-- -----------------------------------------------------------------------------
-- Store setup
-- -----------------------------------------------------------------------------
update public.settings set
  store_name      = 'Firebirds Nest',
  store_hours     = 'Mon–Fri · before school through 7th hour',
  pickup_location = 'Store window next to the cafeteria',
  banner_text     = 'New: Uncrustables are back in stock!',
  next_shopping_date = public.next_open_day(public.store_today() + 3)
where id = 1;

-- Bell schedule placeholders — edit these in Settings to match your school.
insert into public.pickup_windows (label, starts_at, sort_order) values
  ('Before school',   '07:15', 0),
  ('After 1st hour',  '08:15', 1),
  ('After 2nd hour',  '09:10', 2),
  ('After 3rd hour',  '10:05', 3),
  ('After 4th hour',  '11:00', 4),
  ('After 5th hour',  '12:25', 5),
  ('After 6th hour',  '13:20', 6),
  ('After 7th hour',  '14:15', 7);

insert into public.closed_dates (closed_on, reason) values
  ('2026-11-11', 'Veterans Day'),
  ('2026-11-25', 'Thanksgiving break'),
  ('2026-11-26', 'Thanksgiving break'),
  ('2026-11-27', 'Thanksgiving break'),
  ('2026-12-21', 'Winter break'),
  ('2026-12-22', 'Winter break'),
  ('2026-12-23', 'Winter break'),
  ('2026-12-24', 'Winter break'),
  ('2026-12-25', 'Winter break'),
  ('2026-12-28', 'Winter break'),
  ('2026-12-29', 'Winter break'),
  ('2026-12-30', 'Winter break'),
  ('2026-12-31', 'Winter break'),
  ('2027-01-01', 'Winter break')
on conflict do nothing;

insert into public.suppliers (name, notes) values
  ('Costco',      'Membership card is in the store cash box'),
  ('Sam''s Club', 'Best price on Gatorade and water'),
  ('Walmart',     'Closest store; good for quick restocks'),
  ('Fry''s',      'Fresh fruit and baked goods');

-- -----------------------------------------------------------------------------
-- Products
-- -----------------------------------------------------------------------------
-- `pop` (popularity, units per school day) is only used to generate sales
-- below; it's not a real column.
create temporary table seed_products (
  name text, alias text, category text, emoji text, description text,
  price numeric, cost numeric, supplier text, perishable boolean,
  shelf_days int, pop numeric, reorder int, online boolean, tags text[]
);

insert into seed_products values
  ('Hot Cheetos',            'HOT CHEETOS 1OZ',     'Snacks',   '🌶️', 'Flamin'' Hot, 1 oz bag',              1.50, 0.55, 'Costco',      false, null, 8,   20, true,  '{}'),
  ('Doritos Nacho Cheese',   'DORITOS NACHO',       'Snacks',   '🧀', 'Classic nacho cheese, 1 oz bag',       1.50, 0.55, 'Costco',      false, null, 6,   15, true,  '{}'),
  ('Takis Fuego',            'TAKIS FUEGO',         'Snacks',   '🔥', 'Hot chili pepper & lime rolls',        1.50, 0.60, 'Sam''s Club', false, null, 7,   18, true,  '{}'),
  ('Rice Krispies Treat',    'RICE KRISPIE TREAT',  'Snacks',   '🍘', 'The original marshmallow square',      1.00, 0.30, 'Costco',      false, null, 4,   12, true,  '{}'),
  ('Pop-Tarts',              'POPTART STRAWBERRY',  'Snacks',   '🍓', 'Frosted strawberry, 2-pack',           1.50, 0.50, 'Costco',      false, null, 4,   12, true,  '{}'),
  ('Nature Valley Bar',      'NATURE VALLEY',       'Snacks',   '🌾', 'Oats ''n honey granola bar, 2-pack',   1.00, 0.40, 'Costco',      false, null, 3,   10, true,  '{}'),
  ('Beef Jerky',             'JACK LINKS JERKY',    'Snacks',   '🥩', 'Original beef jerky, 0.6 oz',          2.50, 1.20, 'Sam''s Club', false, null, 2,    6, true,  '{}'),
  ('Sour Patch Kids',        'SOUR PATCH KIDS',     'Snacks',   '🍬', 'Sour then sweet, 2 oz bag',            1.50, 0.65, 'Walmart',     false, null, 5,   12, true,  '{new}'),
  ('Cup Noodles',            'CUP NOODLE CHICKEN',  'Hot food', '🍜', 'Chicken flavor — we add the hot water', 1.50, 0.45, 'Walmart',     false, null, 4,   10, true,  '{}'),
  ('Uncrustables',           'UNCRUSTABLES PBJ',    'Hot food', '🥪', 'PB&J, thawed and ready',               2.00, 0.85, 'Costco',      true,  30,   5,   15, true,  '{}'),
  ('Blueberry Muffin',       'MUFFIN BLUEBERRY',    'Hot food', '🧁', 'Big bakery muffin',                    2.00, 0.90, 'Fry''s',      true,  4,    3,    8, true,  '{limited}'),
  ('Banana',                 'BANANA',              'Hot food', '🍌', 'One fresh banana',                     0.50, 0.20, 'Fry''s',      true,  6,    2,    6, true,  '{}'),
  ('Bottled Water',          'WATER 16.9OZ',        'Drinks',   '💧', '16.9 oz bottle',                       1.00, 0.20, 'Sam''s Club', false, null, 9,   24, true,  '{}'),
  ('Gatorade',               'GATORADE 20OZ',       'Drinks',   '🧊', 'Cool Blue or Fruit Punch, 20 oz',      2.00, 0.85, 'Sam''s Club', false, null, 7,   18, true,  '{}'),
  ('AriZona Iced Tea',       'ARIZONA TEA CAN',     'Drinks',   '🍵', 'Green tea with honey, 23 oz can',      1.25, 0.60, 'Walmart',     false, null, 6,   15, true,  '{}'),
  ('Capri Sun',              'CAPRI SUN',           'Drinks',   '🧃', 'Pacific Cooler pouch',                 1.00, 0.35, 'Costco',      false, null, 3,   10, true,  '{}'),
  ('Chocolate Milk',         'CHOC MILK',           'Drinks',   '🥛', 'Low-fat, 14 oz bottle',                1.50, 0.70, 'Fry''s',      true,  12,   2,    6, true,  '{}'),
  ('Pencils (2-pack)',       'PENCIL 2PK',          'Supplies', '✏️', '#2 pencils, sharpened',                0.50, 0.15, 'Walmart',     false, null, 1,    8, true,  '{}'),
  ('Blue Pens (2-pack)',     'PEN BLUE 2PK',        'Supplies', '🖊️', 'Medium point ballpoint',               1.00, 0.35, 'Walmart',     false, null, 1,    8, true,  '{}'),
  ('Composition Notebook',   'COMP NOTEBOOK',       'Supplies', '📓', 'Wide ruled, 100 sheets',               2.00, 0.90, 'Walmart',     false, null, 0.4,  4, false, '{}');

insert into public.products (name, description, category, emoji, price_cents, unit_cost_cents,
                             reorder_point, supplier_id, is_perishable, available_online, tags, lead_days)
select sp.name, sp.description, sp.category, sp.emoji,
       (sp.price * 100)::int, (sp.cost * 100)::int, sp.reorder,
       s.id, sp.perishable, sp.online, sp.tags, 2
from seed_products sp
join public.suppliers s on s.name = sp.supplier;

insert into public.product_aliases (product_id, alias)
select p.id, lower(sp.alias)
from seed_products sp join public.products p on p.name = sp.name;


-- -----------------------------------------------------------------------------
-- Four weeks of history, one school day at a time
-- -----------------------------------------------------------------------------
do $$
declare
  v_today      date := public.store_today();
  v_start      date := v_today - 28;
  v_day        date;
  v_import_id  uuid;
  v_expense_id uuid;
  v_order_id   uuid;
  v_window     int;
  v_prod       record;
  v_qty        int;
  v_left       int;
  v_buy        int;
  v_line_qty   int;
  v_seq        int := 0;
  v_online     int;
  v_suppliers  text[] := array['Costco', 'Sam''s Club', 'Walmart', 'Fry''s'];
  v_supplier   text;
  v_first      text[] := array['Ava','Liam','Sofia','Noah','Isabella','Mateo','Mia','Ethan','Camila','Lucas',
                               'Harper','Diego','Aaliyah','Jayden','Emily','Gabriel','Zoe','Elijah','Valeria','Owen'];
  v_last       text[] := array['Garcia','Nguyen','Smith','Martinez','Johnson','Lopez','Brown','Hernandez','Lee','Davis',
                               'Rodriguez','Wilson','Begay','Patel','Thompson','Ramirez','Clark','Yazzie','Kim','Torres'];
  v_grades     text[] := array['9th','10th','11th','12th'];
  v_order_no   int;
  v_n          int;
  v_tx         int := 10400;
begin
  -- Starting inventory (counted by hand 4 weeks ago).
  insert into public.stock_movements (product_id, change, reason, effective_date, note)
  select p.id, ceil(sp.pop * 6 + 12)::int, 'initial', v_start, 'Starting count'
  from seed_products sp join public.products p on p.name = sp.name;

  -- The import that holds all past in-person sales.
  insert into public.sales_imports (file_name, file_hash, column_mapping, date_from, date_to)
  values ('intouchpay-sales-sample.csv', 'seed-' || md5(v_today::text), '{"seeded": true}', v_start, v_today - 1)
  returning id into v_import_id;

  v_day := v_start;
  while v_day < v_today loop
    if public.is_open_day(v_day) then

      -- ---- Monday (or first open day of the week): shopping trip -------------
      if extract(isodow from v_day) = 1 or not public.is_open_day(v_day - 1) and extract(isodow from v_day) <= 2 then
        foreach v_supplier in array v_suppliers loop
          v_expense_id := null;
          for v_prod in
            select p.*, sp.pop, sp.shelf_days from public.products p
            join seed_products sp on sp.name = p.name
            join public.suppliers s on s.id = p.supplier_id
            where s.name = v_supplier
          loop
            -- Buy enough for ~7 days. Skip two items on the most recent trip so
            -- they show up as low stock today.
            v_buy := ceil(v_prod.pop * 7 + 6)::int - v_prod.stock;
            if v_day >= v_today - 7 and v_prod.name in ('Takis Fuego', 'Uncrustables') then
              v_buy := 0;
            end if;
            continue when v_buy < 4;
            v_buy := ceil(v_buy / 6.0)::int * 6;   -- buy in packs of 6

            if v_expense_id is null then
              insert into public.expenses (purchased_on, supplier_id, buyer_name, notes)
              select v_day, id, (array['Ms. Alvarez','Jordan (store manager)','Mr. Chen'])[1 + floor(random() * 3)::int],
                     'Weekly restock'
              from public.suppliers where name = v_supplier
              returning id into v_expense_id;
            end if;

            insert into public.expense_items (expense_id, product_id, description, quantity, unit_cost_cents)
            values (v_expense_id, v_prod.id, v_prod.name, v_buy, v_prod.unit_cost_cents);

            insert into public.stock_movements (product_id, change, reason, effective_date, note, source_id)
            values (v_prod.id, v_buy, 'restock', v_day, 'Shopping trip', v_expense_id);

            if v_prod.is_perishable then
              insert into public.product_batches (product_id, quantity, received_on, expires_on, expense_id)
              values (v_prod.id, v_buy, v_day, v_day + v_prod.shelf_days, v_expense_id);
            end if;
          end loop;

          -- Supplies that aren't sold still count as spending.
          if v_expense_id is not null and v_supplier = 'Costco' then
            insert into public.expense_items (expense_id, description, quantity, unit_cost_cents)
            values (v_expense_id, 'Napkins (500 ct)', 1, 649);
          end if;

          if v_expense_id is not null then
            update public.expenses e
               set total_cents = (select sum(line_total_cents) from public.expense_items where expense_id = e.id)
             where e.id = v_expense_id;
          end if;
        end loop;
      end if;

      -- ---- Sales for the day -------------------------------------------------
      for v_prod in
        select p.*, sp.pop, sp.alias from public.products p join seed_products sp on sp.name = p.name
      loop
        -- Busier on Mondays and Fridays, a little random every day.
        v_qty := floor(v_prod.pop * (0.6 + random() * 0.8)
                       * case extract(isodow from v_day) when 1 then 1.15 when 5 then 1.2 else 1 end)::int;
        v_qty := least(v_qty, greatest(v_prod.stock, 0));
        v_left := v_qty;

        -- Split the day's units into 1–2 unit transactions.
        while v_left > 0 loop
          v_line_qty := least(v_left, 1 + floor(random() * 2)::int);
          v_left := v_left - v_line_qty;
          v_seq := v_seq + 1;
          v_tx := v_tx + 1;
          insert into public.sales_lines (import_id, sold_at, sale_date, raw_item_name, product_id, quantity,
                                          unit_price_cents, total_cents, payment_type, transaction_ref, fingerprint)
          values (v_import_id,
                  (v_day + time '07:05' + (random() * interval '7 hours 20 minutes')) at time zone 'America/Phoenix',
                  v_day, v_prod.alias, v_prod.id, v_line_qty,
                  v_prod.price_cents, v_prod.price_cents * v_line_qty,
                  case when random() < 0.62 then 'cash' else 'debit' end::public.payment_type,
                  'T' || v_tx, md5('seed-line-' || v_seq));
        end loop;
      end loop;

      -- A couple of items the export calls something we don't recognize yet.
      if random() < 0.35 then
        v_seq := v_seq + 1;
        v_tx := v_tx + 1;
        insert into public.sales_lines (import_id, sold_at, sale_date, raw_item_name, product_id, quantity,
                                        unit_price_cents, total_cents, payment_type, transaction_ref, fingerprint)
        values (v_import_id, (v_day + time '12:30') at time zone 'America/Phoenix', v_day,
                (array['FRUIT SNACKS','MISC ITEM'])[1 + floor(random() * 2)::int], null, 1, 100, 100,
                'cash', 'T' || v_tx, md5('seed-line-' || v_seq));
      end if;

      -- ---- Online orders that were picked up (2–5 per day) ------------------
      -- They were also rung up in InTouchPay, so their items come out of the
      -- day's imported sales (no extra revenue, no double stock count).
      v_online := 2 + floor(random() * 4)::int;
      for v_n in 1 .. v_online loop
        select id into v_window from public.pickup_windows order by random() limit 1;
        insert into public.orders (first_name, last_name, grade, pickup_window_id, pickup_date, status,
                                   total_cents, created_at, status_changed_at, picked_up_at)
        values (v_first[1 + floor(random() * 20)::int], v_last[1 + floor(random() * 20)::int],
                v_grades[1 + floor(random() * 4)::int], v_window, v_day, 'picked_up', 0,
                (v_day + time '06:40') at time zone 'America/Phoenix',
                (v_day + time '11:00') at time zone 'America/Phoenix',
                (v_day + time '11:00') at time zone 'America/Phoenix')
        returning id, order_number into v_order_id, v_order_no;

        -- 1–3 different products that sold at least that many units that day.
        insert into public.order_items (order_id, product_id, product_name, unit_price_cents, quantity)
        select v_order_id, p.id, p.name, p.price_cents, 1
        from public.products p
        where p.available_online
          and (select coalesce(sum(quantity), 0) from public.sales_lines sl
               where sl.product_id = p.id and sl.sale_date = v_day)
            > (select coalesce(sum(oi.quantity), 0) from public.order_items oi
               join public.orders o on o.id = oi.order_id
               where oi.product_id = p.id and o.pickup_date = v_day and o.status = 'picked_up')
        order by random()
        limit 1 + floor(random() * 3)::int;

        update public.orders o
           set total_cents = coalesce((select sum(unit_price_cents * quantity) from public.order_items where order_id = o.id), 0)
         where o.id = v_order_id;

        insert into public.stock_movements (product_id, change, reason, effective_date, note, source_id)
        select oi.product_id, -oi.quantity, 'online_pickup', v_day,
               format('Online order SS-%s picked up', lpad(v_order_no::text, 4, '0')), v_order_id
        from public.order_items oi where oi.order_id = v_order_id;
      end loop;

      -- ---- Take the rest of the day's sales out of stock --------------------
      perform public.reconcile_sales_stock(p.id, v_day) from public.products p;

      -- A few spoiled bananas/muffins on Fridays.
      if extract(isodow from v_day) = 5 then
        insert into public.stock_movements (product_id, change, reason, effective_date, note)
        select p.id, -1, 'spoilage', v_day, 'Went bad over the week'
        from public.products p where p.name in ('Banana', 'Blueberry Muffin') and p.stock > 0;
      end if;
    end if;
    v_day := v_day + 1;
  end loop;

  -- Finish the import's summary numbers.
  update public.sales_imports si set
    row_count      = (select count(*) from public.sales_lines where import_id = si.id),
    imported_count = (select count(*) from public.sales_lines where import_id = si.id),
    revenue_cents  = (select coalesce(sum(total_cents), 0) from public.sales_lines where import_id = si.id),
    created_at     = ((select max(sale_date) from public.sales_lines) + time '15:30') at time zone 'America/Phoenix'
  where si.id = v_import_id;

  -- ---- Today's online orders, in every status ---------------------------------
  for v_n in 1 .. 12 loop
    select id into v_window from public.pickup_windows order by sort_order offset (v_n % 8) limit 1;
    insert into public.orders (first_name, last_name, grade, pickup_window_id, pickup_date, status, total_cents, staff_notes)
    values (v_first[1 + (v_n * 7) % 20], v_last[1 + (v_n * 3) % 20], v_grades[1 + v_n % 4], v_window, v_today,
            (array['received','received','received','received','preparing','preparing','ready','ready',
                   'received','canceled','received','preparing'])[v_n]::public.order_status,
            0, case when v_n = 10 then 'Student asked to cancel' end)
    returning id into v_order_id;

    insert into public.order_items (order_id, product_id, product_name, unit_price_cents, quantity)
    select v_order_id, p.id, p.name, p.price_cents, 1 + floor(random() * 2)::int
    from public.products p
    where p.available_online and p.stock > 4
    order by random()
    limit 1 + floor(random() * 3)::int;

    update public.orders o
       set total_cents = (select sum(unit_price_cents * quantity) from public.order_items where order_id = o.id)
     where o.id = v_order_id;
  end loop;

  -- Two orders already placed for the next school day.
  for v_n in 1 .. 2 loop
    insert into public.orders (first_name, last_name, grade, pickup_window_id, pickup_date, total_cents)
    values (v_first[v_n + 4], v_last[v_n + 9], '10th', (select id from public.pickup_windows where sort_order = 0),
            public.next_open_day(v_today), 0)
    returning id into v_order_id;
    insert into public.order_items (order_id, product_id, product_name, unit_price_cents, quantity)
    select v_order_id, p.id, p.name, p.price_cents, 1
    from public.products p where p.name in ('Pop-Tarts', 'Chocolate Milk');
    update public.orders o
       set total_cents = (select sum(unit_price_cents * quantity) from public.order_items where order_id = o.id)
     where o.id = v_order_id;
  end loop;
end $$;

drop table seed_products;
