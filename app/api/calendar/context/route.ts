import { createClient } from '@/lib/supabase/server'
import { NextResponse } from 'next/server'

export async function GET() {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const now = new Date()
  const end = new Date(now)
  end.setDate(end.getDate() + 30)

  const { data, error } = await supabase
    .from('calendar_events')
    .select('title, description, start_at, end_at, all_day')
    .eq('user_id', user.id)
    .gte('start_at', now.toISOString())
    .lte('start_at', end.toISOString())
    .order('start_at')

  if (error) return NextResponse.json({ error: error.message }, { status: 500 })

  if (!data || data.length === 0) {
    return new NextResponse('No events in the next 30 days.', {
      headers: { 'Content-Type': 'text/plain' },
    })
  }

  const lines: string[] = [`Calendar events for the next 30 days (${now.toDateString()} – ${end.toDateString()}):\n`]

  let lastDate = ''
  for (const ev of data) {
    const start = new Date(ev.start_at)
    const dateStr = start.toLocaleDateString('en-US', { weekday: 'long', month: 'long', day: 'numeric' })

    if (dateStr !== lastDate) {
      lines.push(`\n${dateStr}`)
      lastDate = dateStr
    }

    if (ev.all_day) {
      lines.push(`  • ${ev.title} (all day)${ev.description ? ` — ${ev.description}` : ''}`)
    } else {
      const end = new Date(ev.end_at)
      const timeStr = `${fmt(start)} – ${fmt(end)}`
      lines.push(`  • ${ev.title} ${timeStr}${ev.description ? ` — ${ev.description}` : ''}`)
    }
  }

  return new NextResponse(lines.join('\n'), {
    headers: { 'Content-Type': 'text/plain' },
  })
}

function fmt(d: Date): string {
  return d.toLocaleTimeString('en-US', { hour: 'numeric', minute: '2-digit', hour12: true })
}
