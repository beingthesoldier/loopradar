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
