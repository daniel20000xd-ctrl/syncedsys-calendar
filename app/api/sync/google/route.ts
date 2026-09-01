import { NextRequest, NextResponse } from 'next/server'
import { createAdminClient } from '@/lib/supabase/admin'
import { googleFetch } from '@/lib/google/client'
import { cleanEnv } from '@/lib/clean-env'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

// Google Calendar limits: at most 5 reminder overrides per event, each with a
// lead time of 0..40320 minutes (28 days).
const MAX_OVERRIDES = 5
const MAX_LEAD_MINUTES = 40320

const CAL_EVENTS_URL =
  'https://www.googleapis.com/calendar/v3/calendars/primary/events'

type EventRow = {
  id: string
  user_id: string
  title: string
  description: string | null
  start_at: string
  end_at: string | null
  all_day: boolean
  google_event_id: string | null
}

type ReminderRow = { minutes_before: number; custom_message: string | null }

export async function POST(req: NextRequest) {
  const secret = cleanEnv(process.env.CRON_SECRET)
  if (!secret) {
    return NextResponse.json({ error: 'CRON_SECRET not configured' }, { status: 500 })
  }
  if (req.headers.get('authorization') !== `Bearer ${secret}`) {
    return NextResponse.json({ error: 'unauthorized' }, { status: 401 })
  }

  let eventId: string
  try {
    const body = await req.json()
    eventId = String(body?.eventId ?? '')
  } catch {
    return NextResponse.json({ error: 'invalid JSON body' }, { status: 400 })
  }
  if (!eventId) {
    return NextResponse.json({ error: 'eventId is required' }, { status: 400 })
  }

  const admin = createAdminClient()

  const { data: event, error: evErr } = await admin
    .from('calendar_events')
    .select('id, user_id, title, description, start_at, end_at, all_day, google_event_id')
    .eq('id', eventId)
    .maybeSingle<EventRow>()

  if (evErr) return NextResponse.json({ error: evErr.message }, { status: 500 })
  if (!event) return NextResponse.json({ error: 'event not found' }, { status: 404 })

  if (event.google_event_id) {
    return NextResponse.json({ skipped: 'already synced', googleEventId: event.google_event_id })
  }

  const { data: reminders, error: remErr } = await admin
    .from('calendar_reminders')
    .select('minutes_before, custom_message')
    .eq('event_id', eventId)
    .order('minutes_before', { ascending: true })
    .returns<ReminderRow[]>()

  if (remErr) return NextResponse.json({ error: remErr.message }, { status: 500 })

  const warnings: string[] = []

  // Build reminder overrides: popup + email per reminder, imminent first,
  // capped at Google's limits.
  const overrides: Array<{ method: 'popup' | 'email'; minutes: number }> = []
  for (const r of reminders ?? []) {
    if (r.minutes_before > MAX_LEAD_MINUTES) {
      warnings.push(`reminder ${r.minutes_before} min before exceeds Google's 28-day max — skipped`)
      continue
    }
    for (const method of ['popup', 'email'] as const) {
      if (overrides.length >= MAX_OVERRIDES) {
        warnings.push(`Google allows at most ${MAX_OVERRIDES} reminders per event — dropped ${method} @ ${r.minutes_before} min`)
        continue
      }
      overrides.push({ method, minutes: r.minutes_before })
    }
  }

  const startMs = new Date(event.start_at).getTime()
  const marker = `[synced from Syncedsys · ${event.id}]`
  const description = event.description ? `${event.description}\n\n${marker}` : marker

  const gEvent: Record<string, unknown> = {
    summary: event.title,
    description,
    source: { title: 'Syncedsys Calendar', url: 'https://calendar.syncedsys.com' },
    reminders: { useDefault: false, overrides },
  }

  if (event.all_day) {
    const startDate = event.start_at.slice(0, 10)
    const endMs = event.end_at ? new Date(event.end_at).getTime() : startMs + 24 * 3600_000
    // Google's all-day end date is exclusive; ensure it's at least the day after start.
    const endDate = new Date(Math.max(endMs, startMs + 24 * 3600_000)).toISOString().slice(0, 10)
    gEvent.start = { date: startDate }
    gEvent.end = { date: endDate }
  } else {
    const endMs = event.end_at ? new Date(event.end_at).getTime() : startMs + 3600_000
    gEvent.start = { dateTime: new Date(startMs).toISOString() }
    gEvent.end = { dateTime: new Date(endMs).toISOString() }
  }

  let created: { id?: string } | null = null
  try {
    const res = await googleFetch(event.user_id, CAL_EVENTS_URL, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(gEvent),
    })
    const text = await res.text()
    if (!res.ok) {
      return NextResponse.json(
        { error: 'google_calendar_error', detail: text.slice(0, 500) },
        { status: 502 },
      )
    }
    created = text ? JSON.parse(text) : null
  } catch (e) {
    const detail = e instanceof Error ? e.message : String(e)
    return NextResponse.json({ error: 'google_request_failed', detail }, { status: 502 })
  }

  const googleEventId = created?.id
  if (!googleEventId) {
    return NextResponse.json({ error: 'google returned no event id' }, { status: 502 })
  }

  const { error: updErr } = await admin
    .from('calendar_events')
    .update({ google_event_id: googleEventId, google_synced_at: new Date().toISOString() })
    .eq('id', eventId)

  if (updErr) {
    // The Google event exists; we just failed to record it. Surface it so the
    // caller knows a re-run would duplicate.
    return NextResponse.json(
      { ok: true, googleEventId, overrides: overrides.length, warnings, persistError: updErr.message },
      { status: 207 },
    )
  }

  return NextResponse.json({ ok: true, googleEventId, overrides: overrides.length, warnings })
}
