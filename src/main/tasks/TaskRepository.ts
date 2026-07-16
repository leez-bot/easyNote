import { copyFile } from 'node:fs/promises'
import { join } from 'node:path'
import { nanoid } from 'nanoid'
import type {
  Attachment,
  TagInput,
  Task,
  TaskDataFile,
  TaskDataFileV1,
  TaskInput,
  TaskStatus,
  TaskTag,
} from '../../shared/models'
import type { WorkspaceService } from '../workspace/WorkspaceService'
import { ensureDir, pathExists, readJsonFile, writeJsonFileAtomic } from '../utils/fileSystem'
import { createDefaultTags, migrateV1Data } from './taskMigration'

const EMPTY_DOCUMENT = { type: 'doc' as const, content: [{ type: 'paragraph' }] }

export class TaskRepository {
  constructor(private readonly workspace: WorkspaceService) {}

  async list(): Promise<Task[]> {
    const data = await this.readData()
    return [...data.tasks].sort(compareTasks)
  }

  async listTags(): Promise<TaskTag[]> {
    const data = await this.readData()
    return [...data.tags].sort((a, b) => a.createdAt.localeCompare(b.createdAt))
  }

  async create(input: TaskInput): Promise<Task> {
    const title = input.title.trim()
    if (!title) throw new Error('任务标题不能为空')

    const workspace = await this.workspace.requireWorkspace()
    const data = await this.readData()
    this.assertTagIds(data, input.tagIds ?? [])
    const now = new Date().toISOString()
    const task: Task = {
      id: nanoid(),
      title,
      content: input.content ?? EMPTY_DOCUMENT,
      status: input.status,
      priority: input.priority ?? 'none',
      tagIds: input.tagIds ?? [],
      pinned: input.pinned ?? false,
      dueDate: input.dueDate || undefined,
      attachments: [],
      createdAt: now,
      updatedAt: now,
      completedAt: input.status === 'done' ? now : undefined,
      workspaceId: workspace.id,
      source: 'local',
    }
    data.tasks.push(task)
    await this.writeData(data)
    return task
  }

  async update(id: string, input: Partial<TaskInput>): Promise<Task> {
    const data = await this.readData()
    const task = this.findTask(data, id)

    if (input.title !== undefined) {
      const title = input.title.trim()
      if (!title) throw new Error('任务标题不能为空')
      task.title = title
    }
    if (input.content !== undefined) task.content = input.content
    if (input.dueDate !== undefined) task.dueDate = input.dueDate || undefined
    if (input.priority !== undefined) task.priority = input.priority
    if (input.pinned !== undefined) task.pinned = input.pinned
    if (input.tagIds !== undefined) {
      this.assertTagIds(data, input.tagIds)
      task.tagIds = [...new Set(input.tagIds)]
    }
    if (input.status !== undefined) applyStatus(task, input.status)

    task.updatedAt = new Date().toISOString()
    await this.writeData(data)
    return task
  }

  async remove(id: string): Promise<void> {
    const data = await this.readData()
    const nextTasks = data.tasks.filter((task) => task.id !== id)
    if (nextTasks.length === data.tasks.length) throw new Error('任务不存在')
    data.tasks = nextTasks
    await this.writeData(data)
  }

  async setStatus(id: string, status: TaskStatus): Promise<Task> {
    const data = await this.readData()
    const task = this.findTask(data, id)
    applyStatus(task, status)
    task.updatedAt = new Date().toISOString()
    await this.writeData(data)
    return task
  }

  async updateAttachments(taskId: string, attachments: Attachment[]): Promise<Task> {
    const data = await this.readData()
    const task = this.findTask(data, taskId)
    task.attachments = attachments
    task.updatedAt = new Date().toISOString()
    await this.writeData(data)
    return task
  }

  async createTag(input: TagInput): Promise<TaskTag> {
    const data = await this.readData()
    const name = this.normalizeTagName(data, input.name)
    const now = new Date().toISOString()
    const tag: TaskTag = { id: nanoid(), name, color: input.color, createdAt: now, updatedAt: now }
    data.tags.push(tag)
    await this.writeData(data)
    return tag
  }

  async updateTag(id: string, input: TagInput): Promise<TaskTag> {
    const data = await this.readData()
    const tag = data.tags.find((item) => item.id === id)
    if (!tag) throw new Error('标签不存在')
    tag.name = this.normalizeTagName(data, input.name, id)
    tag.color = input.color
    tag.updatedAt = new Date().toISOString()
    await this.writeData(data)
    return tag
  }

  async removeTag(id: string): Promise<void> {
    const data = await this.readData()
    if (!data.tags.some((tag) => tag.id === id)) throw new Error('标签不存在')
    data.tags = data.tags.filter((tag) => tag.id !== id)
    data.tasks.forEach((task) => {
      task.tagIds = task.tagIds.filter((tagId) => tagId !== id)
    })
    await this.writeData(data)
  }

  async replaceData(tags: TaskTag[], tasks: Task[]): Promise<void> {
    const data = await this.readData()
    data.tags = tags
    data.tasks = tasks
    await this.writeData(data)
  }

  private async readData(): Promise<TaskDataFile> {
    const filePath = await this.workspace.getTasksFilePath()
    if (!(await pathExists(filePath))) {
      const emptyData: TaskDataFile = { schemaVersion: 2, revision: 0, tags: createDefaultTags(), tasks: [] }
      await writeJsonFileAtomic(filePath, emptyData)
      return emptyData
    }

    const data = await readJsonFile<TaskDataFile | TaskDataFileV1>(filePath)
    if (data.schemaVersion === 2 && Array.isArray(data.tasks) && Array.isArray(data.tags)) return data
    if (data.schemaVersion === 1 && Array.isArray(data.tasks)) {
      const backupDir = join(await this.workspace.getBackupsDir(), `migration-${Date.now()}`)
      await ensureDir(backupDir)
      await copyFile(filePath, join(backupDir, 'tasks.json'))
      const migrated = migrateV1Data(data)
      await writeJsonFileAtomic(filePath, migrated)
      return migrated
    }
    throw new Error('不支持的任务数据版本')
  }

  private async writeData(data: TaskDataFile): Promise<void> {
    const filePath = await this.workspace.getTasksFilePath()
    await writeJsonFileAtomic(filePath, { ...data, revision: data.revision + 1 })
  }

  private findTask(data: TaskDataFile, id: string): Task {
    const task = data.tasks.find((item) => item.id === id)
    if (!task) throw new Error('任务不存在')
    return task
  }

  private assertTagIds(data: TaskDataFile, tagIds: string[]): void {
    const existing = new Set(data.tags.map((tag) => tag.id))
    if (tagIds.some((id) => !existing.has(id))) throw new Error('任务包含无效标签')
  }

  private normalizeTagName(data: TaskDataFile, value: string, currentId?: string): string {
    const name = value.trim()
    if (!name) throw new Error('标签名称不能为空')
    const duplicate = data.tags.some((tag) => tag.id !== currentId && tag.name.toLowerCase() === name.toLowerCase())
    if (duplicate) throw new Error('标签名称已存在')
    return name
  }
}

function compareTasks(a: Task, b: Task): number {
  if (a.pinned !== b.pinned) return a.pinned ? -1 : 1
  const dueA = a.dueDate ?? '9999-12-31'
  const dueB = b.dueDate ?? '9999-12-31'
  if (dueA !== dueB) return dueA.localeCompare(dueB)
  return b.createdAt.localeCompare(a.createdAt)
}

function applyStatus(task: Task, status: TaskStatus): void {
  const wasDone = task.status === 'done'
  task.status = status
  if (status === 'done' && !task.completedAt) task.completedAt = new Date().toISOString()
  if (wasDone && status !== 'done') task.completedAt = undefined
}
