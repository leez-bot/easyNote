import { Button, Modal, Popconfirm, Tooltip } from 'antd'
import { AlertTriangle, Archive, CalendarDays, CheckCircle2, CirclePause, Clock3, Download, FolderOpen, Inbox, ListTodo, Pencil, Plus, Settings, Timer, XCircle } from 'lucide-react'
import { useMemo, useState } from 'react'
import type { TaskStatus } from '../../../shared/models'
import { getTaskCounts, type TaskView } from '../../shared/taskViews'
import { useTaskStore } from '../../store/taskStore'
import { TagPicker } from '../tasks/TagPicker'

const workspaceViews: Array<{ label: string; icon: typeof Inbox; view: TaskView; count: keyof ReturnType<typeof getTaskCounts> }> = [
  { label: '快速记录', icon: Pencil, view: { type: 'quick' }, count: 'all' },
  { label: '今天', icon: CalendarDays, view: { type: 'date', value: 'today' }, count: 'today' },
  { label: '逾期', icon: AlertTriangle, view: { type: 'date', value: 'overdue' }, count: 'overdue' },
  { label: '即将到期', icon: Clock3, view: { type: 'date', value: 'upcoming' }, count: 'upcoming' },
  { label: '已完成', icon: CheckCircle2, view: { type: 'date', value: 'done' }, count: 'completed' },
  { label: '全部任务', icon: Archive, view: { type: 'date', value: 'all' }, count: 'all' },
]

const statusViews: Array<{ value: TaskStatus; label: string; icon: typeof ListTodo }> = [
  { value: 'todo', label: '待办', icon: ListTodo },
  { value: 'doing', label: '进行中', icon: Timer },
  { value: 'done', label: '已办', icon: CheckCircle2 },
  { value: 'cancelled', label: '已取消', icon: XCircle },
  { value: 'waiting', label: '正在等待', icon: CirclePause },
]

export function TaskSidebar(): JSX.Element {
  const tasks = useTaskStore((state) => state.tasks)
  const tags = useTaskStore((state) => state.tags)
  const workspace = useTaskStore((state) => state.workspace)
  const activeView = useTaskStore((state) => state.activeView)
  const setActiveView = useTaskStore((state) => state.setActiveView)
  const chooseWorkspace = useTaskStore((state) => state.chooseWorkspace)
  const exportData = useTaskStore((state) => state.exportData)
  const importData = useTaskStore((state) => state.importData)
  const counts = useMemo(() => getTaskCounts(tasks), [tasks])
  const [settingsOpen, setSettingsOpen] = useState(false)

  return (
    <aside className="task-sidebar">
      <nav className="sidebar-scroll" aria-label="任务导航">
        <SidebarSection title="本地工作区">
          {workspaceViews.map((item) => (
            <SidebarItem
              key={item.label}
              active={isSameView(activeView, item.view)}
              icon={item.icon}
              label={item.label}
              count={typeof counts[item.count] === 'number' ? counts[item.count] as number : 0}
              onClick={() => setActiveView(item.view)}
            />
          ))}
        </SidebarSection>
        <SidebarSection title="视图">
          {statusViews.map((item) => (
            <SidebarItem
              key={item.value}
              active={activeView.type === 'status' && activeView.value === item.value}
              icon={item.icon}
              label={item.label}
              count={counts.statuses[item.value]}
              onClick={() => setActiveView({ type: 'status', value: item.value })}
            />
          ))}
        </SidebarSection>
        <SidebarSection
          title="标签"
          action={<TagPicker value={[]} onChange={() => undefined} manageOnly trigger={<button className="sidebar-plus" type="button" title="管理标签"><Plus size={15} /></button>} />}
        >
          {tags.map((tag) => (
            <button
              className={`sidebar-item tag-nav ${activeView.type === 'tag' && activeView.tagId === tag.id ? 'active' : ''}`}
              type="button"
              key={tag.id}
              onClick={() => setActiveView({ type: 'tag', tagId: tag.id })}
            >
              <span className="tag-outline" style={{ color: tag.color }} />
              <span className="sidebar-item-label">{tag.name}</span>
              <span className="sidebar-count">{counts.tags[tag.id] ?? 0}</span>
            </button>
          ))}
        </SidebarSection>
      </nav>
      <div className="sidebar-footer">
        <Tooltip title="工作区设置">
          <button className="sidebar-footer-button" type="button" title="工作区设置" onClick={() => setSettingsOpen(true)}><Settings size={17} /></button>
        </Tooltip>
        <Popconfirm
          title="归档当前工作区"
          description="将当前工作区打包导出为 .enote 文件，原数据不会删除。"
          okText="导出归档"
          cancelText="取消"
          onConfirm={() => void exportData()}
        >
          <Tooltip title="归档工作区">
            <button className="sidebar-footer-button" type="button" title="归档工作区"><Inbox size={17} /></button>
          </Tooltip>
        </Popconfirm>
      </div>
      <Modal
        title="工作区设置"
        open={settingsOpen}
        footer={null}
        width={520}
        onCancel={() => setSettingsOpen(false)}
      >
        <div className="workspace-settings">
          <section>
            <div className="settings-section-title">当前工作区</div>
            <div className="workspace-summary">
              <div>
                <strong>{workspace?.name || '个人工作区'}</strong>
                <span>{workspace?.rootPath || '未选择数据目录'}</span>
              </div>
              <Button icon={<FolderOpen size={15} />} onClick={() => void chooseWorkspace()}>更换目录</Button>
            </div>
          </section>
          <section>
            <div className="settings-section-title">数据管理</div>
            <div className="settings-actions">
              <Button icon={<Download size={15} />} onClick={() => void exportData()}>导出工作区</Button>
              <Button onClick={() => void importData('merge')}>合并导入</Button>
              <Popconfirm
                title="覆盖导入"
                description="覆盖导入会先备份当前工作区，然后用导入包替换现有任务。"
                okText="覆盖导入"
                cancelText="取消"
                onConfirm={() => void importData('replace')}
              >
                <Button danger>覆盖导入</Button>
              </Popconfirm>
            </div>
          </section>
        </div>
      </Modal>
    </aside>
  )
}

function SidebarSection({ title, action, children }: { title: string; action?: JSX.Element; children: React.ReactNode }): JSX.Element {
  return <section className="sidebar-section"><div className="sidebar-section-head"><strong>{title}</strong>{action}</div>{children}</section>
}

function SidebarItem({ active, icon: Icon, label, count, onClick }: { active: boolean; icon: typeof Inbox; label: string; count: number; onClick: () => void }): JSX.Element {
  return (
    <button className={`sidebar-item ${active ? 'active' : ''}`} type="button" onClick={onClick}>
      <Icon size={16} />
      <span className="sidebar-item-label">{label}</span>
      <span className="sidebar-count">{count}</span>
    </button>
  )
}

function isSameView(left: TaskView, right: TaskView): boolean {
  return JSON.stringify(left) === JSON.stringify(right)
}
