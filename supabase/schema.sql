-- kristudio accounts. Run once in Supabase: SQL Editor → New query → paste → Run.
-- Every table has row-level security on: a visitor can only ever see and change their own rows,
-- and nobody can give themselves paid access from the browser (only the server, with the secret key, can).

-- one row per account, made automatically when someone signs up
create table if not exists public.profiles (
  id uuid primary key references auth.users on delete cascade,
  email text,
  access text not null default 'free' check (access in ('free', 'paid')),
  created_at timestamptz not null default now()
);
alter table public.profiles enable row level security;
drop policy if exists "read own profile" on public.profiles;
create policy "read own profile" on public.profiles for select using (auth.uid() = id);
-- no insert / update policies on purpose: the trigger below creates the row, the payment handler sets access

create or replace function public.handle_new_user() returns trigger
language plpgsql security definer set search_path = public as $$
begin
  insert into public.profiles (id, email) values (new.id, new.email) on conflict (id) do nothing;
  return new;
end; $$;
drop trigger if exists on_auth_user_created on auth.users;
create trigger on_auth_user_created after insert on auth.users for each row execute function public.handle_new_user();

-- purchases: written by the payment handler (server side), readable by their owner
create table if not exists public.purchases (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users on delete cascade,
  product text not null,                       -- e.g. 'full-access'
  provider text,                               -- e.g. 'robokassa'
  provider_ref text unique,                    -- the provider's payment id, so a payment is never counted twice
  amount numeric(10, 2),
  currency text,
  status text not null default 'pending' check (status in ('pending', 'paid', 'refunded', 'failed')),
  created_at timestamptz not null default now()
);
alter table public.purchases enable row level security;
drop policy if exists "read own purchases" on public.purchases;
create policy "read own purchases" on public.purchases for select using (auth.uid() = user_id);

-- saved looks, synced across browsers
create table if not exists public.looks (
  user_id uuid not null references auth.users on delete cascade,
  name text not null check (char_length(name) between 1 and 24),
  data jsonb not null check (pg_column_size(data) < 20000),
  updated_at timestamptz not null default now(),
  primary key (user_id, name)
);
alter table public.looks enable row level security;
drop policy if exists "read own looks" on public.looks;
drop policy if exists "add own looks" on public.looks;
drop policy if exists "change own looks" on public.looks;
drop policy if exists "delete own looks" on public.looks;
create policy "read own looks" on public.looks for select using (auth.uid() = user_id);
create policy "add own looks" on public.looks for insert with check (auth.uid() = user_id);
create policy "change own looks" on public.looks for update using (auth.uid() = user_id) with check (auth.uid() = user_id);
create policy "delete own looks" on public.looks for delete using (auth.uid() = user_id);

-- ---------------------------------------------------------------------------------------------------------------
-- One-month subscription paid by hand through Robokassa (applied 28 Oct 2026). The account keeps the date its
-- access ends; the payment handler (supabase/functions/robokassa-result) calls grant_month once a payment is in.
alter table public.profiles add column if not exists paid_until timestamptz;

-- Robokassa's invoice number (InvId) is a whole number up to 2^31-1, given out here
create sequence if not exists public.purchase_inv_seq start 1001;
alter table public.purchases add column if not exists inv_id integer unique default nextval('public.purchase_inv_seq');
alter sequence public.purchase_inv_seq owned by public.purchases.inv_id;
alter table public.purchases add column if not exists paid_at timestamptz;
alter table public.purchases add column if not exists period_end timestamptz;

-- marks the purchase paid and adds one month to the account, from now or from the end of the time left;
-- safe to call twice for the same invoice
create or replace function public.grant_month(p_inv integer, p_amount numeric)
returns timestamptz
language plpgsql security definer set search_path = public as $$
declare
  pur public.purchases%rowtype;
  until timestamptz;
begin
  select * into pur from public.purchases where inv_id = p_inv for update;
  if not found then raise exception 'no purchase %', p_inv; end if;
  if pur.status = 'paid' then return pur.period_end; end if;
  if p_amount < pur.amount then raise exception 'amount % is less than %', p_amount, pur.amount; end if;
  update public.profiles
     set paid_until = greatest(coalesce(paid_until, now()), now()) + interval '1 month'
   where id = pur.user_id
   returning paid_until into until;
  update public.purchases
     set status = 'paid', paid_at = now(), period_end = until, provider_ref = 'robokassa:' || p_inv
   where id = pur.id;
  return until;
end; $$;
revoke all on function public.grant_month(integer, numeric) from public, anon, authenticated;
grant execute on function public.grant_month(integer, numeric) to service_role;

-- the sign-up trigger function is only for the trigger, not for calling over the API
revoke execute on function public.handle_new_user() from public, anon, authenticated;
