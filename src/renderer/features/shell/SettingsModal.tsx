import { Button, Checkbox, message, Modal, Popconfirm } from 'antd'
import { Download, FolderOpen } from 'lucide-react'
import { useEffect, useState } from 'react'
import { useTaskStore } from '../../store/taskStore'

type SettingsCategory = 'workspace' | 'data' | 'startup'

const categories: Array<{ key: SettingsCategory; label: string }> = [
  { key: 'workspace', label: '工作区设置' },
  { key: 'data', label: '数据管理' },
  { key: 'startup', label: '开机管理' },
]

export function SettingsModal({ open, onClose }: { open: boolean; onClose: () => void }): JSX.Element {
  const workspace = useTaskStore((state) => state.workspace)
  const chooseWorkspace = useTaskStore((state) => state.chooseWorkspace)
  const exportData = useTaskStore((state) => state.exportData)
  const importData = useTaskStore((state) => state.importData)
  const [category, setCategory] = useState<SettingsCategory>('workspace')
  const [openAtLogin, setOpenAtLogin] = useState(false)
  const [savingStartup, setSavingStartup] = useState(false)

  useEffect(() => {
    if (!open) return
    setCategory('workspace')
    void window.easyNoteApi.settings.getOpenAtLogin().then(setOpenAtLogin).catch(() => setOpenAtLogin(false))
  }, [open])

  const toggleOpenAtLogin = async (enabled: boolean): Promise<void> => {
    setSavingStartup(true)
    setOpenAtLogin(enabled)
    try {
      const next = await window.easyNoteApi.settings.setOpenAtLogin(enabled)
      setOpenAtLogin(next)
    } catch (error) {
      setOpenAtLogin(!enabled)
      message.error(error instanceof Error ? error.message : '开机启动设置失败')
    } finally {
      setSavingStartup(false)
    }
  }

  return (
    <Modal title="设置" open={open} footer={null} width={640} onCancel={onClose}>
      <div className="settings-layout">
        <nav className="settings-nav" aria-label="设置分类">
          {categories.map((item) => (
            <button
              className={`settings-nav-item ${category === item.key ? 'active' : ''}`}
              type="button"
              key={item.key}
              onClick={() => setCategory(item.key)}
            >
              {item.label}
            </button>
          ))}
        </nav>
        <div className="settings-pane">
          {category === 'workspace' ? (
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
          ) : null}
          {category === 'data' ? (
            <section>
              <div className="settings-section-title">数据管理</div>
              <p className="settings-hint">导出当前工作区，或从备份包合并、覆盖导入任务数据。</p>
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
          ) : null}
          {category === 'startup' ? (
            <section>
              <div className="settings-section-title">开机管理</div>
              <div className="settings-toggle">
                <Checkbox
                  checked={openAtLogin}
                  disabled={savingStartup}
                  onChange={(event) => void toggleOpenAtLogin(event.target.checked)}
                />
                <span>
                  <strong>开机自动启动</strong>
                  <em>勾选后，下次开机将自动启动 easyNote。</em>
                </span>
              </div>
            </section>
          ) : null}
        </div>
      </div>
    </Modal>
  )
}
