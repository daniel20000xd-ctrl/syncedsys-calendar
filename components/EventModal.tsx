'use client'

import { useRef, useEffect, useState, useTransition } from 'react'
import { X, Trash2 } from 'lucide-react'
import { createEvent, updateEvent, deleteEvent } from '@/app/actions/events'
import { EVENT_COLORS, type CalendarEvent } from '@/lib/types'

type Props = {
  mode: 'create' | 'edit'
  initialStart: Date
  initialEnd: Date | null
  event?: CalendarEvent
  onClose: () => void
  onSaved: () => void
}

function toLocalInput(d: Date): string {
  const pad = (n: number) => String(n).padStart(2, '0')
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}T${pad(d.getHours())}:${pad(d.getMinutes())}`
}

export default function EventModal({ mode, initialStart, initialEnd, event, onClose, onSaved }: Props) {
  const overlayRef = useRef<HTMLDivElement>(null)
  const [isPending, startTransition] = useTransition()
  const [isDeleting, startDeleteTransition] = useTransition()

  const [title, setTitle] = useState(event?.title ?? '')
  const [description, setDescription] = useState(event?.description ?? '')
  const [startStr, setStartStr] = useState(toLocalInput(event ? new Date(event.start_at) : initialStart))
  const endDefault = event?.end_at ? new Date(event.end_at) : initialEnd ?? new Date(initialStart.getTime() + 3600000)
  const [endStr, setEndStr] = useState(toLocalInput(endDefault))
  const [allDay, setAllDay] = useState(event?.all_day ?? false)
  const [color, setColor] = useState(event?.color ?? 'blue')
  const [error, setError] = useState('')

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => { if (e.key === 'Escape') onClose() }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [onClose])

  function handleOverlayClick(e: React.MouseEvent) {
    if (e.target === overlayRef.current) onClose()
  }

  function handleSave() {
    if (!title.trim()) { setError('Title is required'); return }
    setError('')

    const startDate = new Date(startStr)
    const endDate = endStr ? new Date(endStr) : null
    if (endDate && endDate <= startDate) { setError('End must be after start'); return }

    startTransition(async () => {
      try {
        const payload = {
          title: title.trim(),
          description: description.trim() || undefined,
          start_at: startDate.toISOString(),
          end_at: endDate?.toISOString(),
          all_day: allDay,
          color,
        }
        if (mode === 'create') {
          await createEvent(payload)
        } else {
          await updateEvent(event!.id, payload)
        }
        onSaved()
      } catch (e) {
        setError(e instanceof Error ? e.message : 'Failed to save')
      }
    })
  }

  function handleDelete() {
    if (!event) return
    startDeleteTransition(async () => {
      try {
        await deleteEvent(event.id)
        onSaved()
      } catch (e) {
        setError(e instanceof Error ? e.message : 'Failed to delete')
      }
    })
  }

  return (
    <div
      ref={overlayRef}
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-sm"
      onClick={handleOverlayClick}
    >
      <div className="w-full max-w-md mx-4 rounded-xl border border-[#242424] bg-[#111] shadow-2xl">
        {/* Header */}
        <div className="flex items-center justify-between px-5 py-4 border-b border-[#242424]">
          <h2 className="text-sm font-semibold text-[#e8e8e8]">
            {mode === 'create' ? 'New event' : 'Edit event'}
          </h2>
          <button onClick={onClose} className="text-[#555] hover:text-[#e8e8e8] transition-colors">
            <X size={16} />
          </button>
        </div>

        {/* Body */}
        <div className="px-5 py-4 space-y-4">
          {/* Title */}
          <div>
            <input
              autoFocus
              type="text"
              placeholder="Event title"
              value={title}
              onChange={e => setTitle(e.target.value)}
              onKeyDown={e => { if (e.key === 'Enter') handleSave() }}
              className="w-full bg-transparent text-[#e8e8e8] placeholder-[#444] text-base font-medium outline-none border-b border-[#242424] pb-2 focus:border-[#3b82f6] transition-colors"
            />
          </div>

          {/* All day toggle */}
          <div className="flex items-center gap-2">
            <button
              type="button"
              onClick={() => setAllDay(v => !v)}
              className={`w-9 h-5 rounded-full transition-colors flex items-center ${allDay ? 'bg-blue-600' : 'bg-[#242424]'}`}
            >
              <span className={`w-3.5 h-3.5 bg-white rounded-full shadow transition-transform mx-0.5 ${allDay ? 'translate-x-4' : 'translate-x-0'}`} />
            </button>
            <span className="text-xs text-[#888]">All day</span>
          </div>

          {/* Times */}
          {!allDay && (
            <div className="grid grid-cols-2 gap-3">
              <div>
                <label className="block text-[10px] uppercase tracking-wider text-[#555] mb-1">Start</label>
                <input
                  type="datetime-local"
                  value={startStr}
                  onChange={e => setStartStr(e.target.value)}
                  className="w-full bg-[#1a1a1a] border border-[#242424] rounded-lg px-3 py-2 text-xs text-[#e8e8e8] outline-none focus:border-[#3b82f6] transition-colors"
                />
              </div>
              <div>
                <label className="block text-[10px] uppercase tracking-wider text-[#555] mb-1">End</label>
                <input
                  type="datetime-local"
                  value={endStr}
                  onChange={e => setEndStr(e.target.value)}
                  className="w-full bg-[#1a1a1a] border border-[#242424] rounded-lg px-3 py-2 text-xs text-[#e8e8e8] outline-none focus:border-[#3b82f6] transition-colors"
                />
              </div>
            </div>
          )}

          {/* Description */}
          <div>
            <textarea
              placeholder="Description (optional)"
              value={description}
              onChange={e => setDescription(e.target.value)}
              rows={2}
              className="w-full bg-[#1a1a1a] border border-[#242424] rounded-lg px-3 py-2 text-xs text-[#e8e8e8] placeholder-[#444] outline-none focus:border-[#3b82f6] transition-colors resize-none"
            />
          </div>

          {/* Color */}
          <div>
            <label className="block text-[10px] uppercase tracking-wider text-[#555] mb-2">Color</label>
            <div className="flex gap-2 flex-wrap">
              {EVENT_COLORS.map(c => (
                <button
                  key={c.value}
                  type="button"
                  onClick={() => setColor(c.value)}
                  className={`w-6 h-6 rounded-full ${c.bg} transition-transform ${color === c.value ? 'ring-2 ring-white ring-offset-1 ring-offset-[#111] scale-110' : 'opacity-60 hover:opacity-100'}`}
                  title={c.label}
                />
              ))}
            </div>
          </div>

          {error && <p className="text-red-400 text-xs">{error}</p>}
        </div>

        {/* Footer */}
        <div className="flex items-center justify-between px-5 py-4 border-t border-[#242424]">
          <div>
            {mode === 'edit' && (
              <button
                onClick={handleDelete}
                disabled={isDeleting}
                className="flex items-center gap-1.5 text-xs text-red-400 hover:text-red-300 transition-colors disabled:opacity-50"
              >
                <Trash2 size={13} />
                {isDeleting ? 'Deleting…' : 'Delete'}
              </button>
            )}
          </div>
          <div className="flex items-center gap-2">
            <button
              onClick={onClose}
              className="px-4 py-1.5 text-xs text-[#888] hover:text-[#e8e8e8] transition-colors"
            >
              Cancel
            </button>
            <button
              onClick={handleSave}
              disabled={isPending}
              className="px-4 py-1.5 text-xs bg-blue-600 hover:bg-blue-500 text-white rounded-lg transition-colors disabled:opacity-50"
            >
              {isPending ? 'Saving…' : mode === 'create' ? 'Create' : 'Save'}
            </button>
          </div>
        </div>
      </div>
    </div>
  )
}
