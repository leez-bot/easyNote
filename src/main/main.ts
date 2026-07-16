import { app } from 'electron'
import { AttachmentService } from './attachments/AttachmentService'
import { ImportExportService } from './importExport/ImportExportService'
import { registerIpcHandlers } from './ipc'
import { TaskRepository } from './tasks/TaskRepository'
import { WindowManager } from './windows/WindowManager'
import { WorkspaceService } from './workspace/WorkspaceService'

app.setAppUserModelId('com.easynote.desktop')

let windows: WindowManager | null = null

async function bootstrap(): Promise<void> {
  const workspace = new WorkspaceService()
  const tasks = new TaskRepository(workspace)
  const attachments = new AttachmentService(workspace, tasks)
  const importExport = new ImportExportService(workspace, tasks)

  windows = new WindowManager()
  registerIpcHandlers({
    windows,
    workspace,
    tasks,
    attachments,
    importExport,
  })

  const currentWorkspace = await workspace.getCurrentWorkspace()
  if (process.env.EASYNOTE_QA_PANEL === '1') {
    windows.showPanel()
  } else if (currentWorkspace) {
    windows.showLauncher()
  } else {
    windows.showPanel()
  }
}

app.whenReady().then(() => {
  void bootstrap()

  app.on('activate', () => {
    if (!windows?.getLauncherWindow() && !windows?.getPanelWindow()) {
      windows?.showLauncher()
    }
  })
})

app.on('window-all-closed', () => {
  if (process.platform !== 'darwin') {
    app.quit()
  }
})
