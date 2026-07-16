export type TaskStatus = 'todo' | 'doing' | 'done' | 'cancelled' | 'waiting'
export type TaskPriority = 'none' | 'low' | 'medium' | 'high'
export type AttachmentKind = 'image' | 'file'

export interface EditorDocument {
  type: 'doc'
  content?: Array<Record<string, unknown>>
}

export interface Attachment {
  id: string
  taskId: string
  fileName: string
  storedName: string
  relativePath: string
  mimeType: string
  size: number
  kind: AttachmentKind
  createdAt: string
}

export interface TaskTag {
  id: string
  name: string
  color: string
  createdAt: string
  updatedAt: string
}

export interface Task {
  id: string
  title: string
  content: EditorDocument
  status: TaskStatus
  priority: TaskPriority
  tagIds: string[]
  pinned: boolean
  dueDate?: string
  attachments: Attachment[]
  createdAt: string
  updatedAt: string
  completedAt?: string
  workspaceId: string
  assigneeId?: string
  creatorId?: string
  source: 'local' | 'remote'
  extension?: Record<string, unknown>
}

export interface TaskInput {
  title: string
  content?: EditorDocument
  status: TaskStatus
  priority?: TaskPriority
  tagIds?: string[]
  pinned?: boolean
  dueDate?: string
}

export interface TagInput {
  name: string
  color: string
}

export interface LegacyAttachment extends Omit<Attachment, 'kind'> {}

export interface LegacyTask extends Omit<Task, 'content' | 'priority' | 'tagIds' | 'pinned' | 'attachments'> {
  description?: string
  attachments: LegacyAttachment[]
  status: 'todo' | 'doing' | 'done'
}

export interface WorkspaceMeta {
  id: string
  name: string
  rootPath: string
  schemaVersion: 1
  createdAt: string
  updatedAt: string
}

export interface TaskDataFileV1 {
  schemaVersion: 1
  revision: number
  tasks: LegacyTask[]
}

export interface TaskDataFileV2 {
  schemaVersion: 2
  revision: number
  tags: TaskTag[]
  tasks: Task[]
}

export type TaskDataFile = TaskDataFileV2

export interface ImportResult {
  importedCount: number
  skippedCount: number
}
