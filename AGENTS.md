# easyNote 项目指南

## 项目是什么

easyNote 是一个 **本地优先（local-first）的 Windows 桌面任务管理器**。它服务于个人任务管理，而不是团队协作或云端待办产品。用户首次启动时选择一个本地工作区；任务、标签、富文本内容和附件都保存于该工作区，并可打包为 `.enote` 文件在设备间迁移。

核心体验：

- 常驻置顶的小型悬浮入口：显示今日/逾期计数，可拖动；点击后打开主面板。
- 主面板的三栏工作区：左侧导航与标签，中间任务列表与快速录入，右侧任务详情编辑。
- 任务支持五种状态、优先级、标签、置顶、截止日期、富文本正文及图片/通用文件附件。
- 编辑采用自动保存；导入/导出支持 v1/v2 数据兼容和合并/替换模式。

本项目不包含账号、云同步、多人协作、权限系统或远程后端。

## 技术栈

- Electron 33：主进程管理窗口、文件系统和系统对话框。
- electron-vite + Vite：main、preload、renderer 三份构建入口。
- React 18 + TypeScript（严格模式）：渲染层 UI。
- Zustand：renderer 的应用状态与异步动作。
- Ant Design 6 + Lucide React：基础控件与图标；全局主题在 `src/renderer/main.tsx`。
- Tiptap：任务富文本编辑器，支持链接、图片、表格与任务列表。
- `adm-zip`：`.enote` ZIP 导入/导出。
- `nanoid`：任务、标签和附件标识。

常用命令：

```powershell
npm run dev        # Electron 开发模式
npm run typecheck  # tsc --noEmit
npm run build      # 构建 main/preload/renderer
npm run build:app  # electron-builder 打包应用
```

## 总体架构

```text
React renderer
  -> Zustand store
  -> window.easyNoteApi（preload / contextBridge）
  -> IPC handlers
  -> main-process services
  -> 用户选择的本地工作区（JSON + attachments）
```

必须保持这个方向：renderer **不得**直接访问 Node `fs`、`path` 或 Electron 原生对象。任何文件、窗口、导入导出能力都要先在 `src/shared/api.ts` 定义类型，再由 preload 暴露、IPC 注册并最终由 main service 实现。

### 进程职责

- `src/main/main.ts`：应用启动与服务装配；有工作区时默认显示 launcher，无工作区时直接显示 panel。
- `src/main/windows/WindowManager.ts`：无边框主面板、悬浮入口、置顶、窗口收起/展开、最大化和窗口位置持久化。
- `src/main/workspace/WorkspaceService.ts`：选择并初始化工作区，记录当前工作区路径。
- `src/main/tasks/TaskRepository.ts`：任务与标签的 JSON 读写、迁移、原子写入、revision 维护。
- `src/main/attachments/AttachmentService.ts`：从用户选择的路径复制附件到工作区，预览图片，打开/删除附件。
- `src/main/importExport/ImportExportService.ts`：创建/读取 `.enote` ZIP；导入前校验、备份、防路径穿越，并处理 v1/v2 与 ID 冲突。
- `src/main/ipc.ts`：唯一的 IPC 注册点。
- `src/preload/index.ts`：`contextBridge` 暴露 `window.easyNoteApi`；实现必须与 `src/shared/api.ts` 一致。

### Renderer 结构

- `src/renderer/App.tsx`：按窗口 query 参数选择 launcher，按工作区状态选择 `WorkspaceGate` 或 `PanelLayout`。
- `src/renderer/features/shell/`：窗口壳层、标题栏、导航、工作区菜单及 launcher。
- `src/renderer/features/tasks/`：任务列表、详情、快速录入、标签、附件、富文本和自动保存 hook。
- `src/renderer/store/taskStore.ts`：任务、标签、当前视图/选中项，以及所有通过 IPC 执行的应用动作。
- `src/renderer/shared/`：仅 renderer 使用的日期、富文本和任务筛选辅助函数。
- `src/renderer/styles/app.css`：全局设计 token 与布局样式。应用采用高信息密度、浅色、工具型界面；避免无关的视觉重构。

## 数据模型与存储

共享类型只放在 `src/shared/models.ts`。当前数据版本为 v2：

- `Task`：标题、Tiptap `content`、状态（`todo | doing | done | cancelled | waiting`）、优先级、标签 ID、置顶、截止日期、附件和审计时间。
- `TaskTag`：名称和颜色。
- `Attachment`：附件的工作区内相对路径、文件元信息和 `image | file` 类型。
- `TaskDataFileV2`：`schemaVersion`、单调递增的 `revision`、`tags`、`tasks`。

用户工作区结构：

```text
<workspace>/
  workspace.json
  data/tasks.json
  attachments/<taskId>/
  backups/
  logs/
```

写入 JSON 时使用临时文件原子替换。文件路径必须使用 `assertInsideWorkspace` 防止越界；不得存储或信任来自 renderer 的绝对附件路径。修改模型时需要同时考虑 v1 到 v2 的迁移逻辑（`src/main/tasks/taskMigration.ts`）和导入兼容性。

## 关键交互与状态规则

- `TaskDetail` 使用 `useTaskDraft` 做约 600ms 防抖的自动保存。任务切换、删除、添加/删除附件、折叠或关闭窗口前都要先调用 `flushPendingSave`。
- `taskStore` 是 renderer 的单一应用状态来源。服务端成功返回新的任务后，用返回值替换本地任务，避免手工拼接造成状态漂移。
- 当前筛选和排序规则集中在 `src/renderer/shared/taskViews.ts`；日期判断集中在 `src/renderer/shared/date.ts`。
- 附件先复制进工作区再写入任务；只有图片调用 `getPreviewUrl`，普通文件使用系统默认应用打开。
- `.enote` 是 ZIP 包，不是纯 JSON。导出应带 `manifest.json`、工作区元数据、任务数据和附件目录。

## 修改准则

1. 先确认改动属于 renderer、preload 还是 main；跨层能力必须完整贯通 API 类型、preload、IPC、service 和 store。
2. 保持 TypeScript strict 通过。新增字段先更新共享模型，再更新迁移、仓库校验、导入导出和 UI。
3. 不要把短生命周期的编辑草稿放入全局持久状态；草稿由详情组件管理，统计/刷新钩子可放 store。
4. 不要绕过 `TaskRepository` 直接写 `tasks.json`，也不要绕过 `AttachmentService` 操作附件。
5. 保持窗口安全配置：`nodeIntegration: false`、`contextIsolation: true`，并且 API 最小化暴露。
6. 既有中文 UI 字符串存在编码历史问题。编辑时使用 UTF-8，并避免无关的大规模文本或样式格式化。
7. 这个目录当前不是 Git 仓库；不要假设 `git status`、分支或提交可用。

## 验证期望

代码改动至少运行：

```powershell
npm run typecheck
```

涉及 Electron 窗口、IPC、文件对话框或视觉布局时，再运行 `npm run dev` 做人工验证。重点检查：首次选择工作区、悬浮入口与主面板切换、自动保存、附件路径安全、导入前备份以及导入后的任务/标签/附件一致性。
