import { dialog, shell } from 'electron'
import { copyFile, readFile, rm, stat, unlink } from 'node:fs/promises'
import { basename, extname, join, relative } from 'node:path'
import { nanoid } from 'nanoid'
import type { Attachment } from '../../shared/models'
import type { TaskRepository } from '../tasks/TaskRepository'
import { ensureDir, pathExists } from '../utils/fileSystem'
import { assertInsideWorkspace } from '../utils/pathGuard'
import type { WorkspaceService } from '../workspace/WorkspaceService'

const IMAGE_EXTENSIONS = new Set(['.png', '.jpg', '.jpeg', '.gif', '.webp'])
const MIME_TYPES: Record<string, string> = {
  '.png': 'image/png', '.jpg': 'image/jpeg', '.jpeg': 'image/jpeg', '.gif': 'image/gif', '.webp': 'image/webp',
  '.pdf': 'application/pdf', '.txt': 'text/plain', '.md': 'text/markdown', '.json': 'application/json',
  '.csv': 'text/csv', '.zip': 'application/zip', '.doc': 'application/msword',
  '.docx': 'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
  '.xls': 'application/vnd.ms-excel',
  '.xlsx': 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
  '.ppt': 'application/vnd.ms-powerpoint',
  '.pptx': 'application/vnd.openxmlformats-officedocument.presentationml.presentation',
}

export class AttachmentService {
  constructor(
    private readonly workspace: WorkspaceService,
    private readonly tasks: TaskRepository,
  ) {}

  async addFiles(taskId: string, imagesOnly = false): Promise<Attachment[]> {
    const workspace = await this.workspace.requireWorkspace()
    const result = await dialog.showOpenDialog({
      title: imagesOnly ? '选择图片附件' : '选择附件',
      properties: ['openFile', 'multiSelections'],
      filters: imagesOnly ? [{ name: 'Images', extensions: ['png', 'jpg', 'jpeg', 'gif', 'webp'] }] : undefined,
    })
    if (result.canceled || result.filePaths.length === 0) return []

    const currentTask = (await this.tasks.list()).find((task) => task.id === taskId)
    if (!currentTask) throw new Error('任务不存在')

    const taskAttachmentDir = join(workspace.rootPath, 'attachments', taskId)
    await ensureDir(taskAttachmentDir)
    const createdAt = new Date().toISOString()
    const nextAttachments: Attachment[] = [...currentTask.attachments]

    for (const sourcePath of result.filePaths) {
      const extension = extname(sourcePath).toLowerCase()
      if (imagesOnly && !IMAGE_EXTENSIONS.has(extension)) continue
      const fileInfo = await stat(sourcePath)
      const storedName = `${nanoid()}${extension}`
      const targetPath = join(taskAttachmentDir, storedName)
      assertInsideWorkspace(workspace.rootPath, targetPath)
      await copyFile(sourcePath, targetPath)
      const mimeType = getMimeType(extension)
      nextAttachments.push({
        id: nanoid(),
        taskId,
        fileName: basename(sourcePath) || storedName,
        storedName,
        relativePath: normalizeRelative(relative(workspace.rootPath, targetPath)),
        mimeType,
        size: fileInfo.size,
        kind: mimeType.startsWith('image/') ? 'image' : 'file',
        createdAt,
      })
    }
    const updatedTask = await this.tasks.updateAttachments(taskId, nextAttachments)
    return updatedTask.attachments
  }

  async remove(taskId: string, attachmentId: string): Promise<void> {
    const workspace = await this.workspace.requireWorkspace()
    const currentTask = (await this.tasks.list()).find((task) => task.id === taskId)
    if (!currentTask) throw new Error('任务不存在')
    const target = currentTask.attachments.find((attachment) => attachment.id === attachmentId)
    if (!target) return
    const filePath = join(workspace.rootPath, target.relativePath)
    assertInsideWorkspace(workspace.rootPath, filePath)
    if (await pathExists(filePath)) await unlink(filePath)
    await this.tasks.updateAttachments(taskId, currentTask.attachments.filter((item) => item.id !== attachmentId))
  }

  async getPreviewUrl(relativePath: string): Promise<string> {
    const workspace = await this.workspace.requireWorkspace()
    const filePath = join(workspace.rootPath, relativePath)
    assertInsideWorkspace(workspace.rootPath, filePath)
    const extension = extname(filePath).toLowerCase()
    if (!IMAGE_EXTENSIONS.has(extension)) throw new Error('该附件不支持预览')
    const content = await readFile(filePath)
    return `data:${getMimeType(extension)};base64,${content.toString('base64')}`
  }

  async openFile(relativePath: string): Promise<void> {
    const workspace = await this.workspace.requireWorkspace()
    const filePath = join(workspace.rootPath, relativePath)
    assertInsideWorkspace(workspace.rootPath, filePath)
    if (!(await pathExists(filePath))) throw new Error('附件文件不存在')
    const error = await shell.openPath(filePath)
    if (error) throw new Error('无法打开附件')
  }

  async removeTaskAttachments(taskId: string): Promise<void> {
    const workspace = await this.workspace.requireWorkspace()
    const taskAttachmentDir = join(workspace.rootPath, 'attachments', taskId)
    assertInsideWorkspace(workspace.rootPath, taskAttachmentDir)
    if (await pathExists(taskAttachmentDir)) await rm(taskAttachmentDir, { recursive: true, force: true })
  }
}

function normalizeRelative(value: string): string {
  return value.replace(/\\/g, '/')
}

function getMimeType(extension: string): string {
  return MIME_TYPES[extension] ?? 'application/octet-stream'
}
