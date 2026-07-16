import { app, dialog } from 'electron'
import { basename, join } from 'node:path'
import { nanoid } from 'nanoid'
import type { TaskDataFile, WorkspaceMeta } from '../../shared/models'
import { createDefaultTags } from '../tasks/taskMigration'
import { ensureDir, pathExists, readJsonFile, writeJsonFileAtomic } from '../utils/fileSystem'

interface SettingsFile {
  workspacePath?: string
}

export class WorkspaceService {
  private readonly settingsPath = join(app.getPath('userData'), 'settings.json')

  async getCurrentWorkspace(): Promise<WorkspaceMeta | null> {
    const settings = await this.readSettings()
    if (!settings.workspacePath) {
      return null
    }

    const workspaceFile = join(settings.workspacePath, 'workspace.json')
    if (!(await pathExists(workspaceFile))) {
      return null
    }

    try {
      const workspace = await readJsonFile<WorkspaceMeta>(workspaceFile)
      return { ...workspace, rootPath: settings.workspacePath }
    } catch {
      return null
    }
  }

  async chooseWorkspaceDirectory(): Promise<WorkspaceMeta | null> {
    const result = await dialog.showOpenDialog({
      title: '选择 easyNote 数据目录',
      properties: ['openDirectory', 'createDirectory'],
    })

    if (result.canceled || result.filePaths.length === 0) {
      return null
    }

    const rootPath = result.filePaths[0]
    const workspace = await this.initializeWorkspace(rootPath)
    await this.writeSettings({ workspacePath: rootPath })
    return workspace
  }

  async requireWorkspace(): Promise<WorkspaceMeta> {
    const workspace = await this.getCurrentWorkspace()
    if (!workspace) {
      throw new Error('请先选择 easyNote 数据目录')
    }
    return workspace
  }

  async getTasksFilePath(): Promise<string> {
    const workspace = await this.requireWorkspace()
    return join(workspace.rootPath, 'data', 'tasks.json')
  }

  async getAttachmentsDir(): Promise<string> {
    const workspace = await this.requireWorkspace()
    return join(workspace.rootPath, 'attachments')
  }

  async getBackupsDir(): Promise<string> {
    const workspace = await this.requireWorkspace()
    return join(workspace.rootPath, 'backups')
  }

  private async initializeWorkspace(rootPath: string): Promise<WorkspaceMeta> {
    await ensureDir(rootPath)
    await ensureDir(join(rootPath, 'data'))
    await ensureDir(join(rootPath, 'attachments'))
    await ensureDir(join(rootPath, 'backups'))
    await ensureDir(join(rootPath, 'logs'))

    const now = new Date().toISOString()
    const workspaceFile = join(rootPath, 'workspace.json')
    let workspace: WorkspaceMeta

    if (await pathExists(workspaceFile)) {
      workspace = await readJsonFile<WorkspaceMeta>(workspaceFile)
      workspace = { ...workspace, rootPath }
    } else {
      workspace = {
        id: nanoid(),
        name: basename(rootPath) || 'easyNote-data',
        rootPath,
        schemaVersion: 1,
        createdAt: now,
        updatedAt: now,
      }
      await writeJsonFileAtomic(workspaceFile, workspace)
    }

    const tasksFile = join(rootPath, 'data', 'tasks.json')
    if (!(await pathExists(tasksFile))) {
      const emptyData: TaskDataFile = {
        schemaVersion: 2,
        revision: 0,
        tags: createDefaultTags(),
        tasks: [],
      }
      await writeJsonFileAtomic(tasksFile, emptyData)
    }

    return workspace
  }

  private async readSettings(): Promise<SettingsFile> {
    if (!(await pathExists(this.settingsPath))) {
      return {}
    }

    try {
      return await readJsonFile<SettingsFile>(this.settingsPath)
    } catch {
      return {}
    }
  }

  private async writeSettings(settings: SettingsFile): Promise<void> {
    await writeJsonFileAtomic(this.settingsPath, settings)
  }
}
