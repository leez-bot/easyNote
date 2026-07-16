import type {
  Attachment,
  ImportResult,
  TagInput,
  Task,
  TaskInput,
  TaskStatus,
  TaskTag,
  WorkspaceMeta,
} from './models'

export interface EasyNoteApi {
  workspace: {
    getCurrent: () => Promise<WorkspaceMeta | null>
    chooseDirectory: () => Promise<WorkspaceMeta | null>
  }
  tasks: {
    list: () => Promise<Task[]>
    create: (input: TaskInput) => Promise<Task>
    update: (id: string, input: Partial<TaskInput>) => Promise<Task>
    remove: (id: string) => Promise<void>
    setStatus: (id: string, status: TaskStatus) => Promise<Task>
  }
  tags: {
    list: () => Promise<TaskTag[]>
    create: (input: TagInput) => Promise<TaskTag>
    update: (id: string, input: TagInput) => Promise<TaskTag>
    remove: (id: string) => Promise<void>
  }
  attachments: {
    addFiles: (taskId: string, imagesOnly?: boolean) => Promise<Attachment[]>
    remove: (taskId: string, attachmentId: string) => Promise<void>
    getPreviewUrl: (relativePath: string) => Promise<string>
    openFile: (relativePath: string) => Promise<void>
  }
  importExport: {
    exportData: () => Promise<string | null>
    importData: (mode: 'replace' | 'merge') => Promise<ImportResult | null>
  }
  window: {
    showPanel: () => Promise<void>
    collapseToLauncher: () => Promise<void>
    toggleMaximize: () => Promise<boolean>
    close: () => Promise<void>
    moveLauncher: (deltaX: number, deltaY: number) => Promise<void>
    quit: () => Promise<void>
  }
}
