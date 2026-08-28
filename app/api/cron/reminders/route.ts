import { NextRequest, NextResponse } from 'next/server'
import { createAdminClient } from '@/lib/supabase/admin'
import { sendReminderEmail } from '@/lib/email'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

// A reminder whose event started more than this long ago is resolved without
// sending — a reminder for a class that's already well underway is just noise.
// Also stops a backlog from flooding out if the scan was down for a while.
const STALE_AFTER_MS = 60 * 60 * 1000

type EventShape = {
  title: string
  start_at: string
  end_at: string | null
  description: string | null
}

export async function GET(req: NextRequest) {
  const secret = process.env.CRON_SECRET
  if (!secret) {
    return NextResponse.json({ error: 'CRON_SECRET not configured' }, { status: 500 })
  }
  if (req.headers.get('authorization') !== `Bearer ${secret}`) {
    return NextResponse.json({ error: 'unauthorized' }, { status: 401 })
  }

  const admin = createAdminClient()
  const now = Date.now()

  const { data: reminders, error } = await admin
    .from('calendar_reminders')
    .select(
      'id, minutes_before, custom_message, user_id, calendar_events ( title, start_at, end_at, description )'
    )
    .is('sent_at', null)

  if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  if (!reminders?.length) {
    return NextResponse.json({ considered: 0, due: 0, sent: 0, stale: 0, failed: 0 })
  }

  const sentIds: string[] = []
  const staleIds: string[] = []
  const emailCache = new Map<string, string | null>()
  let failed = 0

  for (const r of reminders) {
    const event = r.calendar_events as unknown as EventShape | null
    if (!event) {
      // orphaned reminder (event deleted without cascade, shouldn't happen)
      staleIds.push(r.id)
      continue
    }

    const startMs = new Date(event.start_at).getTime()
    const triggerMs = startMs - r.minutes_before * 60000

    if (triggerMs > now) continue // not due yet
    if (now - startMs > STALE_AFTER_MS) {
      staleIds.push(r.id)
      continue
    }

    let email = emailCache.get(r.user_id)
    if (email === undefined) {
      const { data: u } = await admin.auth.admin.getUserById(r.user_id)
      email = u?.user?.email ?? null
      emailCache.set(r.user_id, email)
    }
    if (!email) {
      failed++
      continue
    }

    try {
      await sendReminderEmail(email, event, r.minutes_before, r.custom_message ?? undefined)
      sentIds.push(r.id)
    } catch (e) {
      failed++
      console.error('reminder send failed', r.id, e)
    }
  }

  const stamp = new Date().toISOString()
  // sent_at doubles as "resolved" — stale reminders are stamped too so the scan
  // stops re-considering them every run.
  const resolved = [...sentIds, ...staleIds]
  if (resolved.length) {
    await admin.from('calendar_reminders').update({ sent_at: stamp }).in('id', resolved)
  }

  const summary = {
    considered: reminders.length,
    due: sentIds.length + staleIds.length + failed,
    sent: sentIds.length,
    stale: staleIds.length,
    failed,
  }
  console.log('cron/reminders', summary)
  return NextResponse.json(summary)
}
