-- ── Google Calendar sync bookkeeping ────────────────────────────────────────
-- One-way sync (Syncedsys → Google, create-only) records the Google event id it
-- created for each Syncedsys event, so /api/sync/google is idempotent and a
-- later reverse-lookup / cleanup is possible.
--
-- Run once in the Supabase SQL editor. Idempotent.

alter table calendar_events add column if not exists google_event_id text;
alter table calendar_events add column if not exists google_synced_at timestamptz;
