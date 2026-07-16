import type { Task } from '../../shared/models'

export type DateFilter = 'inbox' | 'today' | 'week' | 'overdue' | 'all'

function toLocalDateKey(date: Date): string {
  const year = date.getFullYear()
  const month = String(date.getMonth() + 1).padStart(2, '0')
  const day = String(date.getDate()).padStart(2, '0')
  return `${year}-${month}-${day}`
}

function parseLocalDate(value?: string): Date | null {
  if (!value) {
    return null
  }

  const [year, month, day] = value.slice(0, 10).split('-').map(Number)
  if (!year || !month || !day) {
    return null
  }

  return new Date(year, month - 1, day)
}

function getWeekRange(now: Date): { start: Date; end: Date } {
  const start = new Date(now.getFullYear(), now.getMonth(), now.getDate())
  const day = start.getDay()
  const mondayOffset = day === 0 ? -6 : 1 - day
  start.setDate(start.getDate() + mondayOffset)

  const end = new Date(start)
  end.setDate(start.getDate() + 6)

  return { start, end }
}

export function todayAsLocalDateString(now = new Date()): string {
  return toLocalDateKey(now)
}

export function isTaskInDateFilter(task: Task, filter: DateFilter, now = new Date()): boolean {
  if (filter === 'all') {
    return true
  }

  const dueDate = parseLocalDate(task.dueDate)

  if (filter === 'inbox') {
    return !dueDate
  }

  if (!dueDate) {
    return false
  }

  const today = new Date(now.getFullYear(), now.getMonth(), now.getDate())

  if (filter === 'today') {
    return toLocalDateKey(dueDate) === toLocalDateKey(today)
  }

  if (filter === 'overdue') {
    return dueDate < today && task.status !== 'done' && task.status !== 'cancelled'
  }

  const { start, end } = getWeekRange(now)
  return dueDate >= start && dueDate <= end
}
