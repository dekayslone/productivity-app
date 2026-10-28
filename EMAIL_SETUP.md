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
- All email preferences default to enabled. The migration fills in missing preferences for existing profiles once without changing an explicitly saved preference. Product announcements ("What's new") and newsletters are written by admins as plain-text content and scheduled for a publish date/time. Users can turn either marketing category off in Profile or follow that category's signed unsubscribe link; saving Profile with the category enabled opts back in.

Messages go to the confirmed email address on the user's Supabase account. Accountability partners can be added in Profile and assigned one or more goals. They receive the enabled daily, weekly, and monthly messages on the same schedule and timezone as the account owner, but only with tasks and metrics from their assigned goals; workspace habits and review notes are not shared. Only add partners who have agreed to receive these emails. The scheduler checks once per minute, so delivery may be up to a minute after the selected time.

## Supabase and Brevo

1. Create a Brevo account and an API key. Add a sender email address you control under **Settings > Senders & IP > Senders**, then verify it. For reliable delivery, authenticate the sender's domain by adding Brevo's requested DNS records. See [Brevo's sender and domain guide](https://developers.brevo.com/docs/getting-started-with-senders-and-domains).
2. Run (or re-run) `supabase-email.sql` in the Supabase SQL Editor. It creates new email queues, campaign and delivery tables, trigger/functions, and access policies; it does not drop existing tables, functions, constraints, or delivery rows. The project must already have the `focus_state` table from `supabase-schema.sql` or `supabase-cloud-state.sql`. The preference-default backfills run once, including when this migration is re-run.
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

5. Set the Brevo API key, verified sender address, and a strong random cron secret as server-only secrets, then deploy the function. The cron secret is a shared secret: use the exact same value for `EMAIL_CRON_SECRET` here and for `focus_email_cron_secret` in the SQL scheduling step below.

   ```powershell
   supabase secrets set BREVO_API_KEY="YOUR_BREVO_API_KEY" MAIL_FROM="Hoptasks <updates@your-verified-domain.com>" EMAIL_CRON_SECRET="YOUR_RANDOM_CRON_SECRET"
   supabase functions deploy send-focus-emails --no-verify-jwt
   ```

   Use the email address registered and verified in Brevo for `MAIL_FROM`; the display name is optional. `EMAIL_CRON_SECRET` authenticates scheduled requests and signs unsubscribe links. If rotating it later, update both the Edge Function secret and the Vault secret together. `--no-verify-jwt` is required because the scheduled request uses that private cron secret; the function checks the bearer token itself.

## Schedule the function

After deploying the Edge Function, replace `YOUR_PROJECT_REF` and `YOUR_RANDOM_CRON_SECRET` in [supabase-email-cron.sql](./supabase-email-cron.sql), then run the file in the Supabase SQL Editor. The cron secret must exactly match `EMAIL_CRON_SECRET` configured above. The script creates the Vault entries if they do not exist and schedules `focus-email-dispatch` to invoke the function once per minute; re-running it replaces the existing job rather than creating a duplicate.

Vault keeps the endpoint and authorization secret out of the cron job definition. If rotating the secret later, update the Vault entry and the Edge Function secret together. The script intentionally does not overwrite existing Vault entries.

## Verify

Enable desired email types in Profile after signing into a confirmed Supabase account. Only authorized admins see the campaign composer. Check the Supabase Edge Function logs and Brevo transactional email logs for delivery status. Delivery logs prevent retries from duplicating welcome messages, campaigns, or scheduled email periods.

The function uses the previous full calendar week/month for summaries. Daily reminders keep their existing default; weekly quotes, weekly metrics, monthly recaps, product announcements, and newsletters are separately controlled. Product announcements and newsletters are opt-in. Welcome mail is sent only after account verification.
