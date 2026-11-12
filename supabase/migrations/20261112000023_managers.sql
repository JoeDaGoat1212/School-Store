-- =============================================================================
-- School Store — update 23: manager accounts
-- =============================================================================
-- The store can now have more than one admin login:
--   - the owner (the account made with `npm run create-admin`), and
--   - managers (like Matthew and Dylan), who sign in with their name and
--     their own password and can use everything in the dashboard except
--     adding or removing managers.
-- Every admin row gets a name and a role. Existing rows are the owner.
-- =============================================================================

alter table public.admins
  add column if not exists name text,
  add column if not exists role text not null default 'owner' check (role in ('owner', 'manager'));

-- Two managers can't share a name (it's what they type to sign in).
create unique index if not exists admins_name_unique on public.admins (lower(name)) where name is not null;
