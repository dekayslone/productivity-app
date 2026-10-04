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

create table if not exists public.welcome_email_queue (
  user_id uuid primary key references auth.users(id) on delete cascade,
  queued_at timestamptz not null default now(),
  sending_at timestamptz,
  sent_at timestamptz
);

alter table public.welcome_email_queue enable row level security;

create or replace function public.queue_welcome_email_for_new_user()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  insert into public.welcome_email_queue (user_id) values (new.id)
  on conflict (user_id) do nothing;
  return new;
end;
$$;

do $$
begin
  if not exists (
    select 1 from pg_catalog.pg_trigger
    where tgname = 'queue_hoptasks_welcome_email'
      and tgrelid = 'auth.users'::regclass
      and not tgisinternal
  ) then
    create trigger queue_hoptasks_welcome_email
      after insert on auth.users
      for each row execute function public.queue_welcome_email_for_new_user();
  end if;
end;
$$;

create table if not exists public.weekly_quote_delivery_log (
  user_id uuid not null references auth.users(id) on delete cascade,
  period_start date not null,
  delivered boolean not null default false,
  sent_at timestamptz not null default now(),
  primary key (user_id, period_start)
);

alter table public.weekly_quote_delivery_log enable row level security;

create table if not exists public.email_campaigns (
  id uuid primary key default gen_random_uuid(),
  campaign_type text not null check (campaign_type in ('whats_new', 'newsletter')),
  title text not null,
  subject text not null,
  content text not null,
  publish_at timestamptz not null,
  created_by uuid not null references auth.users(id),
  created_at timestamptz not null default now()
);

alter table public.email_campaigns enable row level security;
revoke all on table public.email_campaigns from anon, authenticated;
grant select, insert on table public.email_campaigns to authenticated;
grant all on table public.email_campaigns to service_role;

create table if not exists public.email_campaign_delivery_log (
  campaign_id uuid not null references public.email_campaigns(id) on delete cascade,
  user_id uuid not null references auth.users(id) on delete cascade,
  delivered boolean not null default false,
  sent_at timestamptz not null default now(),
  primary key (campaign_id, user_id)
);

alter table public.email_campaign_delivery_log enable row level security;

create table if not exists public.email_marketing_unsubscribes (
  user_id uuid not null references auth.users(id) on delete cascade,
  preference text not null check (preference in ('whatsNew', 'newsletter')),
  unsubscribed_at timestamptz not null default now(),
  primary key (user_id, preference)
);

alter table public.email_marketing_unsubscribes enable row level security;
revoke all on table public.email_marketing_unsubscribes from anon, authenticated;
grant all on table public.email_marketing_unsubscribes to service_role;

create table if not exists public.email_marketing_rollout (
  rollout_key text primary key,
  applied_at timestamptz not null default now()
);

alter table public.email_marketing_rollout enable row level security;
revoke all on table public.email_marketing_rollout from anon, authenticated;
grant all on table public.email_marketing_rollout to service_role;

do $$
begin
  if not exists (
    select 1 from public.email_marketing_rollout
    where rollout_key = 'default_campaign_opt_in'
  ) then
    update public.focus_state
    set state = jsonb_set(
      coalesce(state, '{}'::jsonb),
      '{profile}',
      (case when jsonb_typeof(state->'profile') = 'object' then state->'profile' else '{}'::jsonb end) || jsonb_build_object(
        'emailPreferences',
        (case when jsonb_typeof(state->'profile'->'emailPreferences') = 'object' then state->'profile'->'emailPreferences' else '{}'::jsonb end)
          || jsonb_build_object('whatsNew', true, 'newsletter', true)
      ),
      true
    ),
    updated_at = now();

    insert into public.email_marketing_rollout (rollout_key)
    values ('default_campaign_opt_in');
  end if;
end;
$$;

do $$
begin
  if not exists (select 1 from pg_catalog.pg_policies where schemaname='public' and tablename='email_campaigns' and policyname='Email admins read campaigns') then
    create policy "Email admins read campaigns" on public.email_campaigns
      for select to authenticated
      using ((select auth.jwt()->'app_metadata'->>'email_admin') = 'true');
  end if;
  if not exists (select 1 from pg_catalog.pg_policies where schemaname='public' and tablename='email_campaigns' and policyname='Email admins create campaigns') then
    create policy "Email admins create campaigns" on public.email_campaigns
      for insert to authenticated
      with check (
        (select auth.jwt()->'app_metadata'->>'email_admin') = 'true'
        and created_by = (select auth.uid())
      );
  end if;
end;
$$;

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

create or replace function public.get_pending_welcome_emails()
returns table (user_id uuid, email text, name text)
language sql
stable
security definer
set search_path = ''
as $$
  select q.user_id, u.email::text,
    coalesce(u.raw_user_meta_data->>'full_name', u.raw_user_meta_data->>'name', '')::text
  from public.welcome_email_queue as q
  join auth.users as u on u.id = q.user_id
  where u.email is not null
    and u.email_confirmed_at is not null
    and q.sent_at is null;
$$;

create or replace function public.unsubscribe_focus_email(
  p_user_id uuid,
  p_preference text
)
returns boolean
language plpgsql
security definer
set search_path = ''
as $$
begin
  if p_preference is null or p_preference not in ('whatsNew', 'newsletter') then
    raise exception 'Unsupported email preference';
  end if;

  insert into public.email_marketing_unsubscribes (user_id, preference)
  values (p_user_id, p_preference)
  on conflict (user_id, preference) do update
    set unsubscribed_at = now();

  update public.focus_state
  set state = jsonb_set(
    coalesce(state, '{}'::jsonb),
    '{profile}',
    (case when jsonb_typeof(state->'profile') = 'object' then state->'profile' else '{}'::jsonb end) || jsonb_build_object(
      'emailPreferences',
      (case when jsonb_typeof(state->'profile'->'emailPreferences') = 'object' then state->'profile'->'emailPreferences' else '{}'::jsonb end) || jsonb_build_object(p_preference, false)
    ),
    true
  ),
  updated_at = now()
  where user_id = p_user_id;
  return found;
end;
$$;

revoke all on function public.unsubscribe_focus_email(uuid, text) from public, anon, authenticated;
grant execute on function public.unsubscribe_focus_email(uuid, text) to service_role;

create or replace function public.get_email_marketing_unsubscribes()
returns table (user_id uuid, preference text)
language sql
stable
security definer
set search_path = ''
as $$
  select u.user_id, u.preference
  from public.email_marketing_unsubscribes as u;
$$;

create or replace function public.set_email_marketing_preference(p_preference text, p_enabled boolean)
returns void
language plpgsql
security definer
set search_path = ''
as $$
begin
  if auth.uid() is null then
    raise exception 'Authentication required';
  end if;
  if p_preference is null or p_preference not in ('whatsNew', 'newsletter') then
    raise exception 'Unsupported email preference';
  end if;

  if p_enabled then
    delete from public.email_marketing_unsubscribes
    where user_id = auth.uid() and preference = p_preference;
  else
    insert into public.email_marketing_unsubscribes (user_id, preference)
    values (auth.uid(), p_preference)
    on conflict (user_id, preference) do update
      set unsubscribed_at = now();
  end if;
end;
$$;

revoke all on function public.get_email_marketing_unsubscribes() from public, anon, authenticated;
grant execute on function public.get_email_marketing_unsubscribes() to service_role;
revoke all on function public.set_email_marketing_preference(text, boolean) from public, anon;
grant execute on function public.set_email_marketing_preference(text, boolean) to authenticated;

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

create or replace function public.claim_welcome_email_delivery(p_user_id uuid)
returns boolean
language plpgsql security definer set search_path = ''
as $$
begin
  update public.welcome_email_queue
  set sending_at = now()
  where user_id = p_user_id and sent_at is null
    and (sending_at is null or sending_at < now() - interval '10 minutes');
  return found;
end;
$$;

create or replace function public.mark_welcome_email_delivery_sent(p_user_id uuid)
returns void
language sql security definer set search_path = ''
as $$
  update public.welcome_email_queue set sent_at=now(), sending_at=null where user_id=p_user_id;
$$;

create or replace function public.release_welcome_email_delivery(p_user_id uuid)
returns void
language sql security definer set search_path = ''
as $$
  update public.welcome_email_queue set sending_at=null where user_id=p_user_id and sent_at is null;
$$;

create or replace function public.claim_weekly_quote_delivery(p_user_id uuid, p_period_start date)
returns boolean
language plpgsql security definer set search_path = ''
as $$
begin
  insert into public.weekly_quote_delivery_log (user_id, period_start, delivered)
  values (p_user_id, p_period_start, false)
  on conflict (user_id, period_start) do update
    set sent_at=now() where not public.weekly_quote_delivery_log.delivered;
  return found;
end;
$$;

create or replace function public.mark_weekly_quote_delivery_sent(p_user_id uuid, p_period_start date)
returns void
language sql security definer set search_path = ''
as $$
  update public.weekly_quote_delivery_log set delivered=true, sent_at=now()
  where user_id=p_user_id and period_start=p_period_start;
$$;

create or replace function public.release_weekly_quote_delivery(p_user_id uuid, p_period_start date)
returns void
language sql security definer set search_path = ''
as $$
  update public.weekly_quote_delivery_log set delivered=false
  where user_id=p_user_id and period_start=p_period_start;
$$;

create or replace function public.get_due_email_campaigns()
returns table (id uuid, campaign_type text, title text, subject text, content text, publish_at timestamptz)
language sql stable security definer set search_path = ''
as $$
  select c.id, c.campaign_type, c.title, c.subject, c.content, c.publish_at
  from public.email_campaigns c
  where c.publish_at <= now() and c.publish_at >= now() - interval '30 days';
$$;

create or replace function public.claim_email_campaign_delivery(p_campaign_id uuid, p_user_id uuid)
returns boolean
language plpgsql security definer set search_path = ''
as $$
begin
  insert into public.email_campaign_delivery_log (campaign_id, user_id, delivered)
  values (p_campaign_id, p_user_id, false)
  on conflict (campaign_id, user_id) do update
    set sent_at=now() where not public.email_campaign_delivery_log.delivered;
  return found;
end;
$$;

create or replace function public.mark_email_campaign_delivery_sent(p_campaign_id uuid, p_user_id uuid)
returns void
language sql security definer set search_path = ''
as $$
  update public.email_campaign_delivery_log set delivered=true, sent_at=now()
  where campaign_id=p_campaign_id and user_id=p_user_id;
$$;

create or replace function public.release_email_campaign_delivery(p_campaign_id uuid, p_user_id uuid)
returns void
language sql security definer set search_path = ''
as $$
  update public.email_campaign_delivery_log set delivered=false
  where campaign_id=p_campaign_id and user_id=p_user_id;
$$;

revoke all on function public.queue_welcome_email_for_new_user() from public, anon, authenticated;
revoke all on function public.claim_welcome_email_delivery(uuid) from public, anon, authenticated;
revoke all on function public.mark_welcome_email_delivery_sent(uuid) from public, anon, authenticated;
revoke all on function public.release_welcome_email_delivery(uuid) from public, anon, authenticated;
revoke all on function public.get_pending_welcome_emails() from public, anon, authenticated;
revoke all on function public.claim_weekly_quote_delivery(uuid, date) from public, anon, authenticated;
revoke all on function public.mark_weekly_quote_delivery_sent(uuid, date) from public, anon, authenticated;
revoke all on function public.release_weekly_quote_delivery(uuid, date) from public, anon, authenticated;
revoke all on function public.get_due_email_campaigns() from public, anon, authenticated;
revoke all on function public.claim_email_campaign_delivery(uuid, uuid) from public, anon, authenticated;
revoke all on function public.mark_email_campaign_delivery_sent(uuid, uuid) from public, anon, authenticated;
revoke all on function public.release_email_campaign_delivery(uuid, uuid) from public, anon, authenticated;
grant execute on function public.claim_welcome_email_delivery(uuid) to service_role;
grant execute on function public.mark_welcome_email_delivery_sent(uuid) to service_role;
grant execute on function public.release_welcome_email_delivery(uuid) to service_role;
grant execute on function public.get_pending_welcome_emails() to service_role;
grant execute on function public.claim_weekly_quote_delivery(uuid, date) to service_role;
grant execute on function public.mark_weekly_quote_delivery_sent(uuid, date) to service_role;
grant execute on function public.release_weekly_quote_delivery(uuid, date) to service_role;
grant execute on function public.get_due_email_campaigns() to service_role;
grant execute on function public.claim_email_campaign_delivery(uuid, uuid) to service_role;
grant execute on function public.mark_email_campaign_delivery_sent(uuid, uuid) to service_role;
grant execute on function public.release_email_campaign_delivery(uuid, uuid) to service_role;