import { Alert, Button, Card } from 'antd'
import { FolderOpen } from 'lucide-react'
import { useTaskStore } from '../../store/taskStore'

export function WorkspaceGate(): JSX.Element {
  const chooseWorkspace = useTaskStore((state) => state.chooseWorkspace)
  const loading = useTaskStore((state) => state.loading)
  const error = useTaskStore((state) => state.error)
  const isElectronWindow = Boolean(window.easyNoteApi)

  return (
    <main className="workspace-screen">
      <Card className="workspace-dialog" aria-labelledby="workspace-title">
        <div className="workspace-icon">
          <FolderOpen size={22} />
        </div>
        <h1 id="workspace-title">选择 easyNote 数据目录</h1>
        <p>任务、附件和导入导出数据将保存在这个目录中。</p>
        <div className="path-placeholder">请选择一个本地目录作为工作区</div>
        {!isElectronWindow ? (
          <Alert
            className="workspace-alert"
            type="warning"
            showIcon
            message="当前是浏览器预览页，请在 easyNote 桌面窗口中选择本地目录。"
          />
        ) : null}
        {error ? <Alert className="workspace-alert" type="error" showIcon message={error} /> : null}
        <div className="dialog-actions">
          <Button
            type="primary"
            disabled={loading || !isElectronWindow}
            loading={loading}
            onClick={() => void chooseWorkspace()}
          >
            选择目录
          </Button>
        </div>
      </Card>
    </main>
  )
}
