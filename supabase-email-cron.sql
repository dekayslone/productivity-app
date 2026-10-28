-- Replace both placeholders before running this in the Supabase SQL Editor.
-- The cron secret must match EMAIL_CRON_SECRET configured for the Edge Function.
create extension if not exists pg_cron;
create extension if not exists pg_net;

do $$
begin
  if not exists (
    select 1 from vault.secrets where name = 'focus_email_endpoint'
  ) then
    perform vault.create_secret(
      'https://YOUR_PROJECT_REF.supabase.co/functions/v1/send-focus-emails',
      'focus_email_endpoint',
      'Hoptasks scheduled email function URL'
    );
  end if;

  if not exists (
    select 1 from vault.secrets where name = 'focus_email_cron_secret'
  ) then
    perform vault.create_secret(
      'YOUR_RANDOM_CRON_SECRET',
      'focus_email_cron_secret',
      'Hoptasks email cron authorization secret'
    );
  end if;
end;
$$;

select cron.unschedule(jobid)
from cron.job
where jobname = 'focus-email-dispatch';

select cron.schedule(
  'focus-email-dispatch',
  '* * * * *',
  $job$
    select net.http_post(
      url := (select decrypted_secret from vault.decrypted_secrets where name = 'focus_email_endpoint'),
      headers := jsonb_build_object(
        'Content-Type', 'application/json',
        'Authorization', 'Bearer ' || (select decrypted_secret from vault.decrypted_secrets where name = 'focus_email_cron_secret')
      ),
      body := '{}'::jsonb
    );
  $job$
);
