-- Run this in the Supabase SQL editor to set up the calendar_events table.

create table if not exists calendar_events (
  id          uuid primary key default gen_random_uuid(),
  user_id     uuid references auth.users not null,
  title       text not null,
  description text,
  start_at    timestamptz not null,
  end_at      timestamptz not null,
  all_day     boolean default false,
  color       text,
  created_at  timestamptz default now(),
  updated_at  timestamptz default now()
);

-- Index for fast range queries
create index if not exists calendar_events_user_range
  on calendar_events (user_id, start_at, end_at);

-- RLS
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

-- Auto-update updated_at
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
