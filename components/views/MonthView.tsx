'use client'

import { useMemo, useState } from 'react'
import { eventColorClass, type CalendarEvent } from '@/lib/types'

const DAYS = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat']
const MAX_VISIBLE = 3

type Props = {
  currentDate: Date
  events: CalendarEvent[]
  onDayClick: (date: Date) => void
  onEventClick: (event: CalendarEvent) => void
  onEventDrop: (eventId: string, newDate: Date) => void
}

function startOfMonth(d: Date) {
  return new Date(d.getFullYear(), d.getMonth(), 1)
}

function buildGrid(date: Date): Date[] {
  const first = startOfMonth(date)
  const startDow = first.getDay()
  const days: Date[] = []

  for (let i = 0; i < startDow; i++) {
    const d = new Date(first)
    d.setDate(d.getDate() - (startDow - i))
    days.push(d)
  }

  const daysInMonth = new Date(date.getFullYear(), date.getMonth() + 1, 0).getDate()
  for (let i = 1; i <= daysInMonth; i++) {
    days.push(new Date(date.getFullYear(), date.getMonth(), i))
  }

  while (days.length % 7 !== 0) {
    const last = days[days.length - 1]
    const d = new Date(last)
    d.setDate(d.getDate() + 1)
    days.push(d)
  }

  return days
}

function isSameDay(a: Date, b: Date) {
  return a.getFullYear() === b.getFullYear() &&
    a.getMonth() === b.getMonth() &&
    a.getDate() === b.getDate()
}

function isCurrentMonth(d: Date, ref: Date) {
  return d.getMonth() === ref.getMonth() && d.getFullYear() === ref.getFullYear()
}

export default function MonthView({ currentDate, events, onDayClick, onEventClick, onEventDrop }: Props) {
  const grid = useMemo(() => buildGrid(currentDate), [currentDate])
  const today = new Date()
  const [dragOverDate, setDragOverDate] = useState<string | null>(null)

  function eventsForDay(day: Date): CalendarEvent[] {
    return events.filter(ev => isSameDay(new Date(ev.start_at), day))
      .sort((a, b) => a.start_at.localeCompare(b.start_at))
  }

  function handleDragStart(e: React.DragEvent, eventId: string) {
    e.dataTransfer.setData('text/plain', eventId)
    e.dataTransfer.effectAllowed = 'move'
  }

  function handleDrop(e: React.DragEvent, day: Date) {
    e.preventDefault()
    const eventId = e.dataTransfer.getData('text/plain')
    setDragOverDate(null)
    onEventDrop(eventId, day)
  }

  function handleDragOver(e: React.DragEvent, dateStr: string) {
    e.preventDefault()
    e.dataTransfer.dropEffect = 'move'
    setDragOverDate(dateStr)
  }

  return (
    <div className="flex flex-col h-full select-none">
      {/* Day headers */}
      <div className="grid grid-cols-7 border-b border-[#242424]">
        {DAYS.map(d => (
          <div key={d} className="py-2 text-center text-[10px] font-medium tracking-widest text-[#555] uppercase">
            {d}
          </div>
        ))}
      </div>

      {/* Grid */}
      <div className="flex-1 grid grid-cols-7" style={{ gridTemplateRows: `repeat(${grid.length / 7}, 1fr)` }}>
        {grid.map((day, i) => {
          const dayEvents = eventsForDay(day)
          const inMonth = isCurrentMonth(day, currentDate)
          const isToday = isSameDay(day, today)
          const dateStr = day.toISOString().slice(0, 10)
          const isDragTarget = dragOverDate === dateStr

          return (
            <div
              key={i}
              className={`min-h-0 border-b border-r border-[#1e1e1e] p-1 cursor-pointer transition-colors
                ${isDragTarget ? 'bg-[#1a1f2e]' : 'hover:bg-[#141414]'}`}
              onClick={() => onDayClick(day)}
              onDragOver={(e) => handleDragOver(e, dateStr)}
              onDragLeave={() => setDragOverDate(null)}
              onDrop={(e) => handleDrop(e, day)}
            >
              {/* Date number */}
              <div className="flex justify-end mb-0.5">
                <span className={`text-[11px] w-5 h-5 flex items-center justify-center rounded-full font-medium
                  ${isToday ? 'bg-blue-600 text-white' : inMonth ? 'text-[#888]' : 'text-[#333]'}`}>
                  {day.getDate()}
                </span>
              </div>

              {/* Events */}
              <div className="space-y-0.5">
                {dayEvents.slice(0, MAX_VISIBLE).map(ev => (
                  <div
                    key={ev.id}
                    draggable
                    onDragStart={(e) => { e.stopPropagation(); handleDragStart(e, ev.id) }}
                    onClick={(e) => { e.stopPropagation(); onEventClick(ev) }}
                    className={`truncate text-[10px] px-1.5 py-0.5 rounded text-white cursor-grab active:cursor-grabbing ${eventColorClass(ev.color)}`}
                  >
                    {ev.title}
                  </div>
                ))}
                {dayEvents.length > MAX_VISIBLE && (
                  <div className="text-[10px] text-[#555] px-1">
                    +{dayEvents.length - MAX_VISIBLE} more
                  </div>
                )}
              </div>
            </div>
          )
        })}
      </div>
    </div>
  )
}
