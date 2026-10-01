-- Run this migration after supabase-schema.sql has already succeeded.
create table if not exists public.focus_state (
  user_id uuid primary key references auth.users(id) on delete cascade,
  state jsonb not null default '{}'::jsonb,
  updated_at timestamptz not null default now()
);

alter table public.focus_state enable row level security;

create policy "Users manage their focus state" on public.focus_state
  for all using (auth.uid() = user_id)
  with check (auth.uid() = user_id);
