'use client'

import { useState, useEffect, useCallback, useMemo } from 'react'
import { ChevronLeft, ChevronRight, Calendar as CalIcon } from 'lucide-react'
import MonthView from './views/MonthView'
import WeekView from './views/WeekView'
import DayView from './views/DayView'
import EventModal from './EventModal'
import { updateEvent } from '@/app/actions/events'
import { findConflictIds, type CalendarEvent, type ViewMode } from '@/lib/types'

type ModalState =
  | { open: false }
  | { open: true; mode: 'create'; start: Date; end: Date }
  | { open: true; mode: 'edit'; event: CalendarEvent }

function getViewRange(view: ViewMode, date: Date): { start: Date; end: Date } {
  if (view === 'month') {
    const start = new Date(date.getFullYear(), date.getMonth(), 1)
    start.setDate(start.getDate() - start.getDay())
    const end = new Date(date.getFullYear(), date.getMonth() + 1, 0)
    end.setDate(end.getDate() + (6 - end.getDay()))
    end.setHours(23, 59, 59, 999)
    return { start, end }
  }
  if (view === 'week') {
    const start = new Date(date)
    start.setDate(start.getDate() - start.getDay())
    start.setHours(0, 0, 0, 0)
    const end = new Date(start)
    end.setDate(end.getDate() + 6)
    end.setHours(23, 59, 59, 999)
    return { start, end }
  }
  const start = new Date(date)
  start.setHours(0, 0, 0, 0)
  const end = new Date(date)
  end.setHours(23, 59, 59, 999)
  return { start, end }
}

function navigate(view: ViewMode, date: Date, dir: -1 | 1): Date {
  const d = new Date(date)
  if (view === 'month') d.setMonth(d.getMonth() + dir)
  else if (view === 'week') d.setDate(d.getDate() + dir * 7)
  else d.setDate(d.getDate() + dir)
  return d
}

function headerLabel(view: ViewMode, date: Date): string {
  if (view === 'month') {
    return date.toLocaleDateString('en-US', { month: 'long', year: 'numeric' })
  }
  if (view === 'week') {
    const start = new Date(date)
    start.setDate(start.getDate() - start.getDay())
    const end = new Date(start)
    end.setDate(end.getDate() + 6)
    const s = start.toLocaleDateString('en-US', { month: 'short', day: 'numeric' })
    const e = end.toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' })
    return `${s} – ${e}`
  }
  return date.toLocaleDateString('en-US', { weekday: 'long', month: 'long', day: 'numeric', year: 'numeric' })
}

export default function Calendar() {
  const [view, setView] = useState<ViewMode>('month')
  const [currentDate, setCurrentDate] = useState(new Date())
  const [events, setEvents] = useState<CalendarEvent[]>([])
  const [modal, setModal] = useState<ModalState>({ open: false })

  const conflictIds = useMemo(() => findConflictIds(events), [events])

  const fetchEvents = useCallback(async (v: ViewMode, d: Date) => {
    const { start, end } = getViewRange(v, d)
    try {
      const res = await fetch(`/api/calendar/events?start=${start.toISOString()}&end=${end.toISOString()}`)
      if (res.ok) setEvents(await res.json())
    } catch {}
  }, [])

  useEffect(() => {
    fetchEvents(view, currentDate)
  }, [view, currentDate, fetchEvents])

  function onSaved() {
    setModal({ open: false })
    fetchEvents(view, currentDate)
  }

  function openCreate(start: Date, endOverride?: Date) {
    const end = endOverride ?? new Date(start.getTime() + 60 * 60000)
    setModal({ open: true, mode: 'create', start, end })
  }

  async function handleEventDrop(eventId: string, newDate: Date) {
    const ev = events.find(e => e.id === eventId)
    if (!ev) return
    const origStart = new Date(ev.start_at)
    const dur = ev.end_at
      ? new Date(ev.end_at).getTime() - origStart.getTime()
      : 3600000

    const newStart = new Date(newDate)
    newStart.setHours(origStart.getHours(), origStart.getMinutes(), 0, 0)
    const newEnd = new Date(newStart.getTime() + dur)

    setEvents(prev => prev.map(e => e.id === eventId
      ? { ...e, start_at: newStart.toISOString(), end_at: newEnd.toISOString() }
      : e
    ))

    try {
      await updateEvent(eventId, { start_at: newStart.toISOString(), end_at: newEnd.toISOString() })
      fetchEvents(view, currentDate)
    } catch {
      fetchEvents(view, currentDate)
    }
  }

  async function handleEventChange(eventId: string, start: Date, end: Date) {
    setEvents(prev => prev.map(e => e.id === eventId
      ? { ...e, start_at: start.toISOString(), end_at: end.toISOString() }
      : e
    ))
    try {
      await updateEvent(eventId, { start_at: start.toISOString(), end_at: end.toISOString() })
      fetchEvents(view, currentDate)
    } catch {
      fetchEvents(view, currentDate)
    }
  }

  return (
    <div className="h-full flex flex-col bg-[#0a0a0a]">
      {/* Header */}
      <header className="flex items-center justify-between px-4 py-3 border-b border-[#242424] shrink-0">
        <div className="flex items-center gap-3">
          <CalIcon size={18} className="text-blue-500" />
          <span className="text-sm font-semibold text-[#e8e8e8] tracking-tight">Calendar</span>
          <span className="text-[#333]">·</span>
          <span className="text-sm text-[#666]">{headerLabel(view, currentDate)}</span>
        </div>

        <div className="flex items-center gap-2">
          <button
            onClick={() => setCurrentDate(new Date())}
            className="px-3 py-1 text-xs border border-[#2a2a2a] rounded-lg text-[#888] hover:text-[#e8e8e8] hover:border-[#3a3a3a] transition-colors"
          >
            Today
          </button>

          <div className="flex items-center gap-1">
            <button
              onClick={() => setCurrentDate(d => navigate(view, d, -1))}
              className="p-1.5 rounded-lg text-[#555] hover:text-[#e8e8e8] hover:bg-[#1a1a1a] transition-colors"
            >
              <ChevronLeft size={16} />
            </button>
            <button
              onClick={() => setCurrentDate(d => navigate(view, d, 1))}
              className="p-1.5 rounded-lg text-[#555] hover:text-[#e8e8e8] hover:bg-[#1a1a1a] transition-colors"
            >
              <ChevronRight size={16} />
            </button>
          </div>

          <div className="flex items-center bg-[#111] border border-[#242424] rounded-lg overflow-hidden">
            {(['month', 'week', 'day'] as ViewMode[]).map(v => (
              <button
                key={v}
                onClick={() => setView(v)}
                className={`px-3 py-1.5 text-xs capitalize transition-colors
                  ${view === v ? 'bg-[#1e1e1e] text-[#e8e8e8]' : 'text-[#555] hover:text-[#888]'}`}
              >
                {v}
              </button>
            ))}
          </div>
        </div>
      </header>

      {/* Calendar body */}
      <main className="flex-1 min-h-0">
        {view === 'month' && (
          <MonthView
            currentDate={currentDate}
            events={events}
            conflictIds={conflictIds}
            onDayClick={(date) => openCreate(date)}
            onEventClick={(ev) => setModal({ open: true, mode: 'edit', event: ev })}
            onEventDrop={handleEventDrop}
          />
        )}
        {view === 'week' && (
          <WeekView
            currentDate={currentDate}
            events={events}
            conflictIds={conflictIds}
            onSlotClick={(date) => openCreate(date)}
            onEventClick={(ev) => setModal({ open: true, mode: 'edit', event: ev })}
            onEventChange={handleEventChange}
          />
        )}
        {view === 'day' && (
          <DayView
            currentDate={currentDate}
            events={events}
            conflictIds={conflictIds}
            onSlotClick={(date) => openCreate(date)}
            onEventClick={(ev) => setModal({ open: true, mode: 'edit', event: ev })}
            onEventChange={handleEventChange}
          />
        )}
      </main>

      {modal.open && (
        <EventModal
          mode={modal.mode}
          initialStart={modal.mode === 'create' ? modal.start : new Date(modal.event.start_at)}
          initialEnd={modal.mode === 'create' ? modal.end : (modal.event.end_at ? new Date(modal.event.end_at) : null)}
          event={modal.mode === 'edit' ? modal.event : undefined}
          onClose={() => setModal({ open: false })}
          onSaved={onSaved}
        />
      )}
    </div>
  )
}
