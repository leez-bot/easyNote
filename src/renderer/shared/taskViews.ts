import type { Task, TaskStatus } from '../../shared/models'

export type TaskView =
  | { type: 'quick' }
  | { type: 'date'; value: 'today' | 'overdue' | 'upcoming' | 'done' | 'all' }
  | { type: 'status'; value: TaskStatus }
  | { type: 'tag'; tagId: string }

export interface TaskGroup {
  id: 'overdue' | 'today' | 'upcoming' | 'done' | 'results'
  label: string
  tasks: Task[]
}

export interface TaskCounts {
  today: number
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
  if (view.value === 'overdue') return sortTasksBySchedule(tasks.filter((task) => isOverdue(task, now)))
  if (view.value === 'upcoming') return sortTasksBySchedule(tasks.filter((task) => isUpcoming(task, now)))
  if (view.value === 'done') return sortTasksBySchedule(tasks.filter((task) => task.status === 'done'))
  return sortTasksBySchedule(tasks)
}

export function groupTasks(tasks: Task[], view: TaskView, now = new Date()): TaskGroup[] {
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
  let upcoming = 0
  let overdue = 0

  for (const task of tasks) {
    statuses[task.status] += 1
    if (isToday(task, now)) today += 1
    if (isUpcoming(task, now)) upcoming += 1
    if (isOverdue(task, now)) overdue += 1
    task.tagIds.forEach((tagId) => { tags[tagId] = (tags[tagId] ?? 0) + 1 })
  }
  return {
    today,
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
  const due = parseDate(task.dueDate)
  return Boolean(due && due.getTime() === startOfDay(now).getTime() && task.status !== 'done' && task.status !== 'cancelled')
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
  return { today: '今天', overdue: '逾期', upcoming: '即将到期', done: '已完成', all: '全部任务' }[view.value]
}
