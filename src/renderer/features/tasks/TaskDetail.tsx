import { Button, Checkbox, DatePicker, Empty, Input, Popconfirm, Segmented, Select, Tooltip } from 'antd'
import dayjs from 'dayjs'
import { Check, Flag, Pencil, Save, Tag, Trash2, X } from 'lucide-react'
import { useEffect, useMemo, useState } from 'react'
import type { Task, TaskInput, TaskPriority, TaskStatus } from '../../../shared/models'
import { getDocumentStats } from '../../shared/editor'
import { useTaskStore } from '../../store/taskStore'
import { AttachmentGrid } from './AttachmentGrid'
import { RichTextEditor } from './RichTextEditor'
import { TagPicker } from './TagPicker'

const statusOptions: Array<{ value: TaskStatus; label: string }> = [
  { value: 'todo', label: '待办' },
  { value: 'doing', label: '进行中' },
  { value: 'done', label: '已办' },
  { value: 'cancelled', label: '已取消' },
  { value: 'waiting', label: '等待' },
]

const statusText: Record<TaskStatus, string> = {
  todo: '待办',
  doing: '进行中',
  done: '已办',
  cancelled: '已取消',
  waiting: '正在等待',
}

const priorityText: Record<TaskPriority, string> = {
  none: '无',
  low: '低',
  medium: '中',
  high: '高',
}

export function TaskDetail(): JSX.Element {
  const tasks = useTaskStore((state) => state.tasks)
  const tags = useTaskStore((state) => state.tags)
  const selectedTaskId = useTaskStore((state) => state.selectedTaskId)
  const pendingEditTaskId = useTaskStore((state) => state.pendingEditTaskId)
  const savingTaskId = useTaskStore((state) => state.savingTaskId)
  const updateTask = useTaskStore((state) => state.updateTask)
  const removeTask = useTaskStore((state) => state.removeTask)
  const clearPendingEditTask = useTaskStore((state) => state.clearPendingEditTask)
  const setEditorStats = useTaskStore((state) => state.setEditorStats)
  const setFlushPendingSave = useTaskStore((state) => state.setFlushPendingSave)
  const task = useMemo(() => tasks.find((item) => item.id === selectedTaskId) ?? null, [selectedTaskId, tasks])
  const [isEditing, setIsEditing] = useState(false)
  const [draft, setDraft] = useState<TaskInput | null>(() => task ? toDraft(task) : null)
  const selectedTags = useMemo(() => {
    const tagIds = draft?.tagIds ?? []
    return tagIds.map((id) => tags.find((tag) => tag.id === id)).filter((tag): tag is NonNullable<typeof tag> => Boolean(tag))
  }, [draft?.tagIds, tags])

  useEffect(() => {
    setDraft(task ? toDraft(task) : null)
    if (task && pendingEditTaskId === task.id) {
      setIsEditing(true)
      clearPendingEditTask()
      return
    }
    setIsEditing(false)
  }, [clearPendingEditTask, pendingEditTaskId, task])

  useEffect(() => {
    if (!isEditing && task) setDraft(toDraft(task))
  }, [isEditing, task])

  useEffect(() => {
    const content = isEditing ? draft?.content : task?.content
    setEditorStats(content ? getDocumentStats(content) : { characters: 0, paragraphs: 0 })
  }, [draft?.content, isEditing, setEditorStats, task?.content])

  useEffect(() => {
    setFlushPendingSave(null)
  }, [setFlushPendingSave])

  if (!task || !draft) {
    return <section className="task-detail empty-detail"><Empty image={Empty.PRESENTED_IMAGE_SIMPLE} description="选择任务后查看详情" /></section>
  }

  const updateDraft = (patch: Partial<TaskInput>): void => setDraft((current) => current ? { ...current, ...patch } : current)
  const cancelEdit = (): void => {
    setDraft(toDraft(task))
    setIsEditing(false)
  }
  const saveEdit = async (): Promise<void> => {
    const saved = await updateTask(task.id, { ...draft, title: draft.title.trim() || '未命名任务' })
    if (saved) setIsEditing(false)
  }

  return (
    <section className={`task-detail ${isEditing ? 'editing' : 'viewing'}`} aria-label="任务详情">
      <div className="detail-titlebar">
        {isEditing ? (
          <Input className="detail-title-input" variant="borderless" value={draft.title} onChange={(event) => updateDraft({ title: event.target.value })} />
        ) : <h2>{task.title}</h2>}
        <div className="detail-title-actions">
          {isEditing ? <>
            <Tooltip title="取消编辑"><Button type="text" icon={<X size={17} />} onClick={cancelEdit} /></Tooltip>
            <Tooltip title="保存"><Button type="primary" icon={<Save size={16} />} loading={savingTaskId === task.id} onClick={() => void saveEdit()}>保存</Button></Tooltip>
          </> : <Tooltip title="编辑任务"><Button type="text" icon={<Pencil size={17} />} onClick={() => setIsEditing(true)} /></Tooltip>}
          <Popconfirm title="删除任务" description="删除后无法从 easyNote 内恢复。" okButtonProps={{ danger: true }} onConfirm={() => void removeTask(task.id)}>
            <Tooltip title="删除任务"><Button type="text" danger icon={<Trash2 size={17} />} /></Tooltip>
          </Popconfirm>
        </div>
      </div>

      {isEditing ? (
        <>
          <div className="detail-fields">
            <label><span>状态</span><Segmented value={draft.status} options={statusOptions} onChange={(value) => updateDraft({ status: value as TaskStatus })} /></label>
            <label><span>截止日期</span><DatePicker allowClear value={draft.dueDate ? dayjs(draft.dueDate) : null} onChange={(date) => updateDraft({ dueDate: date?.format('YYYY-MM-DD') })} /></label>
            <label className="detail-tag-field">
              <span>标签</span>
              <div className="detail-tag-control">
                <TagPicker value={draft.tagIds ?? []} onChange={(tagIds) => updateDraft({ tagIds })} trigger={<button className="inline-tag-trigger" type="button"><Tag size={14} />选择标签</button>} />
                {selectedTags.length > 0 ? (
                  <div className="selected-tag-strip">
                    {selectedTags.map((tag) => (
                      <span className="selected-tag-chip" key={tag.id} style={{ color: tag.color, backgroundColor: `${tag.color}12` }}>{tag.name}</span>
                    ))}
                  </div>
                ) : <span className="selected-tag-empty">未选择标签</span>}
              </div>
            </label>
            <label><span>优先级</span><Select<TaskPriority> value={draft.priority ?? 'none'} onChange={(priority) => updateDraft({ priority })} options={[
              { value: 'none', label: '无' },
              { value: 'low', label: '低' },
              { value: 'medium', label: '中' },
              { value: 'high', label: '高' },
            ]} suffixIcon={<Flag size={14} />} /></label>
            <label><span>置顶</span><Checkbox checked={Boolean(draft.pinned)} onChange={(event) => updateDraft({ pinned: event.target.checked })} /></label>
          </div>
          <div className="editor-section"><div className="editor-label">描述</div><RichTextEditor value={draft.content ?? task.content} onChange={(content) => updateDraft({ content })} /></div>
          <AttachmentGrid task={task} editable />
        </>
      ) : (
        <>
          <div className="detail-readonly-fields">
            <ReadField label="状态"><span className={`readonly-status status-${task.status}`}><Check size={12} />{statusText[task.status]}</span></ReadField>
            <ReadField label="截止日期">{task.dueDate || '未设置'}</ReadField>
            <ReadField label="标签">{task.tagIds.length ? <div className="readonly-tags">{task.tagIds.map((id) => { const tag = tags.find((item) => item.id === id); return tag ? <span key={id} style={{ color: tag.color, backgroundColor: `${tag.color}12` }}>{tag.name}</span> : null })}</div> : '无标签'}</ReadField>
            <ReadField label="优先级">{priorityText[task.priority]}</ReadField>
            <ReadField label="创建时间">{formatDateTime(task.createdAt)}</ReadField>
            <ReadField label="更新时间">{formatDateTime(task.updatedAt)}</ReadField>
          </div>
          <div className="editor-section readonly-section"><div className="editor-label">描述</div><RichTextEditor value={task.content} readOnly /></div>
          <AttachmentGrid task={task} />
        </>
      )}
    </section>
  )
}

function ReadField({ label, children }: { label: string; children: React.ReactNode }): JSX.Element {
  return <div className="readonly-field"><span>{label}</span><div>{children}</div></div>
}

function toDraft(task: Task): TaskInput {
  return { title: task.title, content: task.content, status: task.status, priority: task.priority, tagIds: task.tagIds, pinned: task.pinned, dueDate: task.dueDate }
}

function formatDateTime(value: string): string {
  return new Date(value).toLocaleString('zh-CN', { year: 'numeric', month: '2-digit', day: '2-digit', hour: '2-digit', minute: '2-digit' })
}
