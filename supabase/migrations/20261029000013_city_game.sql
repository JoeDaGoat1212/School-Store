-- =============================================================================
-- The 3D city game (update 13)
-- =============================================================================
-- The 3D store's city is a game: pretend US-dollar money, jobs, cars, houses.
-- This saves it to each signed-in player's account, and lets staff hire
-- players for the in-game jobs.
--
--   game_players            one row per player: their in-game ID card number,
--                           the name on it, and their saved game (money,
--                           cars, houses, job progress) as JSON.
--   game_job_applications   a player's résumé for a job at one of the city's
--                           shops (Slice Society, Polar Scoops…). Staff
--                           hire or decline them in Admin → City jobs.
--
--   get_game_player()       the signed-in player's saved game (made the first
--                           time they play), with their job applications.
--   save_game_state()       saves their game.
--   apply_for_job()         sends a résumé.
--   leave_job()             quitting, or getting fired in the game (too many
--                           customers walked out).
--   record_job_level()      a promotion in the game.
--
-- None of this is real money: it can't be spent in the store.
-- =============================================================================

create table public.game_players (
  id            uuid primary key references auth.users (id) on delete cascade,
  id_number     text not null unique,
  display_name  text not null check (char_length(display_name) between 1 and 60),
  state         jsonb not null default '{}'::jsonb,
  created_at    timestamptz not null default now(),
  updated_at    timestamptz not null default now()
);

create table public.game_job_applications (
  id            uuid primary key default gen_random_uuid(),
  player_id     uuid not null references public.game_players (id) on delete cascade,
  business      text not null check (business in ('pizza', 'icecream', 'coffee', 'burger', 'flowers')),
  answers       jsonb not null,
  status        text not null default 'pending' check (status in ('pending', 'hired', 'declined', 'fired', 'quit')),
  level         int not null default 0 check (level between 0 and 10),
  staff_note    text check (char_length(staff_note) <= 200),
  decided_at    timestamptz,
  decided_by    uuid references auth.users (id) on delete set null,
  created_at    timestamptz not null default now(),
  updated_at    timestamptz not null default now()
);
create index on public.game_job_applications (status, created_at desc);
create index on public.game_job_applications (player_id);
-- One open application (or job) per player per shop.
create unique index game_job_one_open on public.game_job_applications (player_id, business)
  where status in ('pending', 'hired');

-- The name to put on someone's ID: their rewards name, else teacher name, else their email.
create or replace function public.game_display_name(p_user uuid)
returns text
language sql stable security definer
set search_path = public
as $$
  select coalesce(
    (select first_name || ' ' || last_name from public.customers where id = p_user),
    (select first_name || ' ' || last_name from public.teachers where id = p_user),
    (select split_part(email, '@', 1) from auth.users where id = p_user),
    'Player');
$$;

-- The signed-in player's game (made the first time). Staff logins can't play for keeps.
create or replace function public.get_game_player()
returns jsonb
language plpgsql security definer
set search_path = public
as $$
declare
  v_id   uuid := auth.uid();
  v_row  public.game_players;
  v_num  text;
begin
  if v_id is null or public.is_admin() then
    return null;
  end if;
  select * into v_row from public.game_players where id = v_id;
  if not found then
    -- A new ID number like "CTY-482-1937" (tried until it's not taken).
    loop
      v_num := 'CTY-' || lpad((floor(random() * 1000))::int::text, 3, '0') || '-' || lpad((floor(random() * 10000))::int::text, 4, '0');
      exit when not exists (select 1 from public.game_players where id_number = v_num);
    end loop;
    insert into public.game_players (id, id_number, display_name)
    values (v_id, v_num, left(public.game_display_name(v_id), 60))
    returning * into v_row;
  else
    -- Keep the name on the ID up to date with their account.
    update public.game_players set display_name = left(public.game_display_name(v_id), 60)
     where id = v_id and display_name <> left(public.game_display_name(v_id), 60)
    returning * into v_row;
    if not found then
      select * into v_row from public.game_players where id = v_id;
    end if;
  end if;
  return jsonb_build_object(
    'id_number', v_row.id_number,
    'name', v_row.display_name,
    'since', v_row.created_at,
    'state', v_row.state,
    'applications', coalesce((
      select jsonb_agg(jsonb_build_object('id', a.id, 'business', a.business, 'status', a.status, 'level', a.level,
                                          'note', a.staff_note, 'created_at', a.created_at, 'decided_at', a.decided_at)
                       order by a.created_at desc)
      from public.game_job_applications a where a.player_id = v_id), '[]'::jsonb));
end;
$$;

-- Save the game (money, cars, houses, job progress). Kept small.
create or replace function public.save_game_state(p_state jsonb)
returns void
language plpgsql security definer
set search_path = public
as $$
begin
  if auth.uid() is null then
    raise exception 'SIGN_IN_NEEDED' using hint = 'Sign in to save your game.';
  end if;
  if p_state is null or jsonb_typeof(p_state) <> 'object' or pg_column_size(p_state) > 32000 then
    raise exception 'BAD_SAVE' using hint = 'That save is too big.';
  end if;
  update public.game_players set state = p_state, updated_at = now() where id = auth.uid();
end;
$$;

-- Send a résumé.
create or replace function public.apply_for_job(p_business text, p_answers jsonb)
returns void
language plpgsql security definer
set search_path = public
as $$
begin
  if auth.uid() is null then
    raise exception 'SIGN_IN_NEEDED' using hint = 'Sign in to apply for a job.';
  end if;
  if not exists (select 1 from public.game_players where id = auth.uid()) then
    raise exception 'NO_PLAYER' using hint = 'Open the 3D city first.';
  end if;
  if p_business not in ('pizza', 'icecream', 'coffee', 'burger', 'flowers') then
    raise exception 'BAD_JOB' using hint = 'That shop isn''t hiring.';
  end if;
  if p_answers is null or jsonb_typeof(p_answers) <> 'object' or pg_column_size(p_answers) > 4000 then
    raise exception 'BAD_RESUME' using hint = 'Please fill in the résumé.';
  end if;
  if exists (select 1 from public.game_job_applications where player_id = auth.uid() and business = p_business and status in ('pending', 'hired')) then
    raise exception 'ALREADY' using hint = 'You''ve already applied here.';
  end if;
  insert into public.game_job_applications (player_id, business, answers) values (auth.uid(), p_business, p_answers);
end;
$$;

-- Quitting, or being fired by the game.
create or replace function public.leave_job(p_business text, p_reason text)
returns void
language plpgsql security definer
set search_path = public
as $$
begin
  update public.game_job_applications
     set status = case when p_reason = 'fired' then 'fired' else 'quit' end,
         staff_note = case when p_reason = 'fired' then 'Too many customers walked out.' else staff_note end,
         updated_at = now()
   where player_id = auth.uid() and business = p_business and status = 'hired';
end;
$$;

-- A promotion (the game decides when you've earned one).
create or replace function public.record_job_level(p_business text, p_level int)
returns void
language plpgsql security definer
set search_path = public
as $$
begin
  update public.game_job_applications set level = greatest(0, least(coalesce(p_level, 0), 10)), updated_at = now()
   where player_id = auth.uid() and business = p_business and status = 'hired';
end;
$$;

-- Security: staff see and change everything; players only through the functions above.
alter table public.game_players          enable row level security;
alter table public.game_job_applications enable row level security;
create policy "admin full access" on public.game_players for all to authenticated
  using (public.is_admin()) with check (public.is_admin());
create policy "admin full access" on public.game_job_applications for all to authenticated
  using (public.is_admin()) with check (public.is_admin());

revoke execute on function public.game_display_name(uuid) from public, anon, authenticated;
revoke execute on function public.get_game_player() from public, anon;
revoke execute on function public.save_game_state(jsonb) from public, anon;
revoke execute on function public.apply_for_job(text, jsonb) from public, anon;
revoke execute on function public.leave_job(text, text) from public, anon;
revoke execute on function public.record_job_level(text, int) from public, anon;
grant execute on function public.get_game_player() to authenticated;
grant execute on function public.save_game_state(jsonb) to authenticated;
grant execute on function public.apply_for_job(text, jsonb) to authenticated;
grant execute on function public.leave_job(text, text) to authenticated;
grant execute on function public.record_job_level(text, int) to authenticated;
