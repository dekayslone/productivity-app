# Scheduled email setup

Email is sent server-side by a Supabase Edge Function through Brevo. The browser stores only the schedule preferences; the Brevo API key and cron credentials must never be added to `app.js` or `supabase-config.js`.

## Data storage and retention

The full workspace is saved to browser storage after each change. The app asks the browser to preserve its storage where supported, but the browser can deny that request, storage can be cleared by the user or browser, and private browsing data may disappear when the session ends. Signed-out data remains on that browser and is not a durable backup.

When signed in, workspace snapshots are also synced to the user's Supabase `focus_state` row in order, with a retry when the browser reconnects. If the account has no cloud state yet, the existing local workspace is uploaded. For an existing account, a newer saved snapshot from that same account on this device is kept; otherwise, the newer cloud state is used. Simultaneous edits across devices are not merged. If a local write or cloud sync fails, the app reports the failure. No browser app can promise indefinite retention, and this app does not configure database backups; use your Supabase project's backup and retention settings for important data.

## Email types

- Welcome email: sent once after a newly created account confirms its email. It can be delivered even before the user first initializes cloud state. Only accounts created after the migration are queued; existing accounts are not retroactively welcomed.
- Daily reminder: open tasks due today or overdue, plus incomplete daily habits.
- Weekly progress: tasks completed versus due, completion rate, goals progressed, deadlines met, and habit consistency for the previous Monday through Sunday. Focus-time and capacity metrics are not included because the app does not track time.
- Weekly quote: a separate encouragement email with its own opt-in, weekday, and send time.
- Monthly wins: completed tasks, finished goals, habit sessions, and wins recorded in the monthly review for the previous month.
- Product announcements ("What's new") and newsletters: admins write plain-text content and choose a publish date/time. Each category has a separate optional opt-in; only confirmed users who opted into that category receive it. Emails include a signed unsubscribe link with a confirmation step.

Messages go to the confirmed email address on the user's Supabase account. Accountability partners can be added in Profile and assigned one or more goals. They receive the enabled daily, weekly, and monthly messages on the same schedule and timezone as the account owner, but only with tasks and metrics from their assigned goals; workspace habits and review notes are not shared. Only add partners who have agreed to receive these emails. The scheduler checks once per minute, so delivery may be up to a minute after the selected time.

## Supabase and Brevo

1. Create a Brevo account and an API key. Add a sender email address you control under **Settings > Senders & IP > Senders**, then verify it. For reliable delivery, authenticate the sender's domain by adding Brevo's requested DNS records. See [Brevo's sender and domain guide](https://developers.brevo.com/docs/getting-started-with-senders-and-domains).
2. Run (or re-run) `supabase-email.sql` in the Supabase SQL Editor. It creates new email queues, campaign and delivery tables, trigger/functions, and access policies; it does not drop existing tables, functions, constraints, or delivery rows. The project must already have the `focus_state` table from `supabase-schema.sql` or `supabase-cloud-state.sql`.
3. To enable the campaign composer for your own account, replace the email below with your own sign-in address and run this targeted statement:

   ```sql
   update auth.users
   set raw_app_meta_data = coalesce(raw_app_meta_data, '{}'::jsonb) || jsonb_build_object('email_admin', true)
   where email = 'YOUR_SIGN_IN_EMAIL';
   ```

   This grants site-wide email publishing privileges, so only set it for trusted administrators. Sign out and back in for the updated app metadata to appear in your session.
4. Install the Supabase CLI, then link this project from the workspace:

   ```powershell
   supabase login
   supabase link --project-ref YOUR_PROJECT_REF
   ```

5. Set the Brevo API key and verified sender address as server-only secrets, then deploy the function:

   ```powershell
   supabase secrets set BREVO_API_KEY="YOUR_BREVO_API_KEY" MAIL_FROM="Hoptasks <updates@your-verified-domain.com>"
   supabase functions deploy send-focus-emails --no-verify-jwt
   ```

   Use the email address registered and verified in Brevo for `MAIL_FROM`; the display name is optional. Keep the existing `EMAIL_CRON_SECRET` unchanged because it authenticates the scheduled request and signs unsubscribe links. `--no-verify-jwt` is required because the scheduled request uses that private cron secret; the function checks the bearer token itself.

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

Enable desired email types in Profile after signing into a confirmed Supabase account. Only authorized admins see the campaign composer. Check the Supabase Edge Function logs and Brevo transactional email logs for delivery status. Delivery logs prevent retries from duplicating welcome messages, campaigns, or scheduled email periods.

The function uses the previous full calendar week/month for summaries. Daily reminders keep their existing default; weekly quotes, weekly metrics, monthly recaps, product announcements, and newsletters are separately controlled. Product announcements and newsletters are opt-in. Welcome mail is sent only after account verification.