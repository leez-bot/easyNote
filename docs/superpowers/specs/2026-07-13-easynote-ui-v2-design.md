# easyNote UI v2 升级设计

## 1. 目标

将当前基础三栏任务面板升级为设计稿中的完整个人任务工作台。升级同时覆盖界面、交互、数据协议、富文本编辑、标签、优先级、通用附件、自动保存和旧数据迁移，保持本地优先与 Electron 安全边界不变。

## 2. 范围

本次包含：

- 图 2 对应的顶部标题栏、左侧导航、分组任务列表、右侧详情和底部状态栏。
- 快速记录、系统视图、五种状态、优先级、标签、置顶和实时数量统计。
- Tiptap 所见即所得编辑器及防抖自动保存。
- 图片预览、通用文件附件、系统打开和删除。
- TaskDataFile Schema v2、v1 工作区迁移和 v1/v2 导入兼容。
- 默认窗口尺寸与最小窗口尺寸升级。

本次不包含账号、云同步、团队协作、权限、SQLite 和低代码 Schema 引擎。

## 3. 技术方案

采用“协议升级 + Tiptap 编辑器”方案：

- 数据协议升级到 Schema v2，旧数据读取后备份并迁移。
- Renderer 继续通过类型化 preload API 调用主进程，不直接访问文件系统。
- 标签作为 TaskDataFile 内的全局实体维护，任务只保存标签 ID。
- Tiptap 文档以 JSON 结构持久化，避免存储不可控 HTML。
- 自动保存由详情草稿驱动，在 600ms 无输入后提交，并串行化同一任务的保存请求。
- 通用附件继续复制到工作区内部，图片生成数据 URL 预览，其他文件由系统默认应用打开。

## 4. 数据协议

### 4.1 类型

```ts
type TaskStatus = 'todo' | 'doing' | 'done' | 'cancelled' | 'waiting'
type TaskPriority = 'none' | 'low' | 'medium' | 'high'

interface EditorDocument {
  type: 'doc'
  content?: Array<Record<string, unknown>>
}

interface TaskTag {
  id: string
  name: string
  color: string
  createdAt: string
  updatedAt: string
}

interface Attachment {
  id: string
  taskId: string
  fileName: string
  storedName: string
  relativePath: string
  mimeType: string
  size: number
  kind: 'image' | 'file'
  createdAt: string
}

interface Task {
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

interface TaskDataFile {
  schemaVersion: 2
  revision: number
  tags: TaskTag[]
  tasks: Task[]
}
```

### 4.2 状态语义

- `todo`：待办。
- `doing`：进行中。
- `done`：已办，首次进入时写入 `completedAt`。
- `cancelled`：已取消，不计入未办。
- `waiting`：正在等待，仍计入未办。
- 从 `done` 切换到其他状态时清除 `completedAt`。

### 4.3 标签约束

- 名称去除首尾空格后不能为空。
- 同一工作区内忽略大小写去重。
- 标签颜色从预设色板选择，并保存为十六进制颜色。
- 删除标签只从任务的 `tagIds` 中解除引用，不删除任务。

## 5. 数据迁移

读取 Schema v1 时执行以下流程：

1. 将原始 `tasks.json` 复制到 `backups/migration-<timestamp>/tasks.json`。
2. 将纯文本 `description` 转换为 Tiptap 段落文档，保留换行语义。
3. 新增 `priority: 'none'`、`tagIds: []`、`pinned: false`。
4. 根据 MIME 类型为旧附件补充 `kind`。
5. 初始化默认标签：产品、开发、设计、个人、杂项。
6. 以 Schema v2 原子写回。

迁移失败时不覆盖原文件，界面显示错误并允许重新选择工作区。导入服务接受 formatVersion 1 和 2，v1 内容先迁移为 v2，再执行覆盖或合并。

## 6. 主进程与 API

### 6.1 TaskRepository

- 负责 v1/v2 读取、迁移、排序和原子写入。
- 支持任务完整更新、状态更新和附件更新。
- 提供标签新增、更新和删除操作。
- 任务默认按置顶、截止日期、创建时间排序。

### 6.2 AttachmentService

- `addFiles(taskId, options?)` 支持任意文件多选。
- 图片附件保留缩略图预览能力。
- `openFile(relativePath)` 使用系统默认应用打开非图片文件。
- 所有目标路径继续经过工作区边界校验。

### 6.3 ImportExportService

- 导出 manifest 使用 formatVersion 2。
- 导入兼容 formatVersion 1 和 2。
- 合并导入重写冲突任务 ID、标签 ID 和附件引用。
- 校验压缩包路径并在导入前备份当前工作区。

## 7. Renderer 状态设计

Zustand store 增加：

- `tags`：全局标签集合。
- `activeView`：结构化视图选择，覆盖快速记录、日期、状态和标签视图。
- `savingTaskId`、`lastSavedAt`、`saveError`：自动保存状态。
- 标签 CRUD、快速创建、置顶和通用附件操作。

筛选、数量与分组均从任务集合派生，不重复存储。切换视图后，如果当前任务不可见，自动选择第一个可见任务；无可见任务时详情显示空状态。

## 8. 页面结构

### 8.1 顶部标题栏

- 左侧：easyNote 标识、工作区菜单、今日/逾期/未办统计。
- 右侧：导入、导出、新增下拉和窗口控制。
- 新增主按钮创建今日待办；下拉项创建无日期任务。

### 8.2 左侧导航

- 本地工作区：快速记录、今天、即将到期、已完成、全部任务。
- 视图：待办、进行中、已办、已取消、正在等待。
- 标签：产品、开发、设计、个人、杂项及用户新增标签。
- 每项显示实时数量；底部保留设置和工作区入口。

### 8.3 中间列表

- 快速记录区域支持标题输入并按 Enter 创建今日待办。
- 图片快捷按钮创建任务后立即选择图片。
- 任务快捷按钮创建无日期待办。
- 快速记录视图按“今天 / 即将到期 / 已完成”分组。
- 其他视图使用相同紧凑任务行，不额外分组。
- 勾选框即时切换 `done`，任务行显示标签、时间、置顶、附件和高优先级标识。

### 8.4 右侧详情

- 标题直接编辑。
- 状态使用五项分段控件；窄宽度允许换行但不挤压字段。
- 标签、优先级、截止日期在详情内就地修改。
- 显示创建时间和更新时间。
- 右上角提供置顶、标签聚焦和更多菜单；删除需要确认。

### 8.5 富文本编辑器

采用 Tiptap，支持：

- 标题、粗体、斜体、行内代码。
- 无序列表、有序列表、任务列表和引用。
- 链接、图片和表格。
- 全屏编辑切换。

编辑器显示最终排版，不显示 Markdown 源文本。标题、元数据和正文共享同一草稿保存机制。

### 8.6 附件区域

- 图片显示缩略图；点击打开原图预览。
- 其他文件显示文件图标、名称和格式化大小；点击通过系统默认应用打开。
- 悬停显示删除按钮，删除前确认。
- “添加附件”主按钮支持多选文件。

### 8.7 底部状态栏

- 左侧显示当前视图任务数量。
- 右侧显示字数、段落数、最后保存时间和自动保存状态。

## 9. 自动保存

- 草稿变化 600ms 后触发保存。
- 同一任务保存请求串行执行，后续变更合并到下一次提交。
- 切换任务、切换筛选和窗口卸载前尝试冲刷当前草稿。
- 保存成功更新 `lastSavedAt`；保存失败保留草稿并显示重试入口。
- 保存期间不使用覆盖全页的 loading，避免打断连续编辑。

## 10. 视觉规范

- 严格以图 2 为视觉基准：浅色表面、蓝色主操作、红色逾期状态、克制的标签辅助色。
- 三栏宽度约为 `212px / 520px / minmax(520px, 1fr)`，随窗口宽度受控调整。
- 任务行、工具栏、导航项使用稳定高度，动态内容不得推动整体布局。
- 卡片圆角不超过 8px，不使用装饰性渐变、悬浮大卡片或嵌套卡片。
- 默认窗口 `1280 × 760`，最小尺寸 `1024 × 640`。
- 窄窗口隐藏次要统计文字，保留核心三栏和图标操作。

## 11. 错误处理

- 自动保存失败：保留草稿，底栏显示失败状态和重试入口。
- 单个附件添加失败：保留已有附件并提示失败文件。
- 附件丢失：显示失效占位，不阻塞任务详情。
- 系统打开失败：显示明确提示，不修改附件记录。
- 导入失败：保留当前工作区和备份，不写入部分数据。
- 标签校验失败：保持输入状态并显示名称约束。

## 12. 验收标准

- `1280 × 760` 下三栏比例、行密度、控件层级与图 2 一致，无重叠和文字截断。
- 快速创建、系统视图、分组、五状态、标签、优先级、置顶、日期和删除形成完整闭环。
- Tiptap 工具栏功能可用，切换任务或筛选时编辑内容不丢失。
- 图片预览、通用文件添加、删除、打开和导入导出恢复正常。
- v1 工作区可直接迁移，原任务、描述、日期和图片附件保持可用。
- TypeScript 类型检查通过，浏览器完成主视图、最小宽度、主要交互与控制台错误核验。
- 按项目规则不新增测试用例，不运行完整 build 或常规 dev 验证。

