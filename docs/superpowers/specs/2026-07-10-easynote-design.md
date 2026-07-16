# easyNote Design Spec

## 1. 背景与目标

easyNote 是一个 Windows 本地端任务管理应用，技术栈采用 React + Electron + TypeScript + Vite。第一版定位为个人任务管理面板，而不是轻量便签或团队协作平台。

核心目标：

- 快速记录和管理个人待办事项。
- 数据完整保存在本地，并支持用户配置保存目录。
- 支持任务导入导出，方便在其他电脑迁移。
- 支持按截止日期筛选任务。
- 支持待办、进行中、已办三种状态。
- 支持图片附件，并保证导出迁移后附件可用。
- 应用常驻置顶，提供悬浮入口和折叠能力，减少对桌面工作的遮挡。
- 为未来团队管理保留数据和架构扩展点，但第一版不实现团队能力。

## 2. 第一版范围

### 2.1 包含

- 首次启动强制选择工作区目录。
- 悬浮入口窗口：始终置顶、可拖动、位置记忆、点击展开主面板。
- 主面板窗口：始终置顶，支持折叠回悬浮入口。
- 三栏任务管理界面：
  - 左侧：日期筛选、状态筛选。
  - 中间：任务列表。
  - 右侧：任务详情编辑与图片附件管理。
- 任务字段：标题、描述、状态、截止日期、附件、创建时间、更新时间、完成时间。
- 本地 JSON 数据存储。
- 图片附件复制进工作区附件目录。
- `.enote` 导入导出包，包含任务数据和附件。
- 导入前自动备份当前数据。

### 2.2 不包含

- 账号体系。
- 云同步。
- 团队成员管理。
- 权限模型。
- 多人实时协同。
- SQLite 存储实现。
- Schema 驱动的可视化配置引擎。

## 3. 方案选择

采用“本地优先 MVP”方案：

- 第一版使用 JSON + 附件目录，降低启动成本。
- 通过 Repository 和 Service 边界隔离数据细节。
- 数据文件带 `schemaVersion` 和 `revision`，为未来迁移 SQLite 或远端服务做准备。
- 任务模型保留团队化扩展字段，但 UI 不暴露。

未采用的方案：

- SQLite 首发：数据层更稳，但首版依赖和迁移机制更重。
- Schema/低代码内核首发：和未来平台化契合，但对个人工具第一版属于过度设计。

## 4. 工作区目录协议

用户首次选择的目录作为完整工作区。

```text
easyNote-data/
├─ workspace.json
├─ data/
│  └─ tasks.json
├─ attachments/
│  └─ <taskId>/
├─ backups/
└─ logs/
```

职责说明：

- `workspace.json`：工作区元信息、当前数据版本。
- `data/tasks.json`：任务数据。
- `attachments/<taskId>/`：每个任务独立附件目录。
- `backups/`：导入前或关键写入前的自动备份。
- `logs/`：本地运行日志，后续可定期清理。

## 5. 数据模型

```ts
type TaskStatus = 'todo' | 'doing' | 'done'

interface Attachment {
  id: string
  taskId: string
  fileName: string
  storedName: string
  relativePath: string
  mimeType: string
  size: number
  createdAt: string
}

interface Task {
  id: string
  title: string
  description?: string
  status: TaskStatus
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

interface TaskDataFile {
  schemaVersion: 1
  revision: number
  tasks: Task[]
}
```

约束：

- 日期筛选以 `dueDate` 为准。
- `createdAt` 仅作为记录字段保留。
- 状态从 `doing` 或 `todo` 切换到 `done` 时写入 `completedAt`。
- 图片附件复制到工作区内部，不引用外部原始路径。
- 第一版保留 `assigneeId`、`creatorId`、`workspaceId` 等字段，但不在界面展示。

## 6. 导入导出

导出文件使用 `.enote` 扩展名，本质为 ZIP 包。

包结构：

```text
export.enote
├─ manifest.json
├─ workspace.json
├─ data/
│  └─ tasks.json
└─ attachments/
   └─ <taskId>/
```

导入流程：

1. 校验扩展名、包结构、`manifest.json` 和 `schemaVersion`。
2. 解压到临时目录。
3. 防止 zip slip，拒绝路径穿越。
4. 导入前备份当前工作区。
5. 支持覆盖导入或合并导入。
6. 合并导入时，任务 ID 冲突生成新 ID，并同步重写附件引用。

## 7. Electron 进程架构

```text
main process
├─ WindowManager
├─ WorkspaceService
├─ TaskRepository
├─ AttachmentService
├─ ImportExportService
└─ IpcHandlers

preload
└─ window.easyNoteApi

renderer
├─ React UI
├─ store
├─ task feature modules
└─ shared components
```

### 7.1 Main Process

- `WindowManager`：管理悬浮入口窗口、主面板窗口、置顶状态、折叠展开、窗口位置记忆。
- `WorkspaceService`：处理首次目录选择、工作区校验、目录切换。
- `TaskRepository`：封装 JSON 读写、数据迁移、原子保存。
- `AttachmentService`：图片复制、附件删除、附件路径解析。
- `ImportExportService`：`.enote` 导入导出。
- `IpcHandlers`：向 preload 暴露受控能力。

### 7.2 Preload

通过 `contextBridge` 暴露类型化 API：

```ts
window.easyNoteApi = {
  workspace: {},
  tasks: {},
  attachments: {},
  importExport: {},
  window: {}
}
```

渲染层不直接访问 `fs`、`path` 或 Electron 原生对象。

### 7.3 Renderer

React 页面只消费 preload API 和本地 store。任务相关 UI 按 feature 拆分，避免把主面板做成大文件。

## 8. 窗口与交互

### 8.1 首次启动

- 检查是否已有可用工作区。
- 如果没有，打开目录选择界面。
- 用户选择目录后初始化 `workspace.json`、`data/tasks.json`、`attachments/`、`backups/`、`logs/`。

### 8.2 悬浮入口

- 小窗口始终置顶。
- 默认贴屏幕右侧。
- 支持拖动并记忆位置。
- 展示 `EN` 标识和简要任务计数。
- 点击展开主面板。

### 8.3 主面板

- 默认尺寸约 `860x560`。
- 始终置顶。
- 无边框窗口，自定义标题栏。
- 左筛选、中列表、右详情。
- 支持折叠回悬浮入口。

## 9. UI 设计方向

视觉方向采用“工具型清爽风”：

- 浅色背景。
- 低饱和灰蓝主色。
- 状态色克制使用。
- 信息密度偏专业工具，不做便签化装饰。
- 卡片圆角控制在 8px 以内。
- 适合长时间置顶使用，不抢工作区注意力。

设计稿文件：

- `docs/design/easynote-ui-design.html`

可视化讨论过程稿：

- `.superpowers/brainstorm/ps-10076-20260710161343/content/window-shape.html`
- `.superpowers/brainstorm/ps-10076-20260710161343/content/main-layout.html`
- `.superpowers/brainstorm/ps-10076-20260710161343/content/visual-style.html`
- `.superpowers/brainstorm/ps-10076-20260710161343/content/final-ui-design.html`

## 10. 安全边界

- `nodeIntegration: false`
- `contextIsolation: true`
- 渲染层不直接访问文件系统。
- 所有文件路径必须限制在当前工作区内。
- 图片导入只允许常见图片类型。
- 导入包解压必须防路径穿越。
- 写 JSON 使用临时文件加原子替换。
- 导入和覆盖写入前创建备份。

## 11. 错误处理

- 工作区不可用：提示用户重新选择目录。
- JSON 解析失败：尝试读取最近备份，并提示用户。
- 附件丢失：任务仍可打开，附件位显示失效状态。
- 导入包无效：拒绝导入并保留当前数据。
- 写入失败：保留内存态提示重试，避免静默丢数据。

## 12. 后续扩展点

- SQLite：替换 `TaskRepository` 实现，保留 UI 和业务服务接口。
- 团队管理：启用 `assigneeId`、`creatorId`、`workspaceId`，增加成员和空间数据表。
- 同步服务：新增 `SyncService`，任务 `source` 从 `local` 扩展为远端来源。
- Schema 驱动：将任务详情表单和筛选配置抽象为可配置协议。

## 13. 当前仓库状态

当前项目目录只有基础 `package.json`，且不是 git 仓库。因此本规格文档已写入项目，但无法执行技能流程中要求的 git commit。
