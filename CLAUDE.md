# syncedsys-calendar

A standalone calendar satellite for the Syncedsys ecosystem, embeddable as a portal node.

## Stack

- **Next.js 16 App Router** — all routes under `app/`
- **Supabase SSR auth** — `@supabase/ssr`; browser client at `lib/supabase/client.ts`, server client at `lib/supabase/server.ts`
- **Tailwind v4** — inline via `@import "tailwindcss"`; custom theme tokens in `app/globals.css`
- **lucide-react** — icons
- **Server Actions** — all DB writes (create/update/delete events) go through `app/actions/events.ts`

## Supabase project

Same project as the main Syncedsys hub (`wrakwdbvkexbsgqcrhgx.supabase.co`).
Auth cookies share the `.syncedsys.com` domain in production so a user logged into the hub is already authenticated here.

## Data model

```sql
calendar_events (
  id          uuid primary key default gen_random_uuid(),
  user_id     uuid references auth.users not null,
  title       text not null,
  description text,
  start_at    timestamptz not null,
  end_at      timestamptz not null,
  all_day     boolean default false,
  color       text,          -- 'blue' | 'green' | 'red' | 'yellow' | 'purple' | 'orange' | 'indigo'
  created_at  timestamptz default now(),
  updated_at  timestamptz default now()
)
```

RLS is enabled — users can only read/write their own rows.
Migration SQL: `supabase/schema.sql` — run once in the Supabase SQL editor.

## API contract

All routes require a valid Supabase session (HTTP 401 otherwise).

| Method | Path | Description |
|--------|------|-------------|
| GET | `/api/calendar/events?start=&end=` | Events in ISO date range |
| POST | `/api/calendar/events` | Create event (body: EventInput) |
| PATCH | `/api/calendar/events/[id]` | Partial update |
| DELETE | `/api/calendar/events/[id]` | Delete |
| GET | `/api/calendar/context` | Plain-text summary of next 30 days, formatted for Claude |

`EventInput` shape:
```ts
{ title: string; description?: string; start_at: string; end_at: string; all_day?: boolean; color?: string }
```

## Calendar UI

- **Month view** — grid with HTML5 drag-to-move; click empty day to create
- **Week view** — time-column grid with mouse drag-to-move and drag-bottom-edge-to-resize
- **Day view** — same as week but single column

Main client component: `components/Calendar.tsx`
Views: `components/views/MonthView.tsx`, `WeekView.tsx`, `DayView.tsx`
Event modal: `components/EventModal.tsx`

## Syncedsys satellite

This app is designed to be embedded in the Syncedsys hub as a **portal** element (the `portal` node type in the free-mode canvas). The `/api/calendar/context` endpoint is the primary MCP/AI integration point — it returns a plain-text event summary that Claude can read to understand the user's schedule.

## Dev

```bash
npm run dev   # http://localhost:3000
```

Run `supabase/schema.sql` in the Supabase dashboard before first use.
