-- =============================================================================
-- Rewards accounts get a username (and sign in with a password)
-- =============================================================================
-- Students now sign up with a username, email and password, and sign back in
-- with their username (or email) and password. The email is still used to
-- confirm the account and to reset a forgotten password.
--
--   customers.username      how they sign in; shown on their account page
--   username_available()    "is this name free?" (asked while signing up)
--   save_profile(…, username)  now also sets the username
--   get_my_account()        now also returns the username
--
-- Accounts made before this have no username yet; their account page asks
-- them to pick one (and a password) the next time they sign in.
-- =============================================================================

alter table public.customers
  add column username text
    check (username ~ '^[A-Za-z0-9_.]{3,20}$'),
  -- The same name in any capitals counts as taken ("Joey" = "joey").
  add column username_key text generated always as (lower(username)) stored;

create unique index customers_username_key on public.customers (username_key);

-- Is a username free? (Yes/no only: it never shows who has it.)
create or replace function public.username_available(p_username text)
returns boolean
language sql stable security definer
set search_path = public
as $$
  select btrim(coalesce(p_username, '')) ~ '^[A-Za-z0-9_.]{3,20}$'
     and not exists (select 1 from public.customers where username_key = lower(btrim(p_username)) and id is distinct from auth.uid());
$$;

-- save_profile gets a username. The old 3-part version is replaced.
drop function if exists public.save_profile(text, text, text);

create or replace function public.save_profile(p_first_name text, p_last_name text, p_grade text, p_username text default null)
returns void
language plpgsql security definer
set search_path = public
as $$
declare
  v_first text := btrim(coalesce(p_first_name, ''));
  v_last  text := btrim(coalesce(p_last_name, ''));
  v_grade text := btrim(coalesce(p_grade, ''));
  v_user  text := nullif(btrim(coalesce(p_username, '')), '');
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
  if v_user is not null and v_user !~ '^[A-Za-z0-9_.]{3,20}$' then
    raise exception 'BAD_USERNAME' using hint = 'Usernames are 3 to 20 letters, numbers, dots or underscores.';
  end if;
  if v_user is not null and exists (select 1 from public.customers where username_key = lower(v_user) and id <> auth.uid()) then
    raise exception 'USERNAME_TAKEN' using hint = 'That username is taken. Try another one.';
  end if;

  insert into public.customers (id, email, first_name, last_name, grade, username)
  values (auth.uid(), lower(v_email), v_first, v_last, v_grade, v_user)
  on conflict (id) do update
     set first_name = excluded.first_name, last_name = excluded.last_name,
         grade = excluded.grade, email = excluded.email,
         username = coalesce(excluded.username, public.customers.username), updated_at = now();
end;
$$;

-- get_my_account: the same as before, plus the username.
create or replace function public.get_my_account()
returns jsonb
language sql stable security definer
set search_path = public
as $$
  select case when auth.uid() is null then null else jsonb_build_object(
    'email', auth.jwt()->>'email',
    'staff', public.is_admin(),
    'profile', (select jsonb_build_object('first_name', c.first_name, 'last_name', c.last_name,
                                          'grade', c.grade, 'created_at', c.created_at, 'username', c.username)
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

revoke all on function public.username_available(text) from public;
grant execute on function public.username_available(text) to anon, authenticated;
revoke all on function public.save_profile(text, text, text, text) from public, anon;
grant execute on function public.save_profile(text, text, text, text) to authenticated;
