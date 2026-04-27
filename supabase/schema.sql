create table if not exists public.budget_transactions (
  id uuid primary key default gen_random_uuid(),
  created_at timestamptz not null default now(),
  title text not null,
  amount numeric(12,2) not null check (amount >= 0),
  type text not null check (type in ('income', 'expense')),
  category text not null,
  transaction_date date not null,
  note text
);

alter table public.budget_transactions enable row level security;

-- Pro jednoduché osobní použití bez loginu.
-- Pokud přidáme přihlašování, tyto policy upravíme na auth.uid().
drop policy if exists "Allow anon read" on public.budget_transactions;
drop policy if exists "Allow anon insert" on public.budget_transactions;
drop policy if exists "Allow anon update" on public.budget_transactions;
drop policy if exists "Allow anon delete" on public.budget_transactions;

create policy "Allow anon read"
on public.budget_transactions for select
to anon
using (true);

create policy "Allow anon insert"
on public.budget_transactions for insert
to anon
with check (true);

create policy "Allow anon update"
on public.budget_transactions for update
to anon
using (true)
with check (true);

create policy "Allow anon delete"
on public.budget_transactions for delete
to anon
using (true);

create index if not exists budget_transactions_date_idx
on public.budget_transactions(transaction_date desc);

create index if not exists budget_transactions_type_idx
on public.budget_transactions(type);
