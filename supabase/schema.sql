-- ── Initial table ────────────────────────────────────────────────────────────
-- Run the full script once. If calendar_events already exists, the migration
-- section at the bottom handles the delta.

create table if not exists calendar_events (
  id          uuid primary key default gen_random_uuid(),
  user_id     uuid references auth.users not null,
  title       text not null,
  description text,
  start_at    timestamptz not null,
  end_at      timestamptz,              -- nullable: not every event has an end
  all_day     boolean default false,
  color       text,
  created_at  timestamptz default now(),
  updated_at  timestamptz default now()
);

create index if not exists calendar_events_user_range
  on calendar_events (user_id, start_at, end_at);

alter table calendar_events enable row level security;

create policy "Users can read their own events"
  on calendar_events for select
  using (auth.uid() = user_id);

create policy "Users can insert their own events"
  on calendar_events for insert
  with check (auth.uid() = user_id);

create policy "Users can update their own events"
  on calendar_events for update
  using (auth.uid() = user_id);

create policy "Users can delete their own events"
  on calendar_events for delete
  using (auth.uid() = user_id);

create or replace function update_updated_at()
returns trigger language plpgsql as $$
begin
  new.updated_at = now();
  return new;
end;
$$;

create trigger calendar_events_updated_at
  before update on calendar_events
  for each row execute procedure update_updated_at();

-- ── calendar_reminders ────────────────────────────────────────────────────────

create table if not exists calendar_reminders (
  id             uuid primary key default gen_random_uuid(),
  event_id       uuid references calendar_events(id) on delete cascade not null,
  user_id        uuid references auth.users not null,
  minutes_before integer not null,
  custom_message text,
  sent_at        timestamptz,
  created_at     timestamptz default now()
);

create index if not exists calendar_reminders_unsent
  on calendar_reminders (user_id, event_id, sent_at)
  where sent_at is null;

alter table calendar_reminders enable row level security;

create policy "Users can read their own reminders"
  on calendar_reminders for select
  using (auth.uid() = user_id);

create policy "Users can insert their own reminders"
  on calendar_reminders for insert
  with check (auth.uid() = user_id);

create policy "Users can update their own reminders"
  on calendar_reminders for update
  using (auth.uid() = user_id);

create policy "Users can delete their own reminders"
  on calendar_reminders for delete
  using (auth.uid() = user_id);

-- ── Migrations ───────────────────────────────────────────────────────────────
-- Safe to run even if already applied.
alter table calendar_events alter column end_at drop not null;
alter table calendar_reminders add column if not exists custom_message text;
