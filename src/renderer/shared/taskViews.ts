import type { Task, TaskStatus } from '../../shared/models'

export type TaskView =
  | { type: 'quick' }
  | { type: 'date'; value: 'today' | 'week' | 'overdue' | 'upcoming' | 'done' | 'all' }
  | { type: 'status'; value: TaskStatus }
  | { type: 'tag'; tagId: string }

export interface TaskGroup {
  id: 'overdue' | 'today' | 'upcoming' | 'done' | 'results' | `week-${number}`
  label: string
  tasks: Task[]
  highlighted?: boolean
}

export interface TaskCounts {
  today: number
  week: number
  upcoming: number
  completed: number
  all: number
  overdue: number
  open: number
  statuses: Record<TaskStatus, number>
  tags: Record<string, number>
}

const OPEN_STATUSES = new Set<TaskStatus>(['todo', 'doing', 'waiting'])

export function getVisibleTasks(tasks: Task[], view: TaskView, now = new Date()): Task[] {
  if (view.type === 'quick') {
    return sortTasksBySchedule(tasks.filter((task) => isOverdue(task, now) || isToday(task, now) || isUpcoming(task, now) || task.status === 'done'))
  }
  if (view.type === 'status') return sortTasksBySchedule(tasks.filter((task) => task.status === view.value))
  if (view.type === 'tag') return sortTasksBySchedule(tasks.filter((task) => task.tagIds.includes(view.tagId)))
  if (view.value === 'today') return sortTasksBySchedule(tasks.filter((task) => isToday(task, now)))
  if (view.value === 'week') return sortTasksBySchedule(tasks.filter((task) => isThisWeek(task, now)))
  if (view.value === 'overdue') return sortTasksBySchedule(tasks.filter((task) => isOverdue(task, now)))
  if (view.value === 'upcoming') return sortTasksBySchedule(tasks.filter((task) => isUpcoming(task, now)))
  if (view.value === 'done') return sortTasksBySchedule(tasks.filter((task) => task.status === 'done'))
  return sortTasksBySchedule(tasks)
}

export function groupTasks(tasks: Task[], view: TaskView, now = new Date()): TaskGroup[] {
  if (view.type === 'date' && view.value === 'week') {
    const { start } = getWeekRange(now)
    const currentWeekday = (now.getDay() + 6) % 7
    return Array.from({ length: 7 }, (_, weekday) => {
      const date = new Date(start)
      date.setDate(start.getDate() + weekday)
      return {
        id: `week-${weekday}` as const,
        label: `${WEEKDAY_LABELS[weekday]} ${formatMonthDay(date)}`,
        tasks: sortTasksBySchedule(tasks.filter((task) => isTaskOnDate(task, date))),
        highlighted: weekday === currentWeekday,
      }
    }).filter((group) => group.tasks.length > 0)
  }
  if (view.type !== 'quick') {
    return [{ id: 'results', label: getViewLabel(view), tasks: getVisibleTasks(tasks, view, now) }]
  }
  return [
    { id: 'overdue', label: '逾期', tasks: sortTasksBySchedule(tasks.filter((task) => isOverdue(task, now))) },
    { id: 'today', label: '今天', tasks: sortTasksBySchedule(tasks.filter((task) => isToday(task, now))) },
    { id: 'upcoming', label: '即将到期', tasks: sortTasksBySchedule(tasks.filter((task) => isUpcoming(task, now))) },
    { id: 'done', label: '已完成', tasks: sortTasksBySchedule(tasks.filter((task) => task.status === 'done')) },
  ]
}

export function sortTasksBySchedule(tasks: Task[]): Task[] {
  return [...tasks].sort((a, b) => {
    const dueA = getDueTime(a)
    const dueB = getDueTime(b)
    if (dueA !== dueB) return dueA - dueB
    return b.createdAt.localeCompare(a.createdAt)
  })
}

export function getTaskCounts(tasks: Task[], now = new Date()): TaskCounts {
  const statuses: Record<TaskStatus, number> = { todo: 0, doing: 0, done: 0, cancelled: 0, waiting: 0 }
  const tags: Record<string, number> = {}
  let today = 0
  let week = 0
  let upcoming = 0
  let overdue = 0

  for (const task of tasks) {
    statuses[task.status] += 1
    if (isToday(task, now)) today += 1
    if (isThisWeek(task, now)) week += 1
    if (isUpcoming(task, now)) upcoming += 1
    if (isOverdue(task, now)) overdue += 1
    task.tagIds.forEach((tagId) => { tags[tagId] = (tags[tagId] ?? 0) + 1 })
  }
  return {
    today,
    week,
    upcoming,
    completed: statuses.done,
    all: tasks.length,
    overdue,
    open: statuses.todo + statuses.doing + statuses.waiting,
    statuses,
    tags,
  }
}

export function isOverdue(task: Task, now = new Date()): boolean {
  const due = parseDate(task.dueDate)
  return Boolean(due && due < startOfDay(now) && OPEN_STATUSES.has(task.status))
}

function isToday(task: Task, now: Date): boolean {
  return isTaskOnDate(task, startOfDay(now))
}

function isThisWeek(task: Task, now: Date): boolean {
  const due = parseDate(task.dueDate)
  const { start, end } = getWeekRange(now)
  return Boolean(due && due >= start && due <= end && OPEN_STATUSES.has(task.status))
}

function isTaskOnDate(task: Task, date: Date): boolean {
  const due = parseDate(task.dueDate)
  return Boolean(due && due.getTime() === startOfDay(date).getTime() && OPEN_STATUSES.has(task.status))
}

function isUpcoming(task: Task, now: Date): boolean {
  const due = parseDate(task.dueDate)
  return Boolean(due && due > startOfDay(now) && OPEN_STATUSES.has(task.status))
}

function parseDate(value?: string): Date | null {
  if (!value) return null
  const [year, month, day] = value.slice(0, 10).split('-').map(Number)
  return year && month && day ? new Date(year, month - 1, day) : null
}

function getDueTime(task: Task): number {
  return parseDate(task.dueDate)?.getTime() ?? Number.MAX_SAFE_INTEGER
}

function startOfDay(value: Date): Date {
  return new Date(value.getFullYear(), value.getMonth(), value.getDate())
}

function getViewLabel(view: Exclude<TaskView, { type: 'quick' }>): string {
  if (view.type === 'tag') return '标签任务'
  if (view.type === 'status') return '状态任务'
  return { today: '今天', week: '本周', overdue: '逾期', upcoming: '即将到期', done: '已完成', all: '全部任务' }[view.value]
}

const WEEKDAY_LABELS = ['周一', '周二', '周三', '周四', '周五', '周六', '周日']

function getWeekRange(now: Date): { start: Date; end: Date } {
  const start = startOfDay(now)
  const weekday = (start.getDay() + 6) % 7
  start.setDate(start.getDate() - weekday)
  const end = new Date(start)
  end.setDate(start.getDate() + 6)
  return { start, end }
}

function formatMonthDay(date: Date): string {
  return `${String(date.getMonth() + 1).padStart(2, '0')}/${String(date.getDate()).padStart(2, '0')}`
}
