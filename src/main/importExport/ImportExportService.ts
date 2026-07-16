import AdmZip from 'adm-zip'
import { dialog } from 'electron'
import { cp, mkdtemp, rm } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { basename, extname, join, resolve } from 'node:path'
import { nanoid } from 'nanoid'
import type {
  Attachment,
  ImportResult,
  Task,
  TaskDataFile,
  TaskDataFileV1,
  TaskTag,
} from '../../shared/models'
import type { TaskRepository } from '../tasks/TaskRepository'
import { migrateV1Data } from '../tasks/taskMigration'
import { ensureDir, pathExists, readJsonFile, writeJsonFileAtomic } from '../utils/fileSystem'
import { assertInsideWorkspace } from '../utils/pathGuard'
import type { WorkspaceService } from '../workspace/WorkspaceService'

interface ManifestFile {
  app: 'easyNote'
  formatVersion: 1 | 2
  exportedAt: string
}

export class ImportExportService {
  constructor(
    private readonly workspace: WorkspaceService,
    private readonly tasks: TaskRepository,
  ) {}

  async exportData(): Promise<string | null> {
    const workspace = await this.workspace.requireWorkspace()
    const result = await dialog.showSaveDialog({
      title: '导出 easyNote 数据',
      defaultPath: 'easyNote.enote',
      filters: [{ name: 'easyNote Export', extensions: ['enote'] }],
    })
    if (result.canceled || !result.filePath) return null

    const zip = new AdmZip()
    const manifest: ManifestFile = { app: 'easyNote', formatVersion: 2, exportedAt: new Date().toISOString() }
    zip.addFile('manifest.json', Buffer.from(JSON.stringify(manifest, null, 2)))
    zip.addLocalFile(join(workspace.rootPath, 'workspace.json'))
    zip.addLocalFile(await this.workspace.getTasksFilePath(), 'data')
    const attachmentsDir = await this.workspace.getAttachmentsDir()
    if (await pathExists(attachmentsDir)) zip.addLocalFolder(attachmentsDir, 'attachments')
    zip.writeZip(result.filePath)
    return result.filePath
  }

  async importData(mode: 'replace' | 'merge'): Promise<ImportResult | null> {
    const workspace = await this.workspace.requireWorkspace()
    const result = await dialog.showOpenDialog({
      title: '导入 easyNote 数据',
      properties: ['openFile'],
      filters: [{ name: 'easyNote Export', extensions: ['enote'] }],
    })
    if (result.canceled || result.filePaths.length === 0) return null
    if (extname(result.filePaths[0]).toLowerCase() !== '.enote') throw new Error('请选择 .enote 导入文件')

    const tempDir = await mkdtemp(join(tmpdir(), 'easynote-import-'))
    try {
      const zip = new AdmZip(result.filePaths[0])
      this.validateEntries(zip, tempDir)
      zip.extractAllTo(tempDir, true)
      const manifest = await readJsonFile<ManifestFile>(join(tempDir, 'manifest.json'))
      if (manifest.app !== 'easyNote' || ![1, 2].includes(manifest.formatVersion)) {
        throw new Error('无效的 easyNote 导入包')
      }

      const importedRaw = await readJsonFile<TaskDataFile | TaskDataFileV1>(join(tempDir, 'data', 'tasks.json'))
      const importedData = importedRaw.schemaVersion === 1 ? migrateV1Data(importedRaw) : importedRaw
      if (importedData.schemaVersion !== 2 || !Array.isArray(importedData.tasks) || !Array.isArray(importedData.tags)) {
        throw new Error('不支持的任务数据版本')
      }

      await this.backupCurrentWorkspace()
      if (mode === 'replace') {
        await this.replaceImport(tempDir, importedData)
        return { importedCount: importedData.tasks.length, skippedCount: 0 }
      }
      const importedCount = await this.mergeImport(workspace.id, tempDir, importedData)
      return { importedCount, skippedCount: 0 }
    } finally {
      await rm(tempDir, { recursive: true, force: true })
    }
  }

  private validateEntries(zip: AdmZip, tempDir: string): void {
    for (const entry of zip.getEntries()) {
      assertInsideWorkspace(tempDir, resolve(tempDir, entry.entryName))
    }
  }

  private async backupCurrentWorkspace(): Promise<void> {
    const workspace = await this.workspace.requireWorkspace()
    const backupRoot = join(await this.workspace.getBackupsDir(), `import-${Date.now()}`)
    await ensureDir(backupRoot)
    const tasksFile = await this.workspace.getTasksFilePath()
    if (await pathExists(tasksFile)) await cp(tasksFile, join(backupRoot, 'tasks.json'))
    const attachmentsDir = await this.workspace.getAttachmentsDir()
    if (await pathExists(attachmentsDir)) await cp(attachmentsDir, join(backupRoot, 'attachments'), { recursive: true })
    assertInsideWorkspace(workspace.rootPath, backupRoot)
  }

  private async replaceImport(tempDir: string, importedData: TaskDataFile): Promise<void> {
    const workspace = await this.workspace.requireWorkspace()
    const tasksFile = await this.workspace.getTasksFilePath()
    const attachmentsDir = await this.workspace.getAttachmentsDir()
    await rm(attachmentsDir, { recursive: true, force: true })
    await ensureDir(attachmentsDir)
    const importedAttachmentsDir = join(tempDir, 'attachments')
    if (await pathExists(importedAttachmentsDir)) await cp(importedAttachmentsDir, attachmentsDir, { recursive: true })

    const normalizedTasks = importedData.tasks.map((task) => ({
      ...task,
      workspaceId: workspace.id,
      source: 'local' as const,
      attachments: normalizeImportedAttachments(task.id, task.attachments),
    }))
    await writeJsonFileAtomic(tasksFile, { ...importedData, revision: 0, tasks: normalizedTasks })
  }

  private async mergeImport(workspaceId: string, tempDir: string, importedData: TaskDataFile): Promise<number> {
    const currentTasks = await this.tasks.list()
    const currentTags = await this.tasks.listTags()
    const tagIdMap = new Map<string, string>()
    const mergedTags: TaskTag[] = [...currentTags]

    for (const importedTag of importedData.tags) {
      const sameName = mergedTags.find((tag) => tag.name.toLowerCase() === importedTag.name.toLowerCase())
      if (sameName) {
        tagIdMap.set(importedTag.id, sameName.id)
        continue
      }
      const id = mergedTags.some((tag) => tag.id === importedTag.id) ? nanoid() : importedTag.id
      tagIdMap.set(importedTag.id, id)
      mergedTags.push({ ...importedTag, id, updatedAt: new Date().toISOString() })
    }

    const existingIds = new Set(currentTasks.map((task) => task.id))
    const mergedTasks: Task[] = [...currentTasks]
    for (const importedTask of importedData.tasks) {
      const finalTaskId = existingIds.has(importedTask.id) ? nanoid() : importedTask.id
      existingIds.add(finalTaskId)
      const attachments = await this.copyImportedAttachments(tempDir, importedTask.id, finalTaskId, importedTask.attachments)
      mergedTasks.push({
        ...importedTask,
        id: finalTaskId,
        attachments,
        tagIds: importedTask.tagIds.map((id) => tagIdMap.get(id)).filter((id): id is string => Boolean(id)),
        workspaceId,
        source: 'local',
        updatedAt: new Date().toISOString(),
      })
    }
    await this.tasks.replaceData(mergedTags, mergedTasks)
    return importedData.tasks.length
  }

  private async copyImportedAttachments(
    tempDir: string,
    originalTaskId: string,
    finalTaskId: string,
    attachments: Attachment[],
  ): Promise<Attachment[]> {
    const workspace = await this.workspace.requireWorkspace()
    const sourceDir = join(tempDir, 'attachments', originalTaskId)
    const targetDir = join(workspace.rootPath, 'attachments', finalTaskId)
    await ensureDir(targetDir)
    if (await pathExists(sourceDir)) await cp(sourceDir, targetDir, { recursive: true })
    return normalizeImportedAttachments(finalTaskId, attachments).map((attachment) => ({ ...attachment, id: nanoid() }))
  }
}

function normalizeImportedAttachments(taskId: string, attachments: Attachment[]): Attachment[] {
  return attachments.flatMap((attachment) => {
    const storedName = basename(attachment.storedName)
    if (!storedName || storedName !== attachment.storedName) return []
    return [{
      ...attachment,
      taskId,
      storedName,
      relativePath: `attachments/${taskId}/${storedName}`,
      kind: attachment.mimeType.startsWith('image/') ? 'image' : 'file',
    }]
  })
}
