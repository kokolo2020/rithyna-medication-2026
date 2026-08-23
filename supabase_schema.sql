-- Run this once in Supabase SQL Editor.

create table if not exists public.medication_entries (
  id text primary key,
  user_id uuid not null references auth.users(id) on delete cascade,
  entry_timestamp timestamptz not null,
  entry_date date not null,
  time text not null,
  medications jsonb not null default '[]'::jsonb,
  temp numeric,
  temp_unit text not null default '°C',
  note text not null default '',
  updated_at timestamptz not null default now(),
  deleted boolean not null default false
);

create index if not exists medication_entries_user_time_idx
  on public.medication_entries(user_id, entry_timestamp desc);

alter table public.medication_entries enable row level security;

drop policy if exists "Users can view own medication entries" on public.medication_entries;
create policy "Users can view own medication entries"
on public.medication_entries for select
using (auth.uid() = user_id);

drop policy if exists "Users can insert own medication entries" on public.medication_entries;
create policy "Users can insert own medication entries"
on public.medication_entries for insert
with check (auth.uid() = user_id);

drop policy if exists "Users can update own medication entries" on public.medication_entries;
create policy "Users can update own medication entries"
on public.medication_entries for update
using (auth.uid() = user_id)
with check (auth.uid() = user_id);

drop policy if exists "Users can delete own medication entries" on public.medication_entries;
create policy "Users can delete own medication entries"
on public.medication_entries for delete
using (auth.uid() = user_id);