-- =============================================================================
-- Lock the store tablet on the time clock (update 18)
-- =============================================================================
-- The store's tablet runs the time clock all day. On the dashboard the
-- manager taps "Lock tablet on time clock": that signs the manager out on the
-- tablet, remembers the tablet, and opens the time clock. On the time clock,
-- "Manager" asks for the manager code (4–6 digits); the right code signs the
-- manager back in and opens the dashboard.
--
-- The code only works on a tablet the manager locked (a random token in the
-- tablet's cookie; only its hash is stored here), and 5 wrong codes in 15
-- minutes lock that tablet out of it for 15 minutes. Anywhere else, the admin
-- password is still the only way in.
-- =============================================================================

alter table public.settings
  add column kiosk_pin_salt text,
  add column kiosk_pin_hash text;

create table public.kiosk_devices (
  token_hash  text primary key,
  label       text not null default 'Store tablet' check (char_length(label) <= 40),
  created_at  timestamptz not null default now(),
  last_used   timestamptz
);
alter table public.kiosk_devices enable row level security;
create policy "admin full access" on public.kiosk_devices for all to authenticated using (public.is_admin()) with check (public.is_admin());

create table public.kiosk_unlock_attempts (
  token_hash  text not null,
  created_at  timestamptz not null default now()
);
create index on public.kiosk_unlock_attempts (token_hash, created_at);
alter table public.kiosk_unlock_attempts enable row level security;
-- No policies: only the functions below touch it.


-- The manager sets (or changes) the code. Returns nothing; raises on a bad code.
create or replace function public.kiosk_set_pin(p_pin text)
returns void
language plpgsql security definer
set search_path = public
as $$
declare
  v_salt text := replace(gen_random_uuid()::text, '-', '');
begin
  if not public.is_admin() then
    raise exception 'Only the manager can set the manager code.';
  end if;
  if coalesce(p_pin, '') !~ '^[0-9]{4,6}$' then
    raise exception 'The manager code must be 4 to 6 numbers.';
  end if;
  if exists (select 1 from public.staff where status <> 'removed' and pin = p_pin) then
    raise exception 'An employee already uses that number as their PIN. Pick a different code.';
  end if;
  update public.settings
     set kiosk_pin_salt = v_salt,
         kiosk_pin_hash = encode(sha256(convert_to(v_salt || p_pin, 'UTF8')), 'hex'),
         updated_at = now()
   where id = 1;
end;
$$;

-- Lock: remember this tablet (the website keeps the token in its cookie).
create or replace function public.kiosk_register(p_token_hash text)
returns void
language plpgsql security definer
set search_path = public
as $$
begin
  if not public.is_admin() then
    raise exception 'Only the manager can lock a tablet.';
  end if;
  if (select kiosk_pin_hash from public.settings where id = 1) is null then
    raise exception 'Set a manager code first.';
  end if;
  insert into public.kiosk_devices (token_hash) values (p_token_hash)
  on conflict (token_hash) do update set last_used = now();
end;
$$;

-- Is this a locked store tablet? (The time clock shows the manager keypad if so.)
create or replace function public.kiosk_is_locked(p_token_hash text)
returns boolean
language sql stable security definer
set search_path = public
as $$ select exists (select 1 from public.kiosk_devices where token_hash = p_token_hash) $$;

-- Unlock: the right code on a locked tablet. Returns { ok } or { error, code }.
-- The website then signs the manager in.
create or replace function public.kiosk_unlock(p_token_hash text, p_pin text)
returns jsonb
language plpgsql security definer
set search_path = public
as $$
declare
  v_salt text;
  v_hash text;
begin
  if not exists (select 1 from public.kiosk_devices where token_hash = p_token_hash) then
    return jsonb_build_object('error', 'This device isn''t a locked store tablet. Sign in with the admin password.', 'code', 'NOT_KIOSK');
  end if;
  if (select count(*) from public.kiosk_unlock_attempts
       where token_hash = p_token_hash and created_at > now() - interval '15 minutes') >= 5 then
    return jsonb_build_object('error', 'Too many wrong codes. Wait 15 minutes, or sign in with the admin password.', 'code', 'LOCKED');
  end if;
  select kiosk_pin_salt, kiosk_pin_hash into v_salt, v_hash from public.settings where id = 1;
  if v_hash is null or encode(sha256(convert_to(v_salt || coalesce(p_pin, ''), 'UTF8')), 'hex') <> v_hash then
    insert into public.kiosk_unlock_attempts (token_hash) values (p_token_hash);
    delete from public.kiosk_unlock_attempts where created_at < now() - interval '1 day';
    return jsonb_build_object('error', 'That isn''t the manager code.', 'code', 'WRONG');
  end if;
  delete from public.kiosk_unlock_attempts where token_hash = p_token_hash;
  update public.kiosk_devices set last_used = now() where token_hash = p_token_hash;
  return jsonb_build_object('ok', true);
end;
$$;

revoke execute on function public.kiosk_set_pin(text)        from public, anon;
revoke execute on function public.kiosk_register(text)       from public, anon;
revoke execute on function public.kiosk_is_locked(text)      from public, anon, authenticated;
revoke execute on function public.kiosk_unlock(text, text)   from public, anon, authenticated;
grant execute on function public.kiosk_set_pin(text)         to authenticated;
grant execute on function public.kiosk_register(text)        to authenticated;
grant execute on function public.kiosk_is_locked(text)       to service_role;
grant execute on function public.kiosk_unlock(text, text)    to service_role;
