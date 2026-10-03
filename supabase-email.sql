-- Email delivery support for the scheduled Focus email function.
create table if not exists public.email_delivery_log (
  user_id uuid not null references auth.users(id) on delete cascade,
  email_kind text not null check (email_kind in ('daily', 'weekly', 'monthly')),
  period_start date not null,
  delivered boolean not null default true,
  sent_at timestamptz not null default now(),
  primary key (user_id, email_kind, period_start)
);

alter table public.email_delivery_log
  add column if not exists delivered boolean not null default true;

alter table public.email_delivery_log enable row level security;

create table if not exists public.accountability_email_delivery_log (
  user_id uuid not null references auth.users(id) on delete cascade,
  recipient_key text not null,
  email_kind text not null check (email_kind in ('daily', 'weekly', 'monthly')),
  period_start date not null,
  delivered boolean not null default false,
  sent_at timestamptz not null default now(),
  primary key (user_id, recipient_key, email_kind, period_start)
);

alter table public.accountability_email_delivery_log enable row level security;

create or replace function public.get_focus_email_subscribers()
returns table (user_id uuid, email text, state jsonb)
language sql
stable
security definer
set search_path = ''
as $$
  select u.id, u.email::text, fs.state
  from auth.users as u
  join public.focus_state as fs on fs.user_id = u.id
  where u.email is not null
    and u.email_confirmed_at is not null;
$$;

create or replace function public.claim_focus_email_delivery(
  p_user_id uuid,
  p_email_kind text,
  p_period_start date
)
returns boolean
language plpgsql
security definer
set search_path = ''
as $$
begin
  insert into public.email_delivery_log (user_id, email_kind, period_start, delivered)
  values (p_user_id, p_email_kind, p_period_start, false)
  on conflict (user_id, email_kind, period_start) do update
    set sent_at = now()
    where not public.email_delivery_log.delivered;
  return found;
end;
$$;

create or replace function public.mark_focus_email_delivery_sent(
  p_user_id uuid,
  p_email_kind text,
  p_period_start date
)
returns void
language sql
security definer
set search_path = ''
as $$
  update public.email_delivery_log
  set delivered = true, sent_at = now()
  where user_id = p_user_id and email_kind = p_email_kind and period_start = p_period_start;
$$;

create or replace function public.release_focus_email_delivery(
  p_user_id uuid,
  p_email_kind text,
  p_period_start date
)
returns void
language sql
security definer
set search_path = ''
as $$
  update public.email_delivery_log
  set delivered = false
  where user_id = p_user_id and email_kind = p_email_kind and period_start = p_period_start;
$$;

create or replace function public.claim_accountability_email_delivery(
  p_user_id uuid,
  p_recipient_key text,
  p_email_kind text,
  p_period_start date
)
returns boolean
language plpgsql
security definer
set search_path = ''
as $$
begin
  insert into public.accountability_email_delivery_log (user_id, recipient_key, email_kind, period_start)
  values (p_user_id, p_recipient_key, p_email_kind, p_period_start)
  on conflict (user_id, recipient_key, email_kind, period_start) do update
    set sent_at = now()
    where not public.accountability_email_delivery_log.delivered;
  return found;
end;
$$;

create or replace function public.mark_accountability_email_delivery_sent(
  p_user_id uuid,
  p_recipient_key text,
  p_email_kind text,
  p_period_start date
)
returns void
language sql
security definer
set search_path = ''
as $$
  update public.accountability_email_delivery_log
  set delivered = true, sent_at = now()
  where user_id = p_user_id and recipient_key = p_recipient_key
    and email_kind = p_email_kind and period_start = p_period_start;
$$;

create or replace function public.release_accountability_email_delivery(
  p_user_id uuid,
  p_recipient_key text,
  p_email_kind text,
  p_period_start date
)
returns void
language sql
security definer
set search_path = ''
as $$
  update public.accountability_email_delivery_log
  set delivered = false
  where user_id = p_user_id and recipient_key = p_recipient_key
    and email_kind = p_email_kind and period_start = p_period_start;
$$;

revoke all on function public.get_focus_email_subscribers() from public, anon, authenticated;
revoke all on function public.claim_focus_email_delivery(uuid, text, date) from public, anon, authenticated;
revoke all on function public.release_focus_email_delivery(uuid, text, date) from public, anon, authenticated;
revoke all on function public.mark_focus_email_delivery_sent(uuid, text, date) from public, anon, authenticated;
revoke all on function public.claim_accountability_email_delivery(uuid, text, text, date) from public, anon, authenticated;
revoke all on function public.release_accountability_email_delivery(uuid, text, text, date) from public, anon, authenticated;
revoke all on function public.mark_accountability_email_delivery_sent(uuid, text, text, date) from public, anon, authenticated;
grant execute on function public.get_focus_email_subscribers() to service_role;
grant execute on function public.claim_focus_email_delivery(uuid, text, date) to service_role;
grant execute on function public.release_focus_email_delivery(uuid, text, date) to service_role;
grant execute on function public.mark_focus_email_delivery_sent(uuid, text, date) to service_role;
grant execute on function public.claim_accountability_email_delivery(uuid, text, text, date) to service_role;
grant execute on function public.release_accountability_email_delivery(uuid, text, text, date) to service_role;
grant execute on function public.mark_accountability_email_delivery_sent(uuid, text, text, date) to service_role;