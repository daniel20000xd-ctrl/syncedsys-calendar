export type CalendarEvent = {
  id: string
  user_id: string
  title: string
  description: string | null
  start_at: string
  end_at: string
  all_day: boolean
  color: string | null
  created_at: string
  updated_at: string
}

export type EventInput = {
  title: string
  description?: string
  start_at: string
  end_at: string
  all_day?: boolean
  color?: string
}

export type ViewMode = 'month' | 'week' | 'day'

export const EVENT_COLORS = [
  { value: 'blue',   label: 'Blue',   bg: 'bg-blue-600',   border: 'border-blue-500'   },
  { value: 'green',  label: 'Green',  bg: 'bg-green-600',  border: 'border-green-500'  },
  { value: 'red',    label: 'Red',    bg: 'bg-red-600',    border: 'border-red-500'    },
  { value: 'yellow', label: 'Yellow', bg: 'bg-yellow-500', border: 'border-yellow-400' },
  { value: 'purple', label: 'Purple', bg: 'bg-purple-600', border: 'border-purple-500' },
  { value: 'orange', label: 'Orange', bg: 'bg-orange-500', border: 'border-orange-400' },
  { value: 'indigo', label: 'Indigo', bg: 'bg-indigo-600', border: 'border-indigo-500' },
] as const

export function eventColorClass(color: string | null | undefined): string {
  const found = EVENT_COLORS.find(c => c.value === color)
  return found ? found.bg : 'bg-blue-600'
}

export function eventBorderClass(color: string | null | undefined): string {
  const found = EVENT_COLORS.find(c => c.value === color)
  return found ? found.border : 'border-blue-500'
}
