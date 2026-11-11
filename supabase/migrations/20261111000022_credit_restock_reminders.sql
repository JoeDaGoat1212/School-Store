-- =============================================================================
-- School Store — update 22: $1 an hour of credit, new restock photos, reminders
-- =============================================================================
-- STORE CREDIT (from the week of Monday Nov 9, 2026 on):
--   Every hour worked earns $1 of store credit, counted to the minute
--   (a 55-minute period = 92¢), up to $10 a week. Weeks before keep the old
--   rule, so nobody's earlier credit changes. The 10%-off-per-hour discount
--   (up to 50%) is unchanged. $1, $10 and the start week are settings.
--
-- RESTOCK PHOTOS: six photos in this order: drinks, right half of the
--   snacks, left half of the snacks, spicy chips, regular chips, ramen. Each
--   check is stamped with the class period it was taken in (period_label).
--
-- CLOCK-OUT REMINDER: staff_shifts.out_reminded_at marks shifts that already
--   got the "you've been clocked in for an hour" notification.
-- =============================================================================

alter table public.settings
  add column if not exists staff_credit_week_cap_cents int  not null default 1000 check (staff_credit_week_cap_cents between 0 and 100000),
  add column if not exists staff_credit_rule_from      date not null default date '2026-11-09';

update public.settings set staff_credit_cents_per_hour = 100 where id = 1;

alter table public.settings
  alter column restock_areas set default array['Drinks', 'Snacks (right half)', 'Snacks (left half)', 'Spicy chips', 'Regular chips', 'Ramen'];
update public.settings
  set restock_areas = array['Drinks', 'Snacks (right half)', 'Snacks (left half)', 'Spicy chips', 'Regular chips', 'Ramen']
  where id = 1;

alter table public.restock_checks add column if not exists period_label text;
alter table public.staff_shifts   add column if not exists out_reminded_at timestamptz;

-- Same columns as before (update 16); only how credit is earned changed.
create or replace function public.staff_credit_balances()
returns table (
  staff_id            uuid,
  worked_minutes      int,
  week_minutes        int,
  discount_pct        int,
  earned_cents        int,
  adjust_cents        int,
  balance_cents       int,
  next_credit_minutes int
)
language sql stable
set search_path = public
as $$
  with cfg as (
    select timezone as tz,
           staff_discount_pct_per_hour as pct,
           staff_credit_after_hours    as after_hours,
           staff_credit_cents_per_hour as cents,
           staff_credit_week_cap_cents as cap,
           staff_credit_rule_from      as rule_from
      from public.settings where id = 1
  ),
  per_week as (
    select sh.staff_id,
           date_trunc('week', sh.clock_in at time zone cfg.tz) as week,
           coalesce(sum(extract(epoch from (sh.clock_out - sh.clock_in))) filter (where sh.clock_out is not null), 0) as done_secs,
           sum(extract(epoch from (coalesce(sh.clock_out, now()) - sh.clock_in))) as all_secs
      from public.staff_shifts sh cross join cfg
     where sh.staff_id is not null
     group by sh.staff_id, 2
  ),
  earned as (
    select pw.staff_id,
           sum(floor(pw.done_secs / 60))::int as minutes,
           sum(case
                 -- New rule: $1 an hour, to the minute, up to the weekly cap.
                 when pw.week >= cfg.rule_from::timestamp
                   then least(cfg.cap, floor(floor(pw.done_secs / 60) * cfg.cents / 60.0))
                 -- Old rule (weeks before): $1 for each whole hour past the first 5.
                 else greatest(0, floor(pw.done_secs / 3600)::int - cfg.after_hours) * 100
               end)::int as cents
      from per_week pw cross join cfg
     group by pw.staff_id
  ),
  this_week as (
    select pw.staff_id, floor(pw.all_secs / 60)::int as minutes
      from per_week pw cross join cfg
     where pw.week = date_trunc('week', now() at time zone cfg.tz)
  ),
  adjusted as (
    select e.staff_id, sum(e.amount_cents)::int as cents from public.staff_credit_entries e group by e.staff_id
  )
  select s.id,
         coalesce(e.minutes, 0),
         coalesce(w.minutes, 0),
         (least(coalesce(w.minutes, 0) / 60, cfg.after_hours) * cfg.pct)::int,
         coalesce(e.cents, 0),
         coalesce(a.cents, 0),
         coalesce(e.cents, 0) + coalesce(a.cents, 0),
         60 - (coalesce(w.minutes, 0) % 60)
    from public.staff s
    cross join cfg
    left join earned    e on e.staff_id = s.id
    left join this_week w on w.staff_id = s.id
    left join adjusted  a on a.staff_id = s.id;
$$;

revoke execute on function public.staff_credit_balances() from public, anon;
grant execute on function public.staff_credit_balances() to authenticated, service_role;
