-- =============================================================================
-- Receipt photos from the store (update 19)
-- =============================================================================
-- While shopping, the teacher taps "Snap receipt" on the Shopping list and
-- takes a picture of the receipt. The photo goes into the private "receipts"
-- storage (the same place expense receipts already live) and a row here, so it
-- shows up under Expenses → "Receipts to enter". "Make expense" opens the
-- shopping-trip form with the photo attached; saving the trip links them.
-- =============================================================================

create table public.receipt_inbox (
  id           uuid primary key default gen_random_uuid(),
  path         text not null unique,                -- inside the private "receipts" bucket
  store        text check (store is null or char_length(store) <= 60),
  total_cents  int  check (total_cents is null or total_cents between 0 and 10000000),
  shopper      text check (shopper is null or char_length(shopper) <= 60),
  note         text check (note is null or char_length(note) <= 200),
  shopped_on   date not null default public.store_today(),
  expense_id   uuid references public.expenses (id) on delete set null,
  dismissed    boolean not null default false,
  created_at   timestamptz not null default now()
);
create index on public.receipt_inbox (created_at desc);

alter table public.receipt_inbox enable row level security;
create policy "admin full access" on public.receipt_inbox for all to authenticated using (public.is_admin()) with check (public.is_admin());
