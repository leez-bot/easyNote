import { Button, Dropdown, Tooltip } from 'antd'
import { Download, FileDown, Import, Maximize2, Minus, NotebookPen, Plus, X } from 'lucide-react'
import { type CSSProperties, useEffect, useMemo, useState } from 'react'
import { EMPTY_DOCUMENT } from '../../shared/editor'
import { todayAsLocalDateString } from '../../shared/date'
import { getTaskCounts, getVisibleTasks } from '../../shared/taskViews'
import { useTaskStore } from '../../store/taskStore'
import { TaskDetail } from '../tasks/TaskDetail'
import { TaskList } from '../tasks/TaskList'
import { TaskSidebar } from './TaskSidebar'
import { WorkspaceMenu } from './WorkspaceMenu'

const SIDEBAR_WIDTH_KEY = 'easyNote.sidebarWidth'
const LIST_WIDTH_KEY = 'easyNote.listWidth'

type ResizeTarget = 'sidebar' | 'list'

interface ResizeState {
  target: ResizeTarget
  startX: number
  sidebarWidth: number
  listWidth: number
}

export function PanelLayout(): JSX.Element {
  const tasks = useTaskStore((state) => state.tasks)
  const activeView = useTaskStore((state) => state.activeView)
  const loading = useTaskStore((state) => state.loading)
  const error = useTaskStore((state) => state.error)
  const notice = useTaskStore((state) => state.notice)
  const savingTaskId = useTaskStore((state) => state.savingTaskId)
  const saveError = useTaskStore((state) => state.saveError)
  const lastSavedAt = useTaskStore((state) => state.lastSavedAt)
  const editorStats = useTaskStore((state) => state.editorStats)
  const flushPendingSave = useTaskStore((state) => state.flushPendingSave)
  const createTask = useTaskStore((state) => state.createTask)
  const exportData = useTaskStore((state) => state.exportData)
  const importData = useTaskStore((state) => state.importData)
  const [isMaximized, setIsMaximized] = useState(false)
  const [sidebarWidth, setSidebarWidth] = useState(() => getStoredWidth(SIDEBAR_WIDTH_KEY, 182, 148, 280))
  const [listWidth, setListWidth] = useState(() => getStoredWidth(LIST_WIDTH_KEY, 468, 390, 760))
  const [resizing, setResizing] = useState<ResizeState | null>(null)
  const counts = useMemo(() => getTaskCounts(tasks), [tasks])
  const visibleCount = useMemo(() => getVisibleTasks(tasks, activeView).length, [activeView, tasks])

  useEffect(() => {
    if (!resizing) return

    const handlePointerMove = (event: PointerEvent): void => {
      const deltaX = event.clientX - resizing.startX
      if (resizing.target === 'sidebar') {
        setSidebarWidth(clamp(resizing.sidebarWidth + deltaX, 148, 280))
        return
      }
      setListWidth(clamp(resizing.listWidth + deltaX, 390, 760))
    }

    const handlePointerUp = (): void => setResizing(null)

    window.addEventListener('pointermove', handlePointerMove)
    window.addEventListener('pointerup', handlePointerUp, { once: true })
    return () => {
      window.removeEventListener('pointermove', handlePointerMove)
      window.removeEventListener('pointerup', handlePointerUp)
    }
  }, [resizing])

  useEffect(() => {
    localStorage.setItem(SIDEBAR_WIDTH_KEY, String(sidebarWidth))
  }, [sidebarWidth])

  useEffect(() => {
    localStorage.setItem(LIST_WIDTH_KEY, String(listWidth))
  }, [listWidth])

  const create = async (today: boolean): Promise<void> => {
    await createTask({ title: '新任务', content: EMPTY_DOCUMENT, status: 'todo', dueDate: today ? todayAsLocalDateString() : undefined })
  }
  const collapse = async (): Promise<void> => { await flushPendingSave?.(); await window.easyNoteApi.window.collapseToLauncher() }
  const close = async (): Promise<void> => { await flushPendingSave?.(); await window.easyNoteApi.window.close() }
  const toggleMaximize = async (): Promise<void> => setIsMaximized(await window.easyNoteApi.window.toggleMaximize())
  const startResize = (target: ResizeTarget, event: React.PointerEvent<HTMLDivElement>): void => {
    event.preventDefault()
    setResizing({ target, startX: event.clientX, sidebarWidth, listWidth })
  }

  return (
    <main className={`panel-shell ${resizing ? 'is-resizing' : ''}`}>
      <header className="titlebar">
        <div className="title-left">
          <span className="brand-mark"><NotebookPen size={18} /></span><strong>easyNote</strong><span className="title-divider" />
          <WorkspaceMenu /><span className="title-divider" />
          <span className="top-stat">今天 {counts.today} 项</span><span className="top-stat overdue">逾期 {counts.overdue} 项</span><span className="top-stat">未办 {counts.open} 项</span>
        </div>
        <div className="title-actions">
          {error ? <Tooltip title={error}><span className="title-error">操作失败</span></Tooltip> : null}
          {notice ? <span className="title-notice">{notice}</span> : null}
          <Button type="text" icon={<Import size={16} />} onClick={() => void importData('merge')}>导入</Button>
          <Button type="text" icon={<Download size={16} />} onClick={() => void exportData()}>导出</Button>
          <Dropdown menu={{ items: [{ key: 'inbox', label: '新建无日期任务', icon: <FileDown size={14} />, onClick: () => void create(false) }] }}>
            <Button type="primary" loading={loading} icon={<Plus size={15} />} onClick={() => void create(true)}>新增</Button>
          </Dropdown>
          <span className="title-divider" />
          <button className="window-control" type="button" title="收起到悬浮窗" onClick={() => void collapse()}><Minus size={16} /></button>
          <button className="window-control" type="button" title={isMaximized ? '还原' : '最大化'} onClick={() => void toggleMaximize()}><Maximize2 size={15} /></button>
          <button className="window-control close" type="button" title="关闭" onClick={() => void close()}><X size={16} /></button>
        </div>
      </header>
      <div
        className="panel-body"
        style={{ '--sidebar-width': `${sidebarWidth}px`, '--list-width': `${listWidth}px` } as CSSProperties}
      >
        <TaskSidebar />
        <div className="column-resize-handle" role="separator" aria-orientation="vertical" aria-label="调整左侧栏宽度" onPointerDown={(event) => startResize('sidebar', event)} />
        <TaskList />
        <div className="column-resize-handle" role="separator" aria-orientation="vertical" aria-label="调整任务列表宽度" onPointerDown={(event) => startResize('list', event)} />
        <TaskDetail />
      </div>
      <footer className="statusbar">
        <span>{visibleCount} 项任务</span>
        <div>
          <span>字数：{editorStats.characters}</span>
          <span>段落：{editorStats.paragraphs}</span>
          <span>最后保存：{lastSavedAt ? new Date(lastSavedAt).toLocaleString('zh-CN', { month: '2-digit', day: '2-digit', hour: '2-digit', minute: '2-digit' }) : '--'}</span>
          <button className={saveError ? 'save-state error' : 'save-state'} type="button"><i />{savingTaskId ? '正在保存' : saveError ? '保存失败' : '已保存'}</button>
        </div>
      </footer>
    </main>
  )
}

function getStoredWidth(key: string, fallback: number, min: number, max: number): number {
  const value = Number(localStorage.getItem(key))
  return Number.isFinite(value) ? clamp(value, min, max) : fallback
}

function clamp(value: number, min: number, max: number): number {
  return Math.min(Math.max(value, min), max)
}
