import { app, ipcMain } from 'electron'
import type { AttachmentService } from './attachments/AttachmentService'
import type { ImportExportService } from './importExport/ImportExportService'
import type { TaskRepository } from './tasks/TaskRepository'
import type { WindowManager } from './windows/WindowManager'
import type { WorkspaceService } from './workspace/WorkspaceService'

export interface MainServices {
  windows: WindowManager
  workspace: WorkspaceService
  tasks: TaskRepository
  attachments: AttachmentService
  importExport: ImportExportService
}

export function registerIpcHandlers(services: MainServices): void {
  ipcMain.handle('window:showPanel', () => {
    services.windows.showPanel()
  })

  ipcMain.handle('window:collapseToLauncher', () => {
    services.windows.collapseToLauncher()
  })

  ipcMain.handle('window:toggleMaximize', () => services.windows.togglePanelMaximize())

  ipcMain.handle('window:close', () => {
    services.windows.closePanel()
  })

  ipcMain.handle('window:moveLauncher', (_event, deltaX, deltaY) => {
    services.windows.moveLauncher(Number(deltaX), Number(deltaY))
  })

  ipcMain.handle('window:quit', () => {
    app.quit()
  })

  ipcMain.handle('workspace:getCurrent', () => services.workspace.getCurrentWorkspace())
  ipcMain.handle('workspace:chooseDirectory', () => services.workspace.chooseWorkspaceDirectory())

  ipcMain.handle('tasks:list', () => services.tasks.list())
  ipcMain.handle('tasks:create', (_event, input) => services.tasks.create(input))
  ipcMain.handle('tasks:update', (_event, id, input) => services.tasks.update(id, input))
  ipcMain.handle('tasks:setStatus', (_event, id, status) => services.tasks.setStatus(id, status))
  ipcMain.handle('tasks:remove', async (_event, id) => {
    await services.tasks.remove(id)
    await services.attachments.removeTaskAttachments(id)
  })

  ipcMain.handle('tags:list', () => services.tasks.listTags())
  ipcMain.handle('tags:create', (_event, input) => services.tasks.createTag(input))
  ipcMain.handle('tags:update', (_event, id, input) => services.tasks.updateTag(id, input))
  ipcMain.handle('tags:remove', (_event, id) => services.tasks.removeTag(id))

  ipcMain.handle('attachments:addFiles', (_event, taskId, imagesOnly) => services.attachments.addFiles(taskId, imagesOnly))
  ipcMain.handle('attachments:remove', (_event, taskId, attachmentId) => services.attachments.remove(taskId, attachmentId))
  ipcMain.handle('attachments:getPreviewUrl', (_event, relativePath) => services.attachments.getPreviewUrl(relativePath))
  ipcMain.handle('attachments:openFile', (_event, relativePath) => services.attachments.openFile(relativePath))

  ipcMain.handle('importExport:exportData', () => services.importExport.exportData())
  ipcMain.handle('importExport:importData', (_event, mode) => services.importExport.importData(mode))
}
