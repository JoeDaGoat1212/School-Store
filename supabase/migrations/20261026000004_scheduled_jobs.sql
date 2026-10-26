-- =============================================================================
-- School Store — scheduled jobs (pg_cron)
-- =============================================================================
-- pg_cron runs SQL on a schedule inside the database. It's included free with
-- Supabase. Times are in UTC. Arizona is always UTC−7 (no daylight saving),
-- so 06:00 UTC = 11:00 PM in Arizona.
--
-- To see the jobs:   select * from cron.job;
-- To see past runs:  select * from cron.job_run_details order by start_time desc;
-- =============================================================================

do $$
begin
  if exists (select 1 from pg_available_extensions where name = 'pg_cron') then
    create extension if not exists pg_cron;

    -- Every night at 11:00 PM Arizona: close orders nobody picked up.
    perform cron.schedule(
      'expire-uncollected-orders',
      '0 6 * * *',
      'select public.expire_uncollected_orders();'
    );

    -- Every night at 11:30 PM Arizona: delete orders past the retention period.
    perform cron.schedule(
      'delete-old-orders',
      '30 6 * * *',
      'select public.delete_old_orders();'
    );
  else
    raise notice 'pg_cron is not available here; skipping scheduled jobs.';
  end if;
end $$;
