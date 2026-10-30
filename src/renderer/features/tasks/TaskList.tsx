import { Checkbox, DatePicker, Dropdown, Input, Popconfirm, Popover, Tooltip, type InputRef, type MenuProps } from 'antd'
import dayjs, { type Dayjs } from 'dayjs'
import {
  CheckCircle2,
  CalendarDays,
  ChevronDown,
  CirclePause,
  Flag,
  ListChecks,
  ListTodo,
  Paperclip,
  Pin,
  Search,
  Timer,
  Trash2,
  XCircle,
} from 'lucide-react'
import { useEffect, useMemo, useRef, useState } from 'react'
import type { BatchTaskPatch, Task, TaskPriority, TaskStatus } from '../../../shared/models'
import { groupTasks, type TaskView } from '../../shared/taskViews'
import { todayAsLocalDateString } from '../../shared/date'
import { getDocumentText } from '../../shared/editor'
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

const priorityOptions: Array<{ value: TaskPriority; label: string }> = [
  { value: 'none', label: '无' },
  { value: 'low', label: '低' },
  { value: 'medium', label: '中' },
  { value: 'high', label: '高' },
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
  const batchUpdateTasks = useTaskStore((state) => state.batchUpdateTasks)
  const batchRemoveTasks = useTaskStore((state) => state.batchRemoveTasks)
  const removeTask = useTaskStore((state) => state.removeTask)
  const dateRevision = useTaskStore((state) => state.dateRevision)
  const [collapsed, setCollapsed] = useState<Record<string, boolean>>({})
  const [dateRange, setDateRange] = useState<[Dayjs, Dayjs] | null>(null)
  const [searchKeyword, setSearchKeyword] = useState('')
  const [searchOpen, setSearchOpen] = useState(false)
  const searchInputRef = useRef<InputRef>(null)
  const searchTriggerRef = useRef<HTMLButtonElement>(null)
  const [taskOrders, setTaskOrders] = useState<Record<string, string[]>>(() => readTaskOrders())
  const [dragState, setDragState] = useState<DragState | null>(null)
  const [batchMode, setBatchMode] = useState(false)
  const [batchSelected, setBatchSelected] = useState<Set<string>>(new Set())

  const exitBatch = (): void => {
    setBatchMode(false)
    setBatchSelected(new Set())
  }

  const toggleBatchTask = (taskId: string): void => {
    setBatchSelected((current) => {
      const next = new Set(current)
      if (next.has(taskId)) next.delete(taskId)
      else next.add(taskId)
      return next
    })
  }

  const runBatchAction = async (patch: BatchTaskPatch): Promise<void> => {
    const ids = [...batchSelected]
    if (ids.length === 0) return
    const succeeded = await batchUpdateTasks(ids, patch)
    if (succeeded) exitBatch()
  }

  const runBatchDelete = async (): Promise<void> => {
    const ids = [...batchSelected]
    if (ids.length === 0) return
    const succeeded = await batchRemoveTasks(ids)
    if (succeeded) exitBatch()
  }
  const groups = useMemo(() => groupTasks(tasks, activeView), [activeView, dateRevision, tasks])
  const tagMap = useMemo(() => new Map(tags.map((tag) => [tag.id, tag])), [tags])
  const selectedTasks = useMemo(() => tasks.filter((task) => batchSelected.has(task.id)), [batchSelected, tasks])
  const viewKey = useMemo(() => getViewOrderKey(activeView), [activeView])
  const workspaceId = workspace?.id ?? 'default'
  const supportsDateRange = activeView.type === 'date' && (activeView.value === 'done' || activeView.value === 'all')
  const orderedGroups = useMemo(
    () => groups.map((group) => ({
      ...group,
      tasks: applySavedOrder(
        filterTasks(group.tasks, supportsDateRange ? dateRange : null, activeView, supportsDateRange ? searchKeyword : ''),
        taskOrders[getOrderKey(workspaceId, viewKey, group.id)],
      ),
    })),
    [activeView, dateRange, groups, searchKeyword, supportsDateRange, taskOrders, viewKey, workspaceId],
  )

  useEffect(() => {
    localStorage.setItem(TASK_ORDER_STORAGE_KEY, JSON.stringify(taskOrders))
  }, [taskOrders])

  useEffect(() => {
    if (!selectedTaskId) return
    document.querySelector(`[data-task-id="${selectedTaskId}"]`)?.scrollIntoView({ block: 'nearest' })
  }, [selectedTaskId])

  useEffect(() => {
    if (searchOpen) searchInputRef.current?.focus()
  }, [searchOpen])

  useEffect(() => {
    setBatchMode(false)
    setBatchSelected(new Set())
  }, [activeView])

  useEffect(() => {
    if (!batchMode) return undefined
    const onKeyDown = (event: KeyboardEvent): void => {
      if (event.key === 'Escape') {
        setBatchMode(false)
        setBatchSelected(new Set())
      }
    }
    window.addEventListener('keydown', onKeyDown)
    return () => window.removeEventListener('keydown', onKeyDown)
  }, [batchMode])

  const closeSearch = (restoreFocus = false): void => {
    setSearchKeyword('')
    setSearchOpen(false)
    if (restoreFocus) requestAnimationFrame(() => searchTriggerRef.current?.focus())
  }

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

  const batchDisabled = batchSelected.size === 0
  const statusMenuItems: MenuProps['items'] = statusOptions.map((status) => ({
    key: status.value,
    icon: status.icon,
    label: status.label,
    disabled: batchDisabled,
    onClick: () => void runBatchAction({ status: status.value }),
  }))
  const priorityMenuItems: MenuProps['items'] = priorityOptions.map((priority) => ({
    key: priority.value,
    label: priority.label,
    disabled: batchDisabled,
    onClick: () => void runBatchAction({ priority: priority.value }),
  }))

  return (
    <section className="task-list-pane" aria-label="任务列表">
      {activeView.type === 'quick' ? <QuickCapture /> : null}
      <div className="task-groups">
        {activeView.type === 'date' && activeView.value === 'week' && orderedGroups.length === 0 ? (
          <div className="task-group-empty week-empty">本周暂无待办</div>
        ) : null}
        {orderedGroups.map((group) => {
          const groupIds = group.tasks.map((task) => task.id)
          const selectedInGroup = groupIds.filter((id) => batchSelected.has(id)).length
          const allSelected = groupIds.length > 0 && selectedInGroup === groupIds.length
          const someSelected = selectedInGroup > 0 && !allSelected
          const toggleGroupSelection = (): void => {
            setBatchSelected((current) => {
              const next = new Set(current)
              if (allSelected) groupIds.forEach((id) => next.delete(id))
              else groupIds.forEach((id) => next.add(id))
              return next
            })
          }
          return (
          <section className={`task-group ${group.highlighted ? 'current-weekday' : ''}`} key={group.id}>
            <div className="task-group-heading">
              {batchMode && groupIds.length > 0 ? (
                <Checkbox
                  className="task-group-select-all"
                  checked={allSelected}
                  indeterminate={someSelected}
                  onChange={toggleGroupSelection}
                />
              ) : null}
              <button className="task-group-title" type="button" aria-expanded={Boolean(!collapsed[group.id])} onClick={() => setCollapsed((value) => ({ ...value, [group.id]: !value[group.id] }))}>
                <ChevronDown className={collapsed[group.id] ? 'collapsed' : ''} size={15} />
                <span>{group.label}</span><small>{group.tasks.length}</small>
              </button>
              {supportsDateRange ? (
                <div className="task-group-filters">
                  <div className={`task-search-filter ${searchOpen ? 'is-open' : ''}`}>
                    <div className="task-search-input-wrap" style={{ pointerEvents: searchOpen ? 'auto' : 'none' }}>
                      <Input
                        ref={searchInputRef}
                        size="small"
                        allowClear
                        placeholder="输入标题或内容"
                        aria-label="搜索任务"
                        value={searchKeyword}
                        onBlur={() => {
                          if (!searchKeyword.trim()) setSearchOpen(false)
                        }}
                        onChange={(event) => {
                          const keyword = event.target.value
                          setSearchKeyword(keyword)
                          if (!keyword) setSearchOpen(false)
                        }}
                        onKeyDown={(event) => {
                          if (event.key === 'Escape') {
                            closeSearch(true)
                          }
                        }}
                      />
                    </div>
                    <button ref={searchTriggerRef} className="task-filter-icon" type="button" title="搜索" aria-label="搜索任务" onClick={() => setSearchOpen(true)}>
                      <Search size={15} />
                    </button>
                  </div>
                  <Popover
                    trigger="click"
                    destroyOnHidden
                    classNames={{ root: 'task-date-filter-popover' }}
                    content={(
                      <div>
                        <DatePicker.RangePicker
                          size="small"
                          allowClear={false}
                          format="YY/MM/DD"
                          value={dateRange}
                          onChange={(value) => setDateRange(value?.[0] && value[1] ? [value[0], value[1]] : null)}
                        />
                        <button className="task-filter-clear" type="button" onClick={() => setDateRange(null)}>清空</button>
                      </div>
                    )}
                  >
                    <button
                      className={`task-filter-icon ${dateRange ? 'active' : ''}`}
                      type="button"
                      title="日期范围"
                      aria-label="按日期范围筛选"
                      onClick={(event) => event.stopPropagation()}
                    >
                      <CalendarDays size={15} />
                    </button>
                  </Popover>
                </div>
              ) : null}
              {batchMode ? null : (
                <button className="task-filter-icon" type="button" title="批量操作" aria-label="批量操作" onClick={() => setBatchMode(true)}>
                  <ListChecks size={15} />
                </button>
              )}
            </div>
            {!collapsed[group.id] && group.tasks.length === 0 ? <div className="task-group-empty">当前筛选条件下暂无任务</div> : null}
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
                    className={`compact-task-row priority-${task.priority} ${task.id === selectedTaskId && !batchMode ? 'selected' : ''} ${batchMode && batchSelected.has(task.id) ? 'batch-checked' : ''} ${task.status === 'done' ? 'done' : ''} ${dragState?.taskId === task.id ? 'dragging' : ''}`}
                    type="button"
                    draggable={!batchMode}
                    data-task-id={task.id}
                    onClick={() => { if (batchMode) toggleBatchTask(task.id); else void selectTask(task.id) }}
                    onContextMenu={() => void selectTask(task.id)}
                    onDragStart={(event) => {
                      event.dataTransfer.effectAllowed = 'move'
                      event.dataTransfer.setData('text/plain', task.id)
                      setDragState({ groupId: group.id, taskId: task.id })
                      void selectTask(task.id)
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
                      checked={batchMode ? batchSelected.has(task.id) : task.status === 'done'}
                      onClick={(event) => event.stopPropagation()}
                      onChange={(event) => {
                        if (batchMode) toggleBatchTask(task.id)
                        else void setTaskStatus(task.id, event.target.checked ? 'done' : 'todo')
                      }}
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
                      {task.priority === 'high' ? <Flag size={14} className="priority-icon priority-high" fill="currentColor" /> : null}
                      {task.attachments.length > 0 ? <Paperclip size={14} /> : null}
                      {task.pinned ? <Pin size={14} /> : null}
                    </span>
                  </button>
                </Dropdown>
              )
            }) : null}
          </section>
          )
        })}
      </div>
      {batchMode ? (
        <div className="task-list-total task-batch-bar">
          <span className="task-batch-count">已选 {batchSelected.size} 项</span>
          <Dropdown trigger={['click']} menu={{ items: statusMenuItems }}>
            <button className="task-batch-btn" type="button" disabled={batchDisabled}>状态</button>
          </Dropdown>
          <Dropdown trigger={['click']} menu={{ items: priorityMenuItems }}>
            <button className="task-batch-btn" type="button" disabled={batchDisabled}>优先级</button>
          </Dropdown>
          <Popover
            trigger="click"
            destroyOnHidden
            classNames={{ root: 'task-batch-popover' }}
            content={(
              <div className="task-batch-due">
                <button className="task-batch-btn" type="button" disabled={batchDisabled} onClick={() => void runBatchAction({ dueDate: todayAsLocalDateString() })}>今天</button>
                <button className="task-batch-btn" type="button" disabled={batchDisabled} onClick={() => void runBatchAction({ dueDate: dayjs().add(1, 'day').format('YYYY-MM-DD') })}>明天</button>
                <button className="task-batch-btn" type="button" disabled={batchDisabled} onClick={() => void runBatchAction({ dueDate: '' })}>清除</button>
                <DatePicker
                  size="small"
                  format="YY/MM/DD"
                  placeholder="选择日期"
                  disabled={batchDisabled}
                  onChange={(value) => { if (value) void runBatchAction({ dueDate: value.format('YYYY-MM-DD') }) }}
                />
              </div>
            )}
          >
            <button className="task-batch-btn" type="button" disabled={batchDisabled}>截止日期</button>
          </Popover>
          <Popover
            trigger="click"
            destroyOnHidden
            classNames={{ root: 'task-batch-popover' }}
            content={(
              <div className="task-batch-tags">
                {tags.length === 0 ? <span className="task-batch-empty">暂无标签</span> : null}
                {tags.map((tag) => {
                  const count = selectedTasks.filter((task) => task.tagIds.includes(tag.id)).length
                  const allHave = selectedTasks.length > 0 && count === selectedTasks.length
                  return (
                    <Checkbox
                      key={tag.id}
                      checked={allHave}
                      indeterminate={count > 0 && !allHave}
                      onChange={() => void runBatchAction(allHave ? { removeTagIds: [tag.id] } : { addTagIds: [tag.id] })}
                    >
                      <span className="task-tag" style={{ color: tag.color, backgroundColor: `${tag.color}12` }}>{tag.name}</span>
                    </Checkbox>
                  )
                })}
              </div>
            )}
          >
            <button className="task-batch-btn" type="button" disabled={batchDisabled}>标签</button>
          </Popover>
          <Popconfirm
            title={`删除选中的 ${batchSelected.size} 项任务？`}
            okText="删除"
            cancelText="取消"
            onConfirm={() => void runBatchDelete()}
          >
            <button className="task-batch-btn danger" type="button" disabled={batchDisabled}>删除</button>
          </Popconfirm>
          <button className="task-batch-btn" type="button" onClick={exitBatch}>退出</button>
        </div>
      ) : (
        <div className="task-list-total">{orderedGroups.reduce((total, group) => total + group.tasks.length, 0)} 项任务</div>
      )}
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

function filterTasks(tasks: Task[], dateRange: [Dayjs, Dayjs] | null, view: TaskView, searchKeyword: string): Task[] {
  const dateFilteredTasks = !dateRange || view.type !== 'date' || (view.value !== 'done' && view.value !== 'all')
    ? tasks
    : tasks.filter((task) => {
      const [start, end] = dateRange
      const timestamp = view.value === 'done' ? task.completedAt ?? task.updatedAt : task.createdAt
      const date = dayjs(timestamp)
      return !date.isBefore(start, 'day') && !date.isAfter(end, 'day')
    })
  const normalizedKeyword = searchKeyword.trim().toLocaleLowerCase()
  if (!normalizedKeyword) return dateFilteredTasks
  return dateFilteredTasks.filter((task) => {
    if (task.title.toLocaleLowerCase().includes(normalizedKeyword)) return true
    return getDocumentText(task.content).toLocaleLowerCase().includes(normalizedKeyword)
  })
}

function formatTaskTime(task: Task): string {
  if (!task.dueDate) return '无日期'
  const today = todayAsLocalDateString()
  if (task.dueDate === today) return new Date(task.updatedAt).toLocaleTimeString('zh-CN', { hour: '2-digit', minute: '2-digit' })
  return task.dueDate.slice(5).replace('-', '/')
}
