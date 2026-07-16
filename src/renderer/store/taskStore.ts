import { create } from 'zustand'
import type { EditorDocument, TagInput, Task, TaskInput, TaskStatus, TaskTag, WorkspaceMeta } from '../../shared/models'
import { todayAsLocalDateString } from '../shared/date'
import { EMPTY_DOCUMENT } from '../shared/editor'
import { getVisibleTasks, type TaskView } from '../shared/taskViews'

interface TaskState {
  workspace: WorkspaceMeta | null
  tasks: Task[]
  tags: TaskTag[]
  selectedTaskId: string | null
  pendingEditTaskId: string | null
  activeView: TaskView
  loading: boolean
  savingTaskId: string | null
  lastSavedAt: string | null
  saveError: string | null
  error: string | null
  notice: string | null
  editorStats: { characters: number; paragraphs: number }
  flushPendingSave: (() => Promise<void>) | null
  bootstrap: () => Promise<void>
  chooseWorkspace: () => Promise<void>
  reloadData: () => Promise<void>
  selectTask: (id: string | null) => void
  clearPendingEditTask: () => void
  setActiveView: (view: TaskView) => void
  setEditorStats: (stats: { characters: number; paragraphs: number }) => void
  setFlushPendingSave: (flush: (() => Promise<void>) | null) => void
  createTask: (input: TaskInput) => Promise<Task | null>
  createQuickTask: (title: string, options?: { dueToday?: boolean; addImage?: boolean }) => Promise<Task | null>
  updateTask: (id: string, input: Partial<TaskInput>) => Promise<Task | null>
  setTaskStatus: (id: string, status: TaskStatus) => Promise<void>
  removeTask: (id: string) => Promise<void>
  createTag: (input: TagInput) => Promise<TaskTag | null>
  updateTag: (id: string, input: TagInput) => Promise<void>
  removeTag: (id: string) => Promise<void>
  addFiles: (taskId: string, imagesOnly?: boolean) => Promise<void>
  removeAttachment: (taskId: string, attachmentId: string) => Promise<void>
  openAttachment: (relativePath: string) => Promise<void>
  exportData: () => Promise<void>
  importData: (mode: 'replace' | 'merge') => Promise<void>
  clearNotice: () => void
}

function getErrorMessage(error: unknown, fallback: string): string {
  return error instanceof Error && error.message.trim() && error.message.length <= 64 ? error.message : fallback
}

function getApi() {
  if (!window.easyNoteApi) throw new Error('请在 easyNote 桌面窗口中操作')
  return window.easyNoteApi
}

function replaceTask(tasks: Task[], nextTask: Task): Task[] {
  return tasks.map((task) => task.id === nextTask.id ? nextTask : task)
}

function ensureSelection(tasks: Task[], selectedTaskId: string | null, view: TaskView): string | null {
  const visible = getVisibleTasks(tasks, view)
  return visible.some((task) => task.id === selectedTaskId) ? selectedTaskId : (visible[0]?.id ?? null)
}

export const useTaskStore = create<TaskState>((set, get) => ({
  workspace: null,
  tasks: [],
  tags: [],
  selectedTaskId: null,
  pendingEditTaskId: null,
  activeView: { type: 'quick' },
  loading: false,
  savingTaskId: null,
  lastSavedAt: null,
  saveError: null,
  error: null,
  notice: null,
  editorStats: { characters: 0, paragraphs: 0 },
  flushPendingSave: null,

  bootstrap: async () => {
    set({ loading: true, error: null })
    try {
      const api = getApi()
      const workspace = await api.workspace.getCurrent()
      if (!workspace) {
        set({ workspace: null, tasks: [], tags: [], selectedTaskId: null, pendingEditTaskId: null, loading: false })
        return
      }
      const [tasks, tags] = await Promise.all([api.tasks.list(), api.tags.list()])
      const activeView = get().activeView
      set({ workspace, tasks, tags, selectedTaskId: ensureSelection(tasks, get().selectedTaskId, activeView), loading: false })
    } catch (error) {
      set({ error: getErrorMessage(error, '启动失败'), loading: false })
    }
  },

  chooseWorkspace: async () => {
    set({ loading: true, error: null })
    try {
      await get().flushPendingSave?.()
      const api = getApi()
      const workspace = await api.workspace.chooseDirectory()
      if (!workspace) return set({ loading: false })
      const [tasks, tags] = await Promise.all([api.tasks.list(), api.tags.list()])
      const activeView: TaskView = { type: 'quick' }
      set({ workspace, tasks, tags, activeView, selectedTaskId: ensureSelection(tasks, null, activeView), pendingEditTaskId: null, loading: false })
    } catch (error) {
      set({ error: getErrorMessage(error, '选择目录失败'), loading: false })
    }
  },

  reloadData: async () => {
    try {
      const api = getApi()
      const [tasks, tags] = await Promise.all([api.tasks.list(), api.tags.list()])
      const activeView = get().activeView
      set({ tasks, tags, selectedTaskId: ensureSelection(tasks, get().selectedTaskId, activeView) })
    } catch (error) {
      set({ error: getErrorMessage(error, '刷新任务失败') })
    }
  },

  selectTask: (id) => set({ selectedTaskId: id, pendingEditTaskId: null }),
  clearPendingEditTask: () => set({ pendingEditTaskId: null }),
  setActiveView: (activeView) => set((state) => ({ activeView, selectedTaskId: ensureSelection(state.tasks, state.selectedTaskId, activeView) })),
  setEditorStats: (editorStats) => set({ editorStats }),
  setFlushPendingSave: (flushPendingSave) => set({ flushPendingSave }),

  createTask: async (input) => {
    set({ loading: true, error: null })
    try {
      const task = await getApi().tasks.create(input)
      set((state) => ({ tasks: [task, ...state.tasks], selectedTaskId: task.id, pendingEditTaskId: task.id, activeView: { type: 'quick' }, loading: false }))
      return task
    } catch (error) {
      set({ error: getErrorMessage(error, '新建任务失败'), loading: false })
      return null
    }
  },

  createQuickTask: async (title, options = {}) => {
    const task = await get().createTask({
      title,
      content: EMPTY_DOCUMENT,
      status: 'todo',
      dueDate: options.dueToday === false ? undefined : todayAsLocalDateString(),
    })
    if (task && options.addImage) await get().addFiles(task.id, true)
    return task
  },

  updateTask: async (id, input) => {
    set({ savingTaskId: id, saveError: null, error: null })
    try {
      const task = await getApi().tasks.update(id, input)
      set((state) => ({ tasks: replaceTask(state.tasks, task), savingTaskId: null, lastSavedAt: task.updatedAt }))
      return task
    } catch (error) {
      set({ savingTaskId: null, saveError: getErrorMessage(error, '自动保存失败') })
      return null
    }
  },

  setTaskStatus: async (id, status) => {
    try {
      const task = await getApi().tasks.setStatus(id, status)
      set((state) => ({ tasks: replaceTask(state.tasks, task) }))
    } catch (error) {
      set({ error: getErrorMessage(error, '更新状态失败') })
    }
  },

  removeTask: async (id) => {
    set({ loading: true, error: null })
    try {
      await get().flushPendingSave?.()
      await getApi().tasks.remove(id)
      set((state) => {
        const tasks = state.tasks.filter((task) => task.id !== id)
        return { tasks, selectedTaskId: ensureSelection(tasks, null, state.activeView), loading: false }
      })
    } catch (error) {
      set({ error: getErrorMessage(error, '删除任务失败'), loading: false })
    }
  },

  createTag: async (input) => {
    try {
      const tag = await getApi().tags.create(input)
      set((state) => ({ tags: [...state.tags, tag] }))
      return tag
    } catch (error) {
      set({ error: getErrorMessage(error, '新增标签失败') })
      return null
    }
  },
  updateTag: async (id, input) => {
    try {
      const tag = await getApi().tags.update(id, input)
      set((state) => ({ tags: state.tags.map((item) => item.id === id ? tag : item) }))
    } catch (error) { set({ error: getErrorMessage(error, '更新标签失败') }) }
  },
  removeTag: async (id) => {
    try {
      await getApi().tags.remove(id)
      set((state) => ({
        tags: state.tags.filter((tag) => tag.id !== id),
        tasks: state.tasks.map((task) => ({ ...task, tagIds: task.tagIds.filter((tagId) => tagId !== id) })),
        activeView: state.activeView.type === 'tag' && state.activeView.tagId === id ? { type: 'quick' } : state.activeView,
      }))
    } catch (error) { set({ error: getErrorMessage(error, '删除标签失败') }) }
  },

  addFiles: async (taskId, imagesOnly = false) => {
    try {
      await get().flushPendingSave?.()
      await getApi().attachments.addFiles(taskId, imagesOnly)
      await get().reloadData()
    } catch (error) { set({ error: getErrorMessage(error, '添加附件失败') }) }
  },
  removeAttachment: async (taskId, attachmentId) => {
    try {
      await get().flushPendingSave?.()
      await getApi().attachments.remove(taskId, attachmentId)
      await get().reloadData()
    } catch (error) { set({ error: getErrorMessage(error, '删除附件失败') }) }
  },
  openAttachment: async (relativePath) => {
    try { await getApi().attachments.openFile(relativePath) }
    catch (error) { set({ error: getErrorMessage(error, '打开附件失败') }) }
  },

  exportData: async () => {
    try {
      await get().flushPendingSave?.()
      const result = await getApi().importExport.exportData()
      if (result) set({ notice: '导出完成' })
    } catch (error) { set({ error: getErrorMessage(error, '导出失败') }) }
  },
  importData: async (mode) => {
    set({ loading: true, error: null })
    try {
      await get().flushPendingSave?.()
      const result = await getApi().importExport.importData(mode)
      if (!result) return set({ loading: false })
      await get().reloadData()
      set({ notice: `导入完成：新增 ${result.importedCount} 项`, loading: false })
    } catch (error) { set({ error: getErrorMessage(error, '导入失败'), loading: false }) }
  },
  clearNotice: () => set({ notice: null }),
}))
