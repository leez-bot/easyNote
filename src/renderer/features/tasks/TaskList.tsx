import { Checkbox, Dropdown, Tooltip, type MenuProps } from 'antd'
import {
  CheckCircle2,
  ChevronDown,
  CirclePause,
  Flag,
  ListTodo,
  Paperclip,
  Pin,
  Timer,
  Trash2,
  XCircle,
} from 'lucide-react'
import { useEffect, useMemo, useState } from 'react'
import type { Task, TaskStatus } from '../../../shared/models'
import { groupTasks, isOverdue, type TaskView } from '../../shared/taskViews'
import { useTaskStore } from '../../store/taskStore'
import { QuickCapture } from './QuickCapture'

const TASK_ORDER_STORAGE_KEY = 'easyNote.taskOrders.v1'

const statusOptions: Array<{ value: TaskStatus; label: string; icon: JSX.Element }> = [
  { value: 'todo', label: '待办', icon: <ListTodo size={14} /> },
  { value: 'doing', label: '进行中', icon: <Timer size={14} /> },
  { value: 'done', label: '已办', icon: <CheckCircle2 size={14} /> },
  { value: 'cancelled', label: '已取消', icon: <XCircle size={14} /> },
  { value: 'waiting', label: '正在等待', icon: <CirclePause size={14} /> },
]

interface DragState {
  groupId: string
  taskId: string
}

export function TaskList(): JSX.Element {
  const tasks = useTaskStore((state) => state.tasks)
  const tags = useTaskStore((state) => state.tags)
  const workspace = useTaskStore((state) => state.workspace)
  const activeView = useTaskStore((state) => state.activeView)
  const selectedTaskId = useTaskStore((state) => state.selectedTaskId)
  const selectTask = useTaskStore((state) => state.selectTask)
  const setTaskStatus = useTaskStore((state) => state.setTaskStatus)
  const removeTask = useTaskStore((state) => state.removeTask)
  const [collapsed, setCollapsed] = useState<Record<string, boolean>>({})
  const [taskOrders, setTaskOrders] = useState<Record<string, string[]>>(() => readTaskOrders())
  const [dragState, setDragState] = useState<DragState | null>(null)
  const groups = useMemo(() => groupTasks(tasks, activeView), [activeView, tasks])
  const tagMap = useMemo(() => new Map(tags.map((tag) => [tag.id, tag])), [tags])
  const viewKey = useMemo(() => getViewOrderKey(activeView), [activeView])
  const workspaceId = workspace?.id ?? 'default'
  const orderedGroups = useMemo(
    () => groups.map((group) => ({
      ...group,
      tasks: applySavedOrder(group.tasks, taskOrders[getOrderKey(workspaceId, viewKey, group.id)]),
    })),
    [groups, taskOrders, viewKey, workspaceId],
  )

  useEffect(() => {
    localStorage.setItem(TASK_ORDER_STORAGE_KEY, JSON.stringify(taskOrders))
  }, [taskOrders])

  useEffect(() => {
    if (!selectedTaskId) return
    document.querySelector(`[data-task-id="${selectedTaskId}"]`)?.scrollIntoView({ block: 'nearest' })
  }, [selectedTaskId])

  const moveTaskInGroup = (groupId: string, targetTaskId: string, currentTasks: Task[]): void => {
    if (!dragState || dragState.groupId !== groupId || dragState.taskId === targetTaskId) return
    const fromIndex = currentTasks.findIndex((task) => task.id === dragState.taskId)
    const toIndex = currentTasks.findIndex((task) => task.id === targetTaskId)
    if (fromIndex < 0 || toIndex < 0) return

    const nextTasks = [...currentTasks]
    const [movedTask] = nextTasks.splice(fromIndex, 1)
    nextTasks.splice(toIndex, 0, movedTask)
    const orderKey = getOrderKey(workspaceId, viewKey, groupId)
    setTaskOrders((current) => ({ ...current, [orderKey]: nextTasks.map((task) => task.id) }))
    setDragState(null)
  }

  return (
    <section className="task-list-pane" aria-label="任务列表">
      {activeView.type === 'quick' ? <QuickCapture /> : null}
      <div className="task-groups">
        {orderedGroups.map((group) => group.tasks.length > 0 ? (
          <section className="task-group" key={group.id}>
            <button className="task-group-title" type="button" onClick={() => setCollapsed((value) => ({ ...value, [group.id]: !value[group.id] }))}>
              <ChevronDown className={collapsed[group.id] ? 'collapsed' : ''} size={15} />
              <span>{group.label}</span><small>{group.tasks.length}</small>
            </button>
            {!collapsed[group.id] ? group.tasks.map((task) => {
              const taskTags = task.tagIds.map((tagId) => tagMap.get(tagId)).filter((tag): tag is NonNullable<typeof tag> => Boolean(tag))
              const firstTag = taskTags[0]
              const moreTags = taskTags.slice(1)
              const menuItems: MenuProps['items'] = [
                {
                  key: 'status',
                  label: '变更状态',
                  children: statusOptions.map((status) => ({
                    key: `status:${status.value}`,
                    icon: status.icon,
                    label: status.label,
                    disabled: task.status === status.value,
                    onClick: () => void setTaskStatus(task.id, status.value),
                  })),
                },
                { type: 'divider' },
                {
                  key: 'delete',
                  danger: true,
                  icon: <Trash2 size={14} />,
                  label: '删除',
                  onClick: () => void removeTask(task.id),
                },
              ]

              return (
                <Dropdown key={task.id} trigger={['contextMenu']} menu={{ items: menuItems }} destroyPopupOnHide>
                  <button
                    className={`compact-task-row ${task.id === selectedTaskId ? 'selected' : ''} ${task.status === 'done' ? 'done' : ''} ${dragState?.taskId === task.id ? 'dragging' : ''}`}
                    type="button"
                    draggable
                    data-task-id={task.id}
                    onClick={() => selectTask(task.id)}
                    onContextMenu={() => selectTask(task.id)}
                    onDragStart={(event) => {
                      event.dataTransfer.effectAllowed = 'move'
                      event.dataTransfer.setData('text/plain', task.id)
                      setDragState({ groupId: group.id, taskId: task.id })
                      selectTask(task.id)
                    }}
                    onDragOver={(event) => {
                      if (dragState?.groupId === group.id) event.preventDefault()
                    }}
                    onDrop={(event) => {
                      event.preventDefault()
                      moveTaskInGroup(group.id, task.id, group.tasks)
                    }}
                    onDragEnd={() => setDragState(null)}
                  >
                    <Checkbox
                      checked={task.status === 'done'}
                      onClick={(event) => event.stopPropagation()}
                      onChange={(event) => void setTaskStatus(task.id, event.target.checked ? 'done' : 'todo')}
                    />
                    <Tooltip title={task.title} mouseEnterDelay={0.35}>
                      <span className="compact-task-title">{task.title}</span>
                    </Tooltip>
                    {firstTag ? (
                      <span className="task-tag-cell">
                        <Tooltip title={firstTag.name} mouseEnterDelay={0.35}>
                          <span className="task-tag" style={{ color: firstTag.color, backgroundColor: `${firstTag.color}12` }}>{firstTag.name}</span>
                        </Tooltip>
                        {moreTags.length > 0 ? (
                          <Tooltip title={taskTags.map((tag) => tag.name).join('、')}>
                            <span className="task-tag-more">+{moreTags.length}</span>
                          </Tooltip>
                        ) : null}
                      </span>
                    ) : <span />}
                    <span className="compact-task-time">{formatTaskTime(task)}</span>
                    <span className="task-row-icons">
                      {task.priority === 'high' || isOverdue(task) ? <Flag size={14} className="danger-icon" fill="currentColor" /> : null}
                      {task.attachments.length > 0 ? <Paperclip size={14} /> : null}
                      {task.pinned ? <Pin size={14} /> : null}
                    </span>
                  </button>
                </Dropdown>
              )
            }) : null}
          </section>
        ) : null)}
        {orderedGroups.every((group) => group.tasks.length === 0) ? <div className="empty-state">当前视图暂无任务</div> : null}
      </div>
      <div className="task-list-total">{orderedGroups.reduce((total, group) => total + group.tasks.length, 0)} 项任务</div>
    </section>
  )
}

function applySavedOrder(tasks: Task[], order: string[] = []): Task[] {
  if (order.length === 0) return tasks
  const taskMap = new Map(tasks.map((task) => [task.id, task]))
  const orderedTasks = order.map((id) => taskMap.get(id)).filter((task): task is Task => Boolean(task))
  const orderedIds = new Set(orderedTasks.map((task) => task.id))
  return [...orderedTasks, ...tasks.filter((task) => !orderedIds.has(task.id))]
}

function getOrderKey(workspaceId: string, viewKey: string, groupId: string): string {
  return `${workspaceId}:${viewKey}:${groupId}`
}

function getViewOrderKey(view: TaskView): string {
  if (view.type === 'quick') return 'quick'
  if (view.type === 'tag') return `tag:${view.tagId}`
  return `${view.type}:${view.value}`
}

function readTaskOrders(): Record<string, string[]> {
  try {
    const parsed = JSON.parse(localStorage.getItem(TASK_ORDER_STORAGE_KEY) ?? '{}')
    return parsed && typeof parsed === 'object' && !Array.isArray(parsed) ? parsed as Record<string, string[]> : {}
  } catch {
    return {}
  }
}

function formatTaskTime(task: Task): string {
  if (!task.dueDate) return '无日期'
  const today = new Date().toISOString().slice(0, 10)
  if (task.dueDate === today) return new Date(task.updatedAt).toLocaleTimeString('zh-CN', { hour: '2-digit', minute: '2-digit' })
  return task.dueDate.slice(5).replace('-', '/')
}
