'use client'

import { useRef, useState } from 'react'
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

export default function DayView({ currentDate, events, conflictIds, onSlotClick, onEventClick, onEventChange }: Props) {
  const containerRef = useRef<HTMLDivElement>(null)
  const dayEvents = events.filter(ev => isSameDay(new Date(ev.start_at), currentDate))
  const laid = layoutEvents(dayEvents)
  const today = new Date()
  const isToday = isSameDay(currentDate, today)

  type DragOp =
    | { type: 'move'; eventId: string; origStart: Date; origEnd: Date; startY: number }
    | { type: 'resize'; eventId: string; origEnd: Date; startY: number }

  const [drag, setDrag] = useState<DragOp | null>(null)
  const [preview, setPreview] = useState<Map<string, { start: Date; end: Date }>>(new Map())

  function handleMouseMove(e: React.MouseEvent) {
    if (!drag) return
    const deltaMin = snap((e.clientY - drag.startY) / PX_PER_MIN)

    if (drag.type === 'resize') {
      const newEnd = new Date(drag.origEnd.getTime() + deltaMin * 60000)
      const origEv = events.find(ev => ev.id === drag.eventId)
      if (!origEv) return
      const minEnd = new Date(origEv.start_at).getTime() + 15 * 60000
      if (newEnd.getTime() >= minEnd) {
        setPreview(new Map([[drag.eventId, { start: new Date(origEv.start_at), end: newEnd }]]))
      }
    } else {
      const newStart = new Date(drag.origStart.getTime() + deltaMin * 60000)
      const dur = drag.origEnd.getTime() - drag.origStart.getTime()
      setPreview(new Map([[drag.eventId, { start: newStart, end: new Date(newStart.getTime() + dur) }]]))
    }
  }

  function handleMouseUp() {
    if (!drag) return
    const p = preview.get(drag.eventId)
    if (p) onEventChange(drag.eventId, p.start, p.end)
    setDrag(null)
    setPreview(new Map())
  }

  return (
    <div
      className="flex flex-col h-full overflow-hidden"
      onMouseMove={handleMouseMove}
      onMouseUp={handleMouseUp}
      onMouseLeave={handleMouseUp}
    >
      {/* Day header */}
      <div className="flex items-center gap-3 px-4 py-3 border-b border-[#242424] shrink-0">
        <div className={`text-2xl font-semibold ${isToday ? 'text-blue-400' : 'text-[#e8e8e8]'}`}>
          {currentDate.getDate()}
        </div>
        <div>
          <div className="text-xs text-[#555] uppercase tracking-widest">
            {currentDate.toLocaleDateString('en-US', { weekday: 'long' })}
          </div>
          <div className="text-xs text-[#444]">
            {currentDate.toLocaleDateString('en-US', { month: 'long', year: 'numeric' })}
          </div>
        </div>
      </div>

      {/* Scrollable grid */}
      <div className="flex-1 overflow-y-auto">
        <div className="flex" style={{ height: HOUR_HEIGHT * 24 }}>
          {/* Time gutter */}
          <div className="w-14 shrink-0 relative">
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

          {/* Event column */}
          <div
            ref={containerRef}
            className="flex-1 relative border-l border-[#1e1e1e]"
            onClick={(e) => {
              if (drag) return
              const rect = e.currentTarget.getBoundingClientRect()
              const minutes = snap(Math.max(0, (e.clientY - rect.top) / PX_PER_MIN))
              const start = new Date(currentDate)
              start.setHours(Math.floor(minutes / 60), minutes % 60, 0, 0)
              onSlotClick(start)
            }}
          >
            {HOURS.map(h => (
              <div
                key={h}
                className="absolute inset-x-0 border-t border-[#1e1e1e]"
                style={{ top: h * HOUR_HEIGHT }}
              />
            ))}

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
                  onMouseDown={(e) => {
                    e.stopPropagation()
                    const origEnd = ev.end_at ? new Date(ev.end_at) : rawEnd
                    setDrag({ type: 'move', eventId: ev.id, origStart: new Date(ev.start_at), origEnd, startY: e.clientY })
                  }}
                  onClick={(e) => { e.stopPropagation(); if (!drag) onEventClick(ev) }}
                >
                  <div className="px-1 py-0.5 text-[10px] text-white font-medium leading-tight truncate pointer-events-none flex items-center gap-0.5">
                    {isConflict && <AlertTriangle size={8} className="text-amber-300 shrink-0" />}
                    {ev.title}
                  </div>
                  <div
                    className="absolute bottom-0 left-0 right-0 h-2 cursor-ns-resize opacity-0 group-hover:opacity-100"
                    onMouseDown={(e) => {
                      e.stopPropagation()
                      const origEnd = ev.end_at ? new Date(ev.end_at) : rawEnd
                      setDrag({ type: 'resize', eventId: ev.id, origEnd, startY: e.clientY })
                    }}
                  />
                </div>
              )
            })}
          </div>
        </div>
      </div>
    </div>
  )
}
