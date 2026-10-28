-- Run this once in Supabase Dashboard > SQL Editor to enable in-app feedback submissions.
create extension if not exists pgcrypto;

create table if not exists public.user_feedback (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  experience_rating smallint not null check (experience_rating between 1 and 5),
  what_works text not null default '',
  friction text not null default '',
  improvements text not null,
  recommendation_score smallint check (recommendation_score between 0 and 10),
  created_at timestamptz not null default now()
);

alter table public.user_feedback enable row level security;

drop policy if exists "Authenticated users can submit feedback" on public.user_feedback;
create policy "Authenticated users can submit feedback" on public.user_feedback
  for insert to authenticated
  with check (auth.uid() = user_id);

revoke all on public.user_feedback from anon, authenticated;
grant insert on public.user_feedback to authenticated;
