'use client'

import { useRef, useState, useCallback } from 'react'
import { AlertTriangle } from 'lucide-react'
import { eventColorClass, eventBorderClass, type CalendarEvent } from '@/lib/types'

const HOURS = Array.from({ length: 24 }, (_, i) => i)
const PX_PER_MIN = 1.2
const HOUR_HEIGHT = PX_PER_MIN * 60
const SNAP = 15

type Props = {
  currentDate: Date
  events: CalendarEvent[]
  conflictIds: Set<string>
  onSlotClick: (date: Date) => void
  onEventClick: (event: CalendarEvent) => void
  onEventChange: (eventId: string, start: Date, end: Date) => void
}

function startOfWeek(d: Date): Date {
  const r = new Date(d)
  r.setDate(r.getDate() - r.getDay())
  r.setHours(0, 0, 0, 0)
  return r
}

function addDays(d: Date, n: number): Date {
  const r = new Date(d)
  r.setDate(r.getDate() + n)
  return r
}

function minutesFromMidnight(d: Date): number {
  return d.getHours() * 60 + d.getMinutes()
}

function snap(minutes: number): number {
  return Math.round(minutes / SNAP) * SNAP
}

function isSameDay(a: Date, b: Date) {
  return a.getFullYear() === b.getFullYear() &&
    a.getMonth() === b.getMonth() &&
    a.getDate() === b.getDate()
}

function layoutEvents(evs: CalendarEvent[]): Array<CalendarEvent & { col: number; cols: number }> {
  const sorted = [...evs].sort((a, b) => a.start_at.localeCompare(b.start_at))
  const result: Array<CalendarEvent & { col: number; cols: number }> = []
  const groups: Array<typeof result> = []

  for (const ev of sorted) {
    const start = new Date(ev.start_at).getTime()
    const end = ev.end_at ? new Date(ev.end_at).getTime() : new Date(ev.start_at).getTime() + 3600000
    let placed = false

    for (const group of groups) {
      const lastEnd = Math.max(...group.map(e => e.end_at ? new Date(e.end_at).getTime() : new Date(e.start_at).getTime() + 3600000))
      if (start < lastEnd) {
        const col = group.length
        const item = { ...ev, col, cols: 1 }
        group.push(item)
        result.push(item)
        placed = true
        break
      }
    }

    if (!placed) {
      const item = { ...ev, col: 0, cols: 1 }
      groups.push([item])
      result.push(item)
    }
  }

  for (const group of groups) {
    const maxCol = group.length
    group.forEach(e => { e.cols = maxCol })
  }

  return result
}

export default function WeekView({ currentDate, events, conflictIds, onSlotClick, onEventClick, onEventChange }: Props) {
  const gridRef = useRef<HTMLDivElement>(null)
  const weekStart = startOfWeek(currentDate)
  const days = Array.from({ length: 7 }, (_, i) => addDays(weekStart, i))
  const today = new Date()

  type DragOp =
    | { type: 'move'; eventId: string; origStart: Date; origEnd: Date; startY: number; startDayIdx: number }
    | { type: 'resize'; eventId: string; origEnd: Date; startY: number }

  const [drag, setDrag] = useState<DragOp | null>(null)
  const [preview, setPreview] = useState<Map<string, { start: Date; end: Date }>>(new Map())

  const yToMinutes = useCallback((y: number): number => {
    return snap(Math.max(0, Math.min(y / PX_PER_MIN, 1439)))
  }, [])

  function handleGridMouseMove(e: React.MouseEvent) {
    if (!drag || !gridRef.current) return
    const rect = gridRef.current.getBoundingClientRect()
    const y = e.clientY - rect.top
    const deltaY = e.clientY - drag.startY
    const deltaMin = snap(deltaY / PX_PER_MIN)

    if (drag.type === 'resize') {
      const newEnd = new Date(drag.origEnd.getTime() + deltaMin * 60000)
      const origStart = events.find(e => e.id === drag.eventId)
      if (!origStart) return
      const min = new Date(origStart.start_at).getTime() + 15 * 60000
      if (newEnd.getTime() >= min) {
        setPreview(new Map([[drag.eventId, { start: new Date(origStart.start_at), end: newEnd }]]))
      }
    } else {
      const newStart = new Date(drag.origStart.getTime() + deltaMin * 60000)
      const dur = drag.origEnd.getTime() - drag.origStart.getTime()
      const newEnd = new Date(newStart.getTime() + dur)
      setPreview(new Map([[drag.eventId, { start: newStart, end: newEnd }]]))
    }
  }

  function handleGridMouseUp() {
    if (!drag) return
    const p = preview.get(drag.eventId)
    if (p) onEventChange(drag.eventId, p.start, p.end)
    setDrag(null)
    setPreview(new Map())
  }

  function startMove(ev: CalendarEvent, e: React.MouseEvent, dayIdx: number) {
    e.stopPropagation()
    setDrag({
      type: 'move',
      eventId: ev.id,
      origStart: new Date(ev.start_at),
      origEnd: ev.end_at ? new Date(ev.end_at) : new Date(new Date(ev.start_at).getTime() + 3600000),
      startY: e.clientY,
      startDayIdx: dayIdx,
    })
  }

  function startResize(ev: CalendarEvent, e: React.MouseEvent) {
    e.stopPropagation()
    setDrag({
      type: 'resize',
      eventId: ev.id,
      origEnd: ev.end_at ? new Date(ev.end_at) : new Date(new Date(ev.start_at).getTime() + 3600000),
      startY: e.clientY,
    })
  }

  function handleSlotClick(day: Date, y: number) {
    if (drag) return
    const minutes = snap(y / PX_PER_MIN)
    const start = new Date(day)
    start.setHours(Math.floor(minutes / 60), minutes % 60, 0, 0)
    const end = new Date(start.getTime() + 60 * 60000)
    onSlotClick(start)
  }

  return (
    <div
      className="flex flex-col h-full overflow-hidden"
      onMouseMove={handleGridMouseMove}
      onMouseUp={handleGridMouseUp}
      onMouseLeave={handleGridMouseUp}
    >
      {/* Day headers */}
      <div className="flex border-b border-[#242424] shrink-0">
        <div className="w-12 shrink-0" />
        {days.map((day, i) => {
          const isToday = isSameDay(day, today)
          return (
            <div key={i} className="flex-1 text-center py-2 border-l border-[#1e1e1e]">
              <div className="text-[10px] text-[#555] uppercase tracking-widest">
                {day.toLocaleDateString('en-US', { weekday: 'short' })}
              </div>
              <div className={`text-sm font-medium mx-auto w-7 h-7 flex items-center justify-center rounded-full
                ${isToday ? 'bg-blue-600 text-white' : 'text-[#888]'}`}>
                {day.getDate()}
              </div>
            </div>
          )
        })}
      </div>

      {/* Scrollable time grid */}
      <div className="flex-1 overflow-y-auto">
        <div className="flex" style={{ height: HOUR_HEIGHT * 24 }}>
          {/* Time gutter */}
          <div className="w-12 shrink-0 relative">
            {HOURS.map(h => (
              <div
                key={h}
                className="absolute right-2 text-[10px] text-[#444] -translate-y-2"
                style={{ top: h * HOUR_HEIGHT }}
              >
                {h === 0 ? '' : h < 12 ? `${h}am` : h === 12 ? '12pm' : `${h - 12}pm`}
              </div>
            ))}
          </div>

          {/* Day columns */}
          {days.map((day, dayIdx) => {
            const dayEvents = events.filter(ev => isSameDay(new Date(ev.start_at), day))
            const laid = layoutEvents(dayEvents)

            return (
              <div
                key={dayIdx}
                ref={dayIdx === 0 ? gridRef : undefined}
                className="flex-1 relative border-l border-[#1e1e1e]"
                style={{ height: HOUR_HEIGHT * 24 }}
                onClick={(e) => {
                  const rect = e.currentTarget.getBoundingClientRect()
                  handleSlotClick(day, e.clientY - rect.top)
                }}
              >
                {/* Hour lines */}
                {HOURS.map(h => (
                  <div
                    key={h}
                    className="absolute inset-x-0 border-t border-[#1e1e1e]"
                    style={{ top: h * HOUR_HEIGHT }}
                  />
                ))}

                {/* Events */}
                {laid.map(ev => {
                  const p = preview.get(ev.id)
                  const startDate = p ? p.start : new Date(ev.start_at)
                  const rawEnd = ev.end_at ? new Date(ev.end_at) : new Date(new Date(ev.start_at).getTime() + 3600000)
                  const endDate = p ? p.end : rawEnd
                  const top = minutesFromMidnight(startDate) * PX_PER_MIN
                  const dur = Math.max(15, (endDate.getTime() - startDate.getTime()) / 60000)
                  const height = dur * PX_PER_MIN
                  const widthPct = 100 / ev.cols
                  const leftPct = ev.col * widthPct
                  const isConflict = conflictIds.has(ev.id)

                  return (
                    <div
                      key={ev.id}
                      className={`absolute rounded overflow-hidden border-l-2 ${eventColorClass(ev.color)} ${eventBorderClass(ev.color)} opacity-90 group
                        ${isConflict ? 'ring-1 ring-amber-400' : ''}`}
                      style={{
                        top,
                        height: Math.max(height, 18),
                        left: `${leftPct + 1}%`,
                        width: `${widthPct - 2}%`,
                        cursor: drag?.eventId === ev.id ? 'grabbing' : 'grab',
                        userSelect: 'none',
                        zIndex: drag?.eventId === ev.id ? 10 : 1,
                      }}
                      onMouseDown={(e) => startMove(ev, e, dayIdx)}
                      onClick={(e) => { e.stopPropagation(); if (!drag) onEventClick(ev) }}
                    >
                      <div className="px-1 py-0.5 text-[10px] text-white font-medium leading-tight truncate pointer-events-none flex items-center gap-0.5">
                        {isConflict && <AlertTriangle size={8} className="text-amber-300 shrink-0" />}
                        {ev.title}
                      </div>
                      <div
                        className="absolute bottom-0 left-0 right-0 h-2 cursor-ns-resize opacity-0 group-hover:opacity-100"
                        onMouseDown={(e) => { e.stopPropagation(); startResize(ev, e) }}
                      />
                    </div>
                  )
                })}
              </div>
            )
          })}
        </div>
      </div>
    </div>
  )
}
