-- ── Reminder dispatch ────────────────────────────────────────────────────────
-- Every 15 minutes at :01 :16 :31 :46 — deliberately one minute past the quarter
-- hour. Reminders are usually scheduled on the quarter hour (event on the :00,
-- lead time a multiple of 15), so their trigger lands exactly on a :00/:15/etc.
-- The 1-minute offset guarantees the route's wall clock is safely past that
-- trigger even with clock skew between the Postgres and Vercel hosts — otherwise
-- a "just missed it" pushes the reminder a full 15 minutes late.
--
-- The route sends any due, unsent reminder by email and stamps
-- calendar_reminders.sent_at. Missed runs self-heal — it sends everything
-- overdue, not just a forward window.
--
-- One-time setup in the Supabase dashboard:
--   1. Database → Extensions: enable `pg_cron` and `pg_net`.
--   2. Store the shared secret (must equal CRON_SECRET in the calendar app env):
--        select vault.create_secret('REPLACE_WITH_CRON_SECRET', 'calendar_cron_secret');
--   3. Run this script in the SQL editor. Re-running it is safe.

create extension if not exists pg_cron;
create extension if not exists pg_net;

do $$
begin
  perform cron.unschedule('calendar-reminders');
exception when others then
  null; -- not scheduled yet
end $$;

select cron.schedule(
  'calendar-reminders',
  '1,16,31,46 * * * *',
  $$
  select net.http_get(
    url := 'https://calendar.syncedsys.com/api/cron/reminders',
    headers := jsonb_build_object(
      'Authorization',
      'Bearer ' || (
        select decrypted_secret
        from vault.decrypted_secrets
        where name = 'calendar_cron_secret'
      )
    ),
    timeout_milliseconds := 10000
  );
  $$
);

-- Check it registered:
--   select jobname, schedule, active from cron.job where jobname = 'calendar-reminders';
-- Inspect recent HTTP responses:
--   select status_code, content, created
--   from net._http_response order by created desc limit 10;
-- Inspect run history:
--   select status, return_message, start_time
--   from cron.job_run_details
--   where jobid = (select jobid from cron.job where jobname = 'calendar-reminders')
--   order by start_time desc limit 10;
