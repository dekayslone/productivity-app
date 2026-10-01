-- Focus app schema for Supabase.
-- Run this in Supabase Dashboard > SQL Editor.

create extension if not exists pgcrypto;

create table if not exists public.goals (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  title text not null,
  category text not null default 'Other',
  month date not null,
  priority integer,
  created_at timestamptz not null default now()
);

create table if not exists public.projects (
  id uuid primary key default gen_random_uuid(),
  goal_id uuid not null references public.goals(id) on delete cascade,
  title text not null,
  created_at timestamptz not null default now()
);

create table if not exists public.tasks (
  id uuid primary key default gen_random_uuid(),
  project_id uuid not null references public.projects(id) on delete cascade,
  title text not null,
  category text,
  group_name text,
  due_date date,
  is_milestone boolean not null default false,
  is_done boolean not null default false,
  done_on date,
  created_at timestamptz not null default now()
);

create table if not exists public.subtasks (
  id uuid primary key default gen_random_uuid(),
  task_id uuid not null references public.tasks(id) on delete cascade,
  title text not null,
  is_done boolean not null default false,
  created_at timestamptz not null default now()
);

create table if not exists public.habits (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  name text not null,
  category text not null default 'Other',
  target numeric not null default 1,
  unit text,
  kind text not null default 'daily',
  priority integer,
  month_target numeric,
  created_at timestamptz not null default now()
);

create table if not exists public.habit_logs (
  id uuid primary key default gen_random_uuid(),
  habit_id uuid not null references public.habits(id) on delete cascade,
  log_date date not null,
  value numeric not null default 1,
  created_at timestamptz not null default now(),
  unique (habit_id, log_date)
);

create table if not exists public.reviews (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  review_type text not null check (review_type in ('week', 'month')),
  review_date date not null,
  wins text not null,
  obstacles text,
  next_focus text,
  automatic_summary text,
  created_at timestamptz not null default now()
);

-- Cloud snapshot used by the current browser app model.
create table if not exists public.focus_state (
  user_id uuid primary key references auth.users(id) on delete cascade,
  state jsonb not null default '{}'::jsonb,
  updated_at timestamptz not null default now()
);

alter table public.goals enable row level security;
alter table public.projects enable row level security;
alter table public.tasks enable row level security;
alter table public.subtasks enable row level security;
alter table public.habits enable row level security;
alter table public.habit_logs enable row level security;
alter table public.reviews enable row level security;
alter table public.focus_state enable row level security;

create policy "Users manage their goals" on public.goals
  for all using (auth.uid() = user_id) with check (auth.uid() = user_id);

create policy "Users manage their projects" on public.projects
  for all using (exists (select 1 from public.goals g where g.id = goal_id and g.user_id = auth.uid()))
  with check (exists (select 1 from public.goals g where g.id = goal_id and g.user_id = auth.uid()));

create policy "Users manage their tasks" on public.tasks
  for all using (exists (select 1 from public.projects p join public.goals g on g.id = p.goal_id where p.id = project_id and g.user_id = auth.uid()))
  with check (exists (select 1 from public.projects p join public.goals g on g.id = p.goal_id where p.id = project_id and g.user_id = auth.uid()));

create policy "Users manage their subtasks" on public.subtasks
  for all using (exists (select 1 from public.tasks t join public.projects p on p.id = t.project_id join public.goals g on g.id = p.goal_id where t.id = task_id and g.user_id = auth.uid()))
  with check (exists (select 1 from public.tasks t join public.projects p on p.id = t.project_id join public.goals g on g.id = p.goal_id where t.id = task_id and g.user_id = auth.uid()));

create policy "Users manage their habits" on public.habits
  for all using (auth.uid() = user_id) with check (auth.uid() = user_id);

create policy "Users manage their habit logs" on public.habit_logs
  for all using (exists (select 1 from public.habits h where h.id = habit_id and h.user_id = auth.uid()))
  with check (exists (select 1 from public.habits h where h.id = habit_id and h.user_id = auth.uid()));

create policy "Users manage their reviews" on public.reviews
  for all using (auth.uid() = user_id) with check (auth.uid() = user_id);

create policy "Users manage their focus state" on public.focus_state
  for all using (auth.uid() = user_id) with check (auth.uid() = user_id);
