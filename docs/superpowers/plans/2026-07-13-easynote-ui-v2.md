# easyNote UI v2 Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking. The project is not a Git repository, so commit steps are omitted. Per project rules, no test files are added.

**Goal:** 将 easyNote 升级为设计稿中的完整个人任务工作台，包含 Schema v2、五状态、标签、优先级、快速记录、Tiptap 所见即所得编辑、通用附件和自动保存。

**Architecture:** 保持 Electron main/preload/renderer 三层边界，主进程负责数据迁移、文件和导入导出，Renderer 使用 Zustand 管理工作台状态与派生视图。任务正文持久化为 Tiptap JSON，详情页维护草稿并通过串行防抖机制自动保存。

**Tech Stack:** Electron 33、React 18、TypeScript 5.7、Zustand 5、Ant Design 6、Tiptap、Lucide React、原子 JSON 存储。

---

## 文件职责映射

**共享协议与主进程**

- `src/shared/models.ts`：Schema v1/v2 类型、任务/标签/编辑器文档协议。
- `src/shared/api.ts`：Renderer 可调用的任务、标签、附件 API。
- `src/main/tasks/taskMigration.ts`：v1 → v2 纯数据迁移与默认标签生成。
- `src/main/tasks/TaskRepository.ts`：v2 持久化、迁移备份、任务和标签 CRUD。
- `src/main/attachments/AttachmentService.ts`：通用附件添加、预览、系统打开和删除。
- `src/main/importExport/ImportExportService.ts`：v1/v2 导入兼容与 v2 导出。
- `src/main/ipc.ts`、`src/preload/index.ts`：新增能力的 IPC 映射。

**Renderer 状态与派生逻辑**

- `src/renderer/store/taskStore.ts`：任务、标签、视图、保存状态及异步操作。
- `src/renderer/shared/taskViews.ts`：视图计数、筛选、分组和排序的纯函数。
- `src/renderer/shared/editor.ts`：纯文本迁移、空文档、字数和段落数工具。
- `src/renderer/features/tasks/useTaskDraft.ts`：详情草稿和串行防抖自动保存。

**Renderer 组件**

- `src/renderer/features/shell/PanelLayout.tsx`：顶栏、三栏和底栏总布局。
- `src/renderer/features/shell/TaskSidebar.tsx`：工作区、系统视图、状态和标签导航。
- `src/renderer/features/shell/WorkspaceMenu.tsx`：工作区路径、切换目录和设置入口。
- `src/renderer/features/tasks/QuickCapture.tsx`：快速记录及附件快捷创建。
- `src/renderer/features/tasks/TaskList.tsx`：分组列表与紧凑任务行。
- `src/renderer/features/tasks/TaskDetail.tsx`：元数据、正文、附件和任务菜单。
- `src/renderer/features/tasks/RichTextEditor.tsx`：Tiptap 工具栏与编辑区域。
- `src/renderer/features/tasks/TagPicker.tsx`：标签选择、新增、改名、改色和删除。
- `src/renderer/features/tasks/AttachmentGrid.tsx`：图片和通用文件附件。
- `src/renderer/styles/app.css`：设计稿对应的完整视觉与响应式规则。

## Task 1：安装编辑器依赖并升级共享协议

**Files:**

- Modify: `package.json`
- Modify: `package-lock.json`
- Modify: `src/shared/models.ts`
- Modify: `src/shared/api.ts`

- [ ] **Step 1：安装 Tiptap 必需包**

Run:

```powershell
npm install @tiptap/react @tiptap/pm @tiptap/starter-kit @tiptap/extension-link @tiptap/extension-image @tiptap/extension-table @tiptap/extension-table-row @tiptap/extension-table-header @tiptap/extension-table-cell @tiptap/extension-task-list @tiptap/extension-task-item
```

Expected: `package.json` 和 `package-lock.json` 更新，不直接修改 `node_modules` 中任何源码。

- [ ] **Step 2：定义 Schema v2 类型并保留 v1 迁移输入类型**

在 `src/shared/models.ts` 中使用以下核心协议：

```ts
export type TaskStatus = 'todo' | 'doing' | 'done' | 'cancelled' | 'waiting'
export type TaskPriority = 'none' | 'low' | 'medium' | 'high'
export type AttachmentKind = 'image' | 'file'

export interface EditorDocument {
  type: 'doc'
  content?: Array<Record<string, unknown>>
}

export interface TaskTag {
  id: string
  name: string
  color: string
  createdAt: string
  updatedAt: string
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

export interface TaskDataFileV2 {
  schemaVersion: 2
  revision: number
  tags: TaskTag[]
  tasks: Task[]
}
```

同时保留只用于迁移的 `LegacyTask`、`LegacyAttachment` 和 `TaskDataFileV1`，字段与当前 Schema v1 完全一致。将对外 `TaskDataFile` 改为 `TaskDataFileV2`。

- [ ] **Step 3：扩展 preload API 协议**

将 `src/shared/api.ts` 中相关接口改为：

```ts
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
```

- [ ] **Step 4：运行轻量类型检查并记录预期失败点**

Run:

```powershell
npm run typecheck
```

Expected: 此时旧 Repository、preload 和 Renderer 因新协议产生类型错误；错误应集中在 `description`、`addImages`、`schemaVersion: 1` 和三状态映射，证明后续任务边界完整。

## Task 2：实现 Schema v1 → v2 迁移与标签持久化

**Files:**

- Create: `src/main/tasks/taskMigration.ts`
- Modify: `src/main/tasks/TaskRepository.ts`

- [ ] **Step 1：实现纯数据迁移函数**

在 `taskMigration.ts` 中导出：

```ts
export const DEFAULT_TAGS = [
  { name: '产品', color: '#ef4444' },
  { name: '开发', color: '#f59e0b' },
  { name: '设计', color: '#22c55e' },
  { name: '个人', color: '#8b5cf6' },
  { name: '杂项', color: '#8b6f47' },
] as const

export function textToDocument(value?: string): EditorDocument {
  const lines = (value ?? '').split(/\r?\n/)
  return {
    type: 'doc',
    content: lines.map((line) => ({
      type: 'paragraph',
      content: line ? [{ type: 'text', text: line }] : undefined,
    })),
  }
}

export function migrateV1Data(data: TaskDataFileV1, now = new Date().toISOString()): TaskDataFileV2 {
  const tags = DEFAULT_TAGS.map((tag) => ({ id: nanoid(), ...tag, createdAt: now, updatedAt: now }))
  return {
    schemaVersion: 2,
    revision: data.revision,
    tags,
    tasks: data.tasks.map((task) => ({
      ...task,
      content: textToDocument(task.description),
      priority: 'none',
      tagIds: [],
      pinned: false,
      attachments: task.attachments.map((item) => ({
        ...item,
        kind: item.mimeType.startsWith('image/') ? 'image' : 'file',
      })),
    })).map(({ description: _description, ...task }) => task),
  }
}
```

- [ ] **Step 2：让 Repository 读取并迁移两种版本**

`TaskRepository.readData()` 读取为 `unknown` 后先判断 `schemaVersion`。v2 直接返回；v1 调用 `backupBeforeMigration()`、`migrateV1Data()` 和 `writeJsonFileAtomic()`。备份目录固定为：

```ts
const backupDir = join(await this.workspace.getBackupsDir(), `migration-${Date.now()}`)
await ensureDir(backupDir)
await copyFile(filePath, join(backupDir, 'tasks.json'))
```

空工作区创建 `schemaVersion: 2`、`revision: 0`、`tags: createDefaultTags()`、`tasks: []`。

- [ ] **Step 3：扩展任务写入逻辑**

`create()` 为缺省字段写入：

```ts
content: input.content ?? { type: 'doc', content: [{ type: 'paragraph' }] },
priority: input.priority ?? 'none',
tagIds: input.tagIds ?? [],
pinned: input.pinned ?? false,
```

`update()` 逐字段处理 `content`、`priority`、`tagIds`、`pinned`，并验证所有 `tagIds` 都存在于 `data.tags`。`compareTasks()` 按 `pinned` 降序、`dueDate` 升序、`createdAt` 降序。

- [ ] **Step 4：实现标签 CRUD**

在 Repository 增加：

```ts
listTags(): Promise<TaskTag[]>
createTag(input: TagInput): Promise<TaskTag>
updateTag(id: string, input: TagInput): Promise<TaskTag>
removeTag(id: string): Promise<void>
```

新增和更新时对 `name.trim()` 做忽略大小写去重；删除时同步从全部任务 `tagIds` 中移除该 ID。每次操作只执行一次 `writeData()`。

- [ ] **Step 5：运行类型检查**

Run: `npm run typecheck`

Expected: Repository 与模型相关错误消失，剩余错误仅位于尚未升级的 IPC、附件、导入导出和 Renderer。

## Task 3：升级通用附件、IPC 与 preload

**Files:**

- Modify: `src/main/attachments/AttachmentService.ts`
- Modify: `src/main/ipc.ts`
- Modify: `src/preload/index.ts`

- [ ] **Step 1：将图片选择扩展为通用文件选择**

将 `addImages()` 替换为：

```ts
async addFiles(taskId: string, imagesOnly = false): Promise<Attachment[]> {
  const filters = imagesOnly
    ? [{ name: 'Images', extensions: ['png', 'jpg', 'jpeg', 'gif', 'webp'] }]
    : [{ name: 'All Files', extensions: ['*'] }]
  const result = await dialog.showOpenDialog({
    title: imagesOnly ? '选择图片附件' : '选择附件',
    properties: ['openFile', 'multiSelections'],
    filters,
  })
  // 对每个选择文件执行 stat、生成安全 storedName、复制并追加 Attachment。
}
```

附件 MIME 类型使用扩展名映射常见图片、PDF、Office、文本和压缩包，未知类型使用 `application/octet-stream`。`kind` 由 MIME 是否以 `image/` 开头决定。

- [ ] **Step 2：拆分预览和系统打开能力**

保留工作区路径校验，增加：

```ts
async getPreviewUrl(relativePath: string): Promise<string> {
  // 仅 image 类型读取并返回 data URL，其他类型抛出“不支持预览”。
}

async openFile(relativePath: string): Promise<void> {
  const error = await shell.openPath(filePath)
  if (error) throw new Error('无法打开附件')
}
```

- [ ] **Step 3：注册任务标签和附件 IPC**

在 `src/main/ipc.ts` 增加 `tags:list/create/update/remove`，并将附件通道替换为 `attachments:addFiles/getPreviewUrl/openFile/remove`。

- [ ] **Step 4：同步 preload 实现**

`src/preload/index.ts` 必须逐项映射共享 API，Renderer 不直接引入 Electron：

```ts
tags: {
  list: () => ipcRenderer.invoke('tags:list'),
  create: (input) => ipcRenderer.invoke('tags:create', input),
  update: (id, input) => ipcRenderer.invoke('tags:update', id, input),
  remove: (id) => ipcRenderer.invoke('tags:remove', id),
},
```

- [ ] **Step 5：运行类型检查**

Run: `npm run typecheck`

Expected: IPC、preload 和 AttachmentService 类型错误消失。

## Task 4：升级导入导出协议

**Files:**

- Modify: `src/main/importExport/ImportExportService.ts`

- [ ] **Step 1：升级 manifest 并兼容两种格式**

```ts
interface ManifestFile {
  app: 'easyNote'
  formatVersion: 1 | 2
  exportedAt: string
}
```

导出始终写 `formatVersion: 2`。导入读取任务数据后，根据 `schemaVersion` 调用 `migrateV1Data()` 或直接校验 v2。

- [ ] **Step 2：放宽附件扩展名限制但保持路径安全**

`normalizeImportedAttachments()` 只接受 `basename(storedName) === storedName` 的安全文件名，不再用图片扩展名白名单过滤；根据 MIME 补齐 `kind`。

- [ ] **Step 3：正确合并标签和任务引用**

合并导入时建立 `Map<oldTagId, newTagId>`：同名标签复用当前 ID，不同名标签保留；ID 冲突时生成新 ID。随后重写每个导入任务的 `tagIds`。任务 ID 冲突逻辑继续重写附件任务目录与引用。

- [ ] **Step 4：覆盖导入写入完整 v2 数据**

覆盖导入统一重写 `workspaceId`、`source` 和附件相对路径，写入：

```ts
const data: TaskDataFile = {
  schemaVersion: 2,
  revision: 0,
  tags: importedData.tags,
  tasks: normalizedTasks,
}
```

- [ ] **Step 5：运行类型检查**

Run: `npm run typecheck`

Expected: 主进程与共享协议无 TypeScript 错误，剩余错误集中在 Renderer。

## Task 5：实现视图派生逻辑并升级 Zustand store

**Files:**

- Create: `src/renderer/shared/taskViews.ts`
- Create: `src/renderer/shared/editor.ts`
- Modify: `src/renderer/store/taskStore.ts`

- [ ] **Step 1：定义结构化视图与派生函数**

在 `taskViews.ts` 中定义：

```ts
export type TaskView =
  | { type: 'quick' }
  | { type: 'date'; value: 'today' | 'upcoming' | 'done' | 'all' }
  | { type: 'status'; value: TaskStatus }
  | { type: 'tag'; tagId: string }

export interface TaskGroup {
  id: 'today' | 'upcoming' | 'done' | 'results'
  label: string
  tasks: Task[]
}

export function getVisibleTasks(tasks: Task[], view: TaskView, now = new Date()): Task[]
export function groupTasks(tasks: Task[], view: TaskView, now = new Date()): TaskGroup[]
export function getTaskCounts(tasks: Task[], now = new Date()): TaskCounts
```

`upcoming` 表示截止日期晚于今天且未完成/未取消；`done` 仅包含 `status === 'done'`；`open` 排除 `done` 和 `cancelled`。

- [ ] **Step 2：实现编辑器文档工具**

`editor.ts` 提供：

```ts
export const EMPTY_DOCUMENT: EditorDocument = { type: 'doc', content: [{ type: 'paragraph' }] }
export function getDocumentText(document: EditorDocument): string
export function getDocumentStats(document: EditorDocument): { characters: number; paragraphs: number }
```

递归遍历 `content` 数组，仅累计字符串 `text` 字段；段落数统计 `paragraph`、`heading`、`listItem` 和 `taskItem` 节点。

- [ ] **Step 3：重塑 store 状态**

移除 `dateFilter/statusFilter`，新增：

```ts
tags: TaskTag[]
activeView: TaskView
savingTaskId: string | null
lastSavedAt: string | null
saveError: string | null
editorStats: { characters: number; paragraphs: number }
flushPendingSave: (() => Promise<void>) | null
setEditorStats(stats: { characters: number; paragraphs: number }): void
setFlushPendingSave(flush: (() => Promise<void>) | null): void
setActiveView(view: TaskView): void
createQuickTask(title: string, options?: { dueToday?: boolean; addImage?: boolean }): Promise<Task | null>
createTag(input: TagInput): Promise<TaskTag | null>
updateTag(id: string, input: TagInput): Promise<void>
removeTag(id: string): Promise<void>
addFiles(taskId: string, imagesOnly?: boolean): Promise<void>
openAttachment(relativePath: string): Promise<void>
```

- [ ] **Step 4：调整异步状态策略**

`bootstrap()` 和导入后并行读取 `tasks.list()` 与 `tags.list()`。`updateTask()` 不再打开全局 loading，而是设置 `savingTaskId`，成功后替换任务并写入 `lastSavedAt`，失败时保留当前任务并设置 `saveError`。

- [ ] **Step 5：确保视图选择有效**

`setActiveView()` 使用 `getVisibleTasks()` 校正选中任务；创建任务后切换到 `{ type: 'quick' }` 并选中新任务。删除任务、标签或导入后同样重新计算 selection。

- [ ] **Step 6：运行类型检查**

Run: `npm run typecheck`

Expected: store 与派生工具通过；旧 UI 组件因消费旧状态而报错，下一任务修复。

## Task 6：搭建图 2 的标题栏、侧栏和底栏骨架

**Files:**

- Create: `src/renderer/features/shell/TaskSidebar.tsx`
- Create: `src/renderer/features/shell/WorkspaceMenu.tsx`
- Modify: `src/renderer/features/shell/PanelLayout.tsx`
- Delete: `src/renderer/features/tasks/TaskFilters.tsx`
- Modify: `src/main/windows/WindowManager.ts`

- [ ] **Step 1：实现工作区菜单**

`WorkspaceMenu` 使用 Ant Design Dropdown，显示工作区名称、根路径和“切换工作区”命令，命令调用 `chooseWorkspace()`。设置入口复用该菜单，不增加未定义的设置页面。

- [ ] **Step 2：实现导航侧栏**

`TaskSidebar` 从 store 读取 `tasks/tags/activeView`，用 `getTaskCounts()` 渲染以下项目：

```ts
const workspaceViews = [
  ['quick', '快速记录'],
  ['today', '今天'],
  ['upcoming', '即将到期'],
  ['done', '已完成'],
  ['all', '全部任务'],
]

const statusViews: Array<[TaskStatus, string]> = [
  ['todo', '待办'],
  ['doing', '进行中'],
  ['done', '已办'],
  ['cancelled', '已取消'],
  ['waiting', '正在等待'],
]
```

标签区使用标签颜色 swatch 和数量，标题右侧 `Plus` 打开 `TagPicker` 的创建模式。

- [ ] **Step 3：重写 PanelLayout 结构**

结构固定为：

```tsx
<main className="panel-shell">
  <header className="titlebar">...</header>
  <div className="panel-body">
    <TaskSidebar />
    <TaskList />
    <TaskDetail />
  </div>
  <footer className="statusbar">...</footer>
</main>
```

标题栏使用 `useMemo` 统计今日、逾期和未办；导入采用 Dropdown 提供“合并导入/覆盖导入”，移除占高度的 `import-strip`。

- [ ] **Step 4：升级窗口尺寸**

`WindowManager` 默认：

```ts
width: 1280,
height: 760,
minWidth: 1024,
minHeight: 640,
```

已有用户窗口状态小于最小尺寸时，用 `Math.max()` 归一化宽高。

- [ ] **Step 5：运行类型检查**

Run: `npm run typecheck`

Expected: shell 与侧栏无类型错误；列表和详情仍待升级。

## Task 7：实现快速记录与分组任务列表

**Files:**

- Create: `src/renderer/features/tasks/QuickCapture.tsx`
- Modify: `src/renderer/features/tasks/TaskList.tsx`

- [ ] **Step 1：实现 QuickCapture**

组件维护 `title`，只在非空时提交：

```tsx
const submit = async (mode: 'today' | 'inbox' | 'image'): Promise<void> => {
  const value = title.trim()
  if (!value) return
  const task = await createQuickTask(value, {
    dueToday: mode !== 'inbox',
    addImage: mode === 'image',
  })
  if (task) setTitle('')
}
```

Enter 执行 `today`；图片按钮执行 `image`；任务按钮执行 `inbox`；展开按钮切换 `quick-capture-expanded`，提供更大的单行输入区而不打开弹窗。

- [ ] **Step 2：实现任务行**

任务行使用真实 checkbox；切换为完成时调用 `setTaskStatus(task.id, checked ? 'done' : 'todo')`。标题、首个标签、时间、置顶、附件和高优先级图标各占稳定列，防止动态内容推挤。

- [ ] **Step 3：实现分组列表**

`TaskList` 调用 `groupTasks(tasks, activeView)`。快速记录视图在列表顶部显示 `QuickCapture` 并渲染“今天 / 即将到期 / 已完成”；其他视图渲染单一“结果”组。空组不显示，全部为空时显示明确空状态。

- [ ] **Step 4：处理选择与滚动**

点击任务行选中任务；选中项变化后用 `data-task-id` 定位并 `scrollIntoView({ block: 'nearest' })`，只在元素不在可视区时滚动。

- [ ] **Step 5：运行类型检查**

Run: `npm run typecheck`

Expected: 快速记录和任务列表通过类型检查。

## Task 8：实现标签选择、Tiptap 编辑器与自动保存详情

**Files:**

- Create: `src/renderer/features/tasks/TagPicker.tsx`
- Create: `src/renderer/features/tasks/RichTextEditor.tsx`
- Create: `src/renderer/features/tasks/useTaskDraft.ts`
- Modify: `src/renderer/features/tasks/TaskDetail.tsx`

- [ ] **Step 1：实现 TagPicker**

使用 Ant Design Popover，列表每行包含颜色 swatch、checkbox、重命名和删除菜单。创建/编辑表单包含名称输入和固定色板：

```ts
const TAG_COLORS = ['#ef4444', '#f59e0b', '#22c55e', '#3b82f6', '#8b5cf6', '#8b6f47']
```

选择标签只更新任务草稿的 `tagIds`；CRUD 调用 store。删除前使用 Popconfirm。

- [ ] **Step 2：实现 RichTextEditor 扩展集合**

初始化扩展：

```ts
const editor = useEditor({
  extensions: [
    StarterKit,
    Link.configure({ openOnClick: false }),
    Image,
    Table.configure({ resizable: true }),
    TableRow,
    TableHeader,
    TableCell,
    TaskList,
    TaskItem.configure({ nested: true }),
  ],
  content: value,
  onUpdate: ({ editor }) => onChange(editor.getJSON() as EditorDocument),
})
```

工具栏命令覆盖标题、粗体、斜体、行内代码、无序/有序/任务列表、引用、链接、图片和表格。链接和图片使用小型 Popover 输入 URL；全屏按钮只切换 `.rich-editor-fullscreen`。

- [ ] **Step 3：实现草稿 Hook**

`useTaskDraft(task)` 返回：

```ts
{
  draft: TaskInput,
  updateDraft: (patch: Partial<TaskInput>) => void,
  flush: () => Promise<void>,
  dirty: boolean,
}
```

内部用 `setTimeout(..., 600)` 防抖，用 Promise 链串行调用 `updateTask(task.id, draft)`。任务 ID 切换前先 `flush()`；使用 revision ref 丢弃旧任务返回结果，不覆盖新任务草稿。

- [ ] **Step 4：重写 TaskDetail 元数据区域**

移除查看/编辑双模式和手动保存按钮。标题用无边框输入；状态使用五项 Segmented；截止日期用 DatePicker；优先级用 Select；标签用 TagPicker；创建/更新时间只读显示；置顶按钮修改 `pinned`；更多菜单提供删除。

- [ ] **Step 5：接入编辑器和底部统计**

`RichTextEditor` 绑定 `draft.content`。通过 `getDocumentStats()` 把字符数和段落数写入一个轻量 UI 状态，可由 `PanelLayout` 从选中任务草稿读取；为避免把短生命周期草稿放入全局任务数据，新增 store 字段 `editorStats` 和 `setEditorStats()`，详情每次内容变化同步统计。

- [ ] **Step 6：关闭窗口前冲刷草稿**

`TaskDetail` 将 `flush` 注册到 store 的 `flushPendingSave`；`PanelLayout.closePanel()` 和 `collapse()` 先 `await flushPendingSave?.()`，再调用窗口 IPC。

- [ ] **Step 7：运行类型检查**

Run: `npm run typecheck`

Expected: 富文本、草稿、标签和详情组件通过类型检查。

## Task 9：升级通用附件界面与保存状态栏

**Files:**

- Modify: `src/renderer/features/tasks/AttachmentGrid.tsx`
- Modify: `src/renderer/features/shell/PanelLayout.tsx`
- Modify: `src/renderer/store/taskStore.ts`

- [ ] **Step 1：只为图片加载预览**

`AttachmentGrid` 过滤 `kind === 'image'` 后调用 `getPreviewUrl()`；非图片不触发预览 API。预览失败时为该附件标记 `missing`，显示失效占位。

- [ ] **Step 2：渲染统一附件卡片**

图片卡片显示缩略图；文件卡片显示 `FileText` 图标、文件名和格式化大小。点击图片打开 Ant Design Image Preview；点击文件调用 `openAttachment()`。删除按钮包裹 Popconfirm。

大小格式化函数固定为：

```ts
function formatFileSize(size: number): string {
  if (size < 1024) return `${size} B`
  if (size < 1024 * 1024) return `${Math.round(size / 1024)} KB`
  return `${(size / 1024 / 1024).toFixed(1)} MB`
}
```

- [ ] **Step 3：添加通用附件按钮**

“添加附件”调用 `addFiles(task.id, false)`；保留右侧下拉菜单，“添加图片”调用 `addFiles(task.id, true)`。

- [ ] **Step 4：完成底栏状态**

底栏左侧显示 `getVisibleTasks(...).length`。右侧显示 `editorStats`、`lastSavedAt` 和以下状态之一：

```ts
savingTaskId ? '正在保存' : saveError ? '保存失败，点击重试' : '已自动保存'
```

失败状态点击执行 `flushPendingSave`。

- [ ] **Step 5：运行类型检查**

Run: `npm run typecheck`

Expected: `tsc --noEmit` 退出码为 0。

## Task 10：按设计稿完成样式、响应式与最终核验

**Files:**

- Modify: `src/renderer/styles/app.css`
- Modify: `src/renderer/main.tsx`
- Modify: `src/renderer/features/shell/LauncherView.tsx`（仅在共享变量变更影响悬浮入口时调整）

- [ ] **Step 1：统一设计 Token**

保留清爽工具型基调并更新：

```css
:root {
  --color-bg: #f7f9fc;
  --color-surface: #ffffff;
  --color-sidebar: #f8fafc;
  --color-border: #dfe5ee;
  --color-border-strong: #cbd5e1;
  --color-text: #172033;
  --color-muted: #7b8494;
  --color-primary: #2563eb;
  --color-primary-soft: #eaf2ff;
  --color-danger: #ef4444;
  --color-success: #16a34a;
  --titlebar-height: 56px;
  --statusbar-height: 44px;
  --sidebar-width: 212px;
  --list-width: 520px;
}
```

在 `main.tsx` 的 Ant Design ConfigProvider 中同步 primary、borderRadius、fontSize 和 controlHeight token。

- [ ] **Step 2：实现稳定三栏布局**

```css
.panel-body {
  height: calc(100% - var(--titlebar-height) - var(--statusbar-height));
  display: grid;
  grid-template-columns: var(--sidebar-width) minmax(420px, var(--list-width)) minmax(480px, 1fr);
}
```

侧栏、列表、详情各自独立滚动；标题栏和底栏固定。任务行高度、图标按钮尺寸、标签宽度和附件卡片比例使用稳定约束。

- [ ] **Step 3：实现设计稿组件状态**

补齐导航 hover/active、任务 selected/done/overdue、状态分段、编辑器 toolbar/active、附件 hover/remove、保存 success/error、空状态和 focus-visible。卡片圆角不超过 8px，letter-spacing 固定为 0。

- [ ] **Step 4：实现 1024px 最小宽度降级**

在 `@media (max-width: 1180px)` 下将侧栏压缩到 184px、列表压缩到 420px，隐藏标题栏统计项中的“项”字和附件卡片大小文字；不得隐藏任务操作或详情字段。

- [ ] **Step 5：执行必要类型检查**

Run:

```powershell
npm run typecheck
```

Expected: `tsc --noEmit` 退出码 0，无 TypeScript 错误。

- [ ] **Step 6：启动一次本地界面核验服务**

由于 Electron Renderer 依赖 preload，使用项目现有 Electron dev 命令只做本次必要视觉核验：

```powershell
npm run dev
```

Expected: Electron 主窗口启动，无启动异常。该命令仅在最终视觉核验阶段运行，不作为常规验证反复执行。

- [ ] **Step 7：用浏览器/桌面截图核对目标视口**

核对 `1280 × 760` 和 `1024 × 640`：

- 三栏、标题栏和底栏无重叠。
- 最长导航文字、五状态分段、任务标签和附件名称不溢出。
- 快速记录、状态切换、标签选择、富文本工具栏、附件添加和自动保存反馈可见且可操作。
- 控制台无 error；图片预览非空，通用文件卡片可见。

- [ ] **Step 8：检查最终文件范围**

Run:

```powershell
Get-ChildItem src -Recurse -File | Select-Object FullName,Length
```

Expected: 变更仅覆盖本计划列出的协议、主进程服务、Renderer 状态/组件、样式和窗口配置；`node_modules` 源文件未被修改，未新增测试文件。

## 完成定义

- Schema v1 工作区可备份并迁移到 v2。
- 图 2 中的工作区导航、快速记录、分组列表、五状态、标签、优先级、置顶、富文本、通用附件和自动保存均形成可用闭环。
- 导出生成 v2 包，导入兼容 v1/v2。
- `npm run typecheck` 通过。
- 目标窗口尺寸下无明显布局溢出、重叠或空白渲染。
- 未新增测试用例，未修改 `node_modules` 源文件，未进行范围外重构。
