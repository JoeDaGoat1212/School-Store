-- =============================================================================
-- Team tools (update 20): messages, restock photos, absences, daily tasks and
-- notifications.
-- =============================================================================
-- Everything here is read and written by the website's server (which checks
-- who's asking: the admin login, or an employee's sign-in token from update
-- 16), so the tables only need the usual "admin full access" policy.
--
--   Messages      chat_threads / chat_members / chat_messages. One "Everyone"
--                 chat for the whole team, one-on-one chats, and named group
--                 chats. A member is a staff id, or 'admin' for the manager.
--   Restocking    After each shift the employee photographs each area
--                 (settings.restock_areas: Fridge, Snacks, Ramen, Chips) fully
--                 stocked. restock_checks + restock_photos; the photos live in
--                 the private "restock" storage, seen only by the admin.
--   Absences      staff_absences: "I can't make my 5th hour on Thursday."
--   Tasks         staff_tasks: one-off (a date), weekly (a weekday) or every
--                 day; for everyone or one person. staff_task_done: who
--                 checked what off, which day.
--   Notifications push_subscriptions (web push from the browser / home-screen
--                 app), app_secrets (keys the server makes for itself), and a
--                 job every 5 minutes that asks the website to send clock-in
--                 reminders.
-- =============================================================================

-- ---------------------------------------------------------------- messages
create table public.chat_threads (
  id               uuid primary key default gen_random_uuid(),
  kind             text not null check (kind in ('everyone', 'direct', 'group')),
  name             text check (name is null or char_length(name) between 1 and 40),
  direct_key       text unique,              -- the two members, sorted, for one-on-one chats
  created_by       text,
  created_at       timestamptz not null default now(),
  last_message_at  timestamptz not null default now()
);
create unique index chat_threads_one_everyone on public.chat_threads (kind) where kind = 'everyone';
insert into public.chat_threads (kind, name) values ('everyone', 'Everyone');

create table public.chat_members (
  thread_id     uuid not null references public.chat_threads (id) on delete cascade,
  member        text not null check (member = 'admin' or member ~ '^[0-9a-f-]{36}$'),
  last_read_at  timestamptz not null default now(),
  primary key (thread_id, member)
);
create index on public.chat_members (member);

create table public.chat_messages (
  id           uuid primary key default gen_random_uuid(),
  thread_id    uuid not null references public.chat_threads (id) on delete cascade,
  sender       text not null,
  sender_name  text not null check (char_length(sender_name) between 1 and 40),
  body         text not null check (char_length(body) between 1 and 1000),
  created_at   timestamptz not null default now()
);
create index on public.chat_messages (thread_id, created_at desc);

-- ---------------------------------------------------------------- restocking
alter table public.settings
  add column restock_areas text[] not null default array['Fridge', 'Snacks', 'Ramen', 'Chips']
    check (cardinality(restock_areas) between 1 and 10);

create table public.restock_checks (
  id            uuid primary key default gen_random_uuid(),
  staff_id      uuid references public.staff (id) on delete set null,
  staff_name    text not null,
  shift_id      uuid references public.staff_shifts (id) on delete set null,
  token_hash    text,                        -- lets the tablet or phone add photos for a while
  areas         text[] not null,
  skipped_note  text check (skipped_note is null or char_length(skipped_note) <= 200),
  completed_at  timestamptz,
  reviewed      boolean not null default false,
  created_at    timestamptz not null default now()
);
create unique index restock_checks_one_per_shift on public.restock_checks (shift_id) where shift_id is not null;
create index on public.restock_checks (created_at desc);

create table public.restock_photos (
  id          uuid primary key default gen_random_uuid(),
  check_id    uuid not null references public.restock_checks (id) on delete cascade,
  area        text not null check (char_length(area) between 1 and 40),
  path        text not null unique,          -- inside the private "restock" bucket
  created_at  timestamptz not null default now(),
  unique (check_id, area)
);

insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values ('restock', 'restock', false, 8388608, array['image/jpeg', 'image/png', 'image/webp'])
on conflict (id) do nothing;
create policy "admin manages restock photos" on storage.objects
  for all to authenticated
  using (bucket_id = 'restock' and public.is_admin())
  with check (bucket_id = 'restock' and public.is_admin());

-- ---------------------------------------------------------------- absences
create table public.staff_absences (
  id          uuid primary key default gen_random_uuid(),
  staff_id    uuid not null references public.staff (id) on delete cascade,
  work_date   date not null,
  window_id   int references public.pickup_windows (id) on delete cascade,   -- null = the whole day
  reason      text check (reason is null or char_length(reason) <= 200),
  seen        boolean not null default false,
  created_at  timestamptz not null default now()
);
create unique index staff_absences_once on public.staff_absences (staff_id, work_date, coalesce(window_id, 0));
create index on public.staff_absences (work_date);

-- ---------------------------------------------------------------- tasks
create table public.staff_tasks (
  id          uuid primary key default gen_random_uuid(),
  title       text not null check (char_length(title) between 1 and 120),
  details     text check (details is null or char_length(details) <= 300),
  task_date   date,                          -- one day only
  weekday     int check (weekday between 0 and 6),   -- every week on this day (0 = Sunday)
  staff_id    uuid references public.staff (id) on delete cascade,   -- null = everyone working
  sort        int not null default 0,
  created_at  timestamptz not null default now(),
  check (task_date is null or weekday is null)
);
create index on public.staff_tasks (task_date);

create table public.staff_task_done (
  task_id    uuid not null references public.staff_tasks (id) on delete cascade,
  work_date  date not null,
  staff_id   uuid not null references public.staff (id) on delete cascade,
  done_at    timestamptz not null default now(),
  primary key (task_id, work_date, staff_id)
);

-- ---------------------------------------------------------------- notifications
create table public.push_subscriptions (
  id          uuid primary key default gen_random_uuid(),
  member      text not null check (member = 'admin' or member ~ '^[0-9a-f-]{36}$'),
  endpoint    text not null unique check (char_length(endpoint) <= 1000),
  p256dh      text not null,
  auth        text not null,
  created_at  timestamptz not null default now()
);
create index on public.push_subscriptions (member);

create table public.staff_reminders_sent (
  staff_id   uuid not null references public.staff (id) on delete cascade,
  work_date  date not null,
  window_id  int not null,
  sent_at    timestamptz not null default now(),
  primary key (staff_id, work_date, window_id)
);

-- Keys the website makes for itself (web push keys) and the reminder job's
-- password. No policies: only the website's server can read them.
create table public.app_secrets (
  key    text primary key,
  value  text not null
);
insert into public.app_secrets (key, value) values
  ('cron_secret', replace(gen_random_uuid()::text, '-', '') || replace(gen_random_uuid()::text, '-', '')),
  ('site_url', 'https://school-store-steel.vercel.app');

-- ---------------------------------------------------------------- access
alter table public.chat_threads         enable row level security;
alter table public.chat_members         enable row level security;
alter table public.chat_messages        enable row level security;
alter table public.restock_checks       enable row level security;
alter table public.restock_photos       enable row level security;
alter table public.staff_absences       enable row level security;
alter table public.staff_tasks          enable row level security;
alter table public.staff_task_done      enable row level security;
alter table public.push_subscriptions   enable row level security;
alter table public.staff_reminders_sent enable row level security;
alter table public.app_secrets          enable row level security;

create policy "admin full access" on public.chat_threads    for all to authenticated using (public.is_admin()) with check (public.is_admin());
create policy "admin full access" on public.chat_members    for all to authenticated using (public.is_admin()) with check (public.is_admin());
create policy "admin full access" on public.chat_messages   for all to authenticated using (public.is_admin()) with check (public.is_admin());
create policy "admin full access" on public.restock_checks  for all to authenticated using (public.is_admin()) with check (public.is_admin());
create policy "admin full access" on public.restock_photos  for all to authenticated using (public.is_admin()) with check (public.is_admin());
create policy "admin full access" on public.staff_absences  for all to authenticated using (public.is_admin()) with check (public.is_admin());
create policy "admin full access" on public.staff_tasks     for all to authenticated using (public.is_admin()) with check (public.is_admin());
create policy "admin full access" on public.staff_task_done for all to authenticated using (public.is_admin()) with check (public.is_admin());

-- The website's server looks up who an employee's sign-in token belongs to.
grant execute on function public.staff_portal_staff(text) to service_role;

-- ---------------------------------------------------------------- reminder job
-- Every 5 minutes, ask the website to send "time to clock in" reminders. Uses
-- Supabase's pg_net (to call a web address) and pg_cron; skipped quietly where
-- they aren't available.
do $$
begin
  if exists (select 1 from pg_available_extensions where name = 'pg_net') and exists (select 1 from pg_extension where extname = 'pg_cron') then
    create extension if not exists pg_net;
    perform cron.schedule(
      'staff-reminders',
      '*/5 * * * *',
      $job$
        select net.http_post(
          url := (select value from public.app_secrets where key = 'site_url') || '/api/cron/remind',
          headers := jsonb_build_object('Content-Type', 'application/json',
                                        'x-cron-secret', (select value from public.app_secrets where key = 'cron_secret')),
          body := '{}'::jsonb
        )
      $job$
    );
  end if;
end;
$$;
