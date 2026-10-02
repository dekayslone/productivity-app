# Scheduled email setup

Email is sent server-side by a Supabase Edge Function. The browser stores only the schedule preferences; Resend and cron credentials must never be added to `app.js` or `supabase-config.js`.

## Email types

- Daily reminder: open tasks due today or overdue, plus incomplete daily habits.
- Weekly progress: tasks completed versus due, completion rate, goals progressed, deadlines met, and habit consistency for the previous Monday through Sunday. Focus-time and capacity metrics are not included because the app does not track time.
- Monthly wins: completed tasks, finished goals, habit sessions, and wins recorded in the monthly review for the previous month.

Messages go to the confirmed email address on the user's Supabase account. Scheduled times use the timezone selected in Profile. The scheduler checks once per minute, so delivery may be up to a minute after the selected time.

## Supabase and Resend

1. Verify a sending domain in Resend and create an API key. Choose a `MAIL_FROM` address on that verified domain.
2. Run `supabase-email.sql` in the Supabase SQL Editor. The project must already have the `focus_state` table from `supabase-schema.sql` or `supabase-cloud-state.sql`.
3. Install the Supabase CLI, then link this project from the workspace:

   ```powershell
   supabase login
   supabase link --project-ref YOUR_PROJECT_REF
   ```

4. Set the server-only secrets and deploy the function. Use a long random value for `EMAIL_CRON_SECRET` and keep it private:

   ```powershell
   supabase secrets set RESEND_API_KEY="YOUR_RESEND_API_KEY" EMAIL_CRON_SECRET="YOUR_RANDOM_CRON_SECRET" MAIL_FROM="Hoptasks <updates@your-verified-domain.com>"
   supabase functions deploy send-focus-emails --no-verify-jwt
   ```

   `--no-verify-jwt` is required because the scheduled request uses the private cron secret; the function checks that bearer token itself.

## Schedule the function

In the Supabase SQL Editor, replace the project ref and both secret placeholders, then run this SQL. Vault stores the function URL and cron secret outside the scheduled SQL text.

```sql
create extension if not exists pg_cron;
create extension if not exists pg_net;

select vault.create_secret(
  'https://YOUR_PROJECT_REF.supabase.co/functions/v1/send-focus-emails',
  'focus_email_endpoint',
  'Hoptasks scheduled email function URL'
);

select vault.create_secret(
  'YOUR_RANDOM_CRON_SECRET',
  'focus_email_cron_secret',
  'Bearer secret for Hoptasks email cron'
);

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
```

Run the two `vault.create_secret` statements only once. If either secret needs rotation, update its Vault entry and the matching Edge Function secret together. Re-running the scheduling section first unschedules the previous cron job.

## Verify

Enable one or more email types in the dashboard's Profile page after signing into a confirmed Supabase account. Check the Supabase Edge Function logs and Resend email logs for delivery status. The `email_delivery_log` table prevents a schedule retry from sending a duplicate for the same user and reporting period.

The function uses the previous full calendar week/month for summaries. Daily, weekly, and monthly delivery preferences are independent; daily reminders default to the existing reminder preference, while weekly and monthly emails require explicit opt-in.