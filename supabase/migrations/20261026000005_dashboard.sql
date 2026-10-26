-- =============================================================================
-- School Store — numbers for the staff dashboard, in one call
-- =============================================================================

create or replace function public.dashboard_summary()
returns jsonb
language plpgsql stable security definer
set search_path = public
as $$
declare
  v_today date := public.store_today();
  -- Monday of this week
  v_week_start date := v_today - (extract(isodow from v_today)::int - 1);
  v_result jsonb;
begin
  if not public.is_admin() then
    raise exception 'NOT_ALLOWED' using hint = 'Only the store admin can do that.';
  end if;

  select jsonb_build_object(
    'today', v_today,
    'week_start', v_week_start,

    -- {"received": 4, "ready": 2, ...} for orders picked up today
    'orders_today', coalesce((
      select jsonb_object_agg(status, n)
      from (select status, count(*) as n from public.orders
            where pickup_date = v_today group by status) t), '{}'::jsonb),

    'orders_upcoming', (
      select count(*) from public.orders
      where pickup_date > v_today and status in ('received', 'preparing', 'ready')),

    'week_revenue_cents', (
      select coalesce(sum(total_cents), 0) from public.sales_lines
      where sale_date between v_week_start and v_today),

    'week_spending_cents', (
      select coalesce(sum(total_cents), 0) from public.expenses
      where purchased_on between v_week_start and v_today),

    'last_week_revenue_cents', (
      select coalesce(sum(total_cents), 0) from public.sales_lines
      where sale_date between v_week_start - 7 and v_week_start - 1),

    'last_week_spending_cents', (
      select coalesce(sum(total_cents), 0) from public.expenses
      where purchased_on between v_week_start - 7 and v_week_start - 1),

    'last_import_at', (
      select max(created_at) from public.sales_imports where undone_at is null),

    'last_sale_date', (
      select max(sale_date) from public.sales_lines),

    'unmatched_sales_lines', (
      select count(*) from public.sales_lines where product_id is null),

    -- Products at or below their reorder point, most urgent first.
    'low_stock', coalesce((
      select jsonb_agg(row_to_json(t) order by t.stock - t.reorder_point, t.name)
      from (
        select p.id, p.name, p.emoji, p.stock, p.reorder_point,
               coalesce(r.reserved, 0) as reserved
        from public.products p
        left join public.product_reserved r on r.product_id = p.id
        where not p.archived and p.stock - coalesce(r.reserved, 0) <= p.reorder_point
      ) t), '[]'::jsonb),

    -- Perishable batches expiring in the next 3 days (may already be sold).
    'expiring_soon', (
      select count(*) from public.product_batches b
      join public.products p on p.id = b.product_id
      where not p.archived and p.stock > 0
        and b.expires_on between v_today and v_today + 3)
  ) into v_result;

  return v_result;
end;
$$;

revoke execute on function public.dashboard_summary() from public, anon;
grant execute on function public.dashboard_summary() to authenticated;
