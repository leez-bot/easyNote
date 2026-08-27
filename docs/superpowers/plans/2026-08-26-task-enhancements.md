# Task Enhancements Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task.

**Goal:** 完成 easyNote 的跨天刷新、多任务双向关联、开始日期、优先级识别、窄屏适配和富文本工具增强。

**Architecture:** 扩展 shared Task/TaskInput，并由 TaskRepository 负责默认值、校验和双向关联一致性；renderer 使用统一的本地日期和定时刷新，详情组件负责关联编辑与跳转，Tiptap 继续承载文档格式。

**Tech Stack:** React 18、TypeScript、Zustand、Ant Design 6、Tiptap、Lucide React、Electron IPC。

---

### Task 1: 扩展模型和数据兼容

**Files:**
- Modify: `src/shared/models.ts`
- Modify: `src/main/tasks/taskMigration.ts`
- Modify: `src/main/importExport/ImportExportService.ts`

- [ ] 在 `Task` 与 `TaskInput` 增加 `startDate: string` 和 `relatedTaskIds: string[]`，允许旧数据输入字段缺失。
- [ ] 迁移 v1 任务时从 `createdAt` 计算本地 `YYYY-MM-DD` 开始日期，并设置空关联列表。
- [ ] 导入/合并任务时为缺失字段补默认值，并在合并 ID 重映射后同步重映射 `relatedTaskIds`。

### Task 2: 仓储层双向关联和删除清理

**Files:**
- Modify: `src/main/tasks/TaskRepository.ts`

- [ ] 创建任务时写入开始日期（输入值或当前本地日期）及去重后的关联 ID。
- [ ] 校验关联 ID 存在且不等于当前任务；更新时计算旧/新集合差异并同步双方列表。
- [ ] 删除任务时从剩余任务的 `relatedTaskIds` 移除该 ID 后再写盘。

### Task 3: renderer 日期工具与跨天刷新

**Files:**
- Modify: `src/renderer/shared/date.ts`
- Modify: `src/renderer/shared/taskViews.ts`
- Modify: `src/renderer/features/shell/PanelLayout.tsx`
- Modify: `src/renderer/store/taskStore.ts`

- [ ] 统一使用本地日期键，修正任务列表当天显示和计数的 UTC 偏差。
- [ ] 在 `PanelLayout` 设置到下一自然日的 timeout，并通过 store 维护 `dateRevision` 触发计数、分组与列表重新计算。
- [ ] 新建任务默认传入本地开始日期；旧任务加载时在 renderer 侧提供创建日期回退显示。

### Task 4: 任务详情关联编辑与开始日期

**Files:**
- Modify: `src/renderer/features/tasks/TaskDetail.tsx`
- Modify: `src/renderer/store/taskStore.ts`

- [ ] 使用 Ant Design `Select` 多选、`showSearch` 和标题过滤实现关联任务选择，排除当前任务。
- [ ] 只展示仍存在的关联任务；失效 ID 显示“关联任务已删除”，提供清理动作。
- [ ] 点击关联任务调用 `selectTask` 跳转详情，并在编辑字段中加入开始日期。
- [ ] 草稿转换和保存 payload 包含 `startDate` 与 `relatedTaskIds`。

### Task 5: 列表优先级和窄屏详情布局

**Files:**
- Modify: `src/renderer/features/tasks/TaskList.tsx`
- Modify: `src/renderer/styles/app.css`
- Modify: `src/renderer/features/shell/PanelLayout.tsx`

- [ ] 为高/中/低优先级添加稳定的左侧色条和对应旗标颜色，保留逾期红色图标并区分语义。
- [ ] 调整详情列最小宽度和窄屏断点；字段、日期控件、多选控件设置可收缩并允许换行，避免水平溢出。

### Task 6: Tiptap 常用格式工具

**Files:**
- Modify: `src/renderer/features/tasks/RichTextEditor.tsx`
- Modify: `src/renderer/styles/app.css`
- Modify: `package.json`

- [ ] 引入并配置 `@tiptap/extension-color`、`@tiptap/extension-text-style`、`@tiptap/extension-underline`、`@tiptap/extension-text-align`。
- [ ] 工具栏增加颜色、字号、下划线、删除线和左/中/右/两端对齐控件，并使用 tooltip 与 active 状态。
- [ ] 为字号 mark 增加渲染样式和窄宽度下的工具栏换行规则。

### Task 7: 类型检查与结果核对

**Files:**
- Verify: `src/shared/models.ts`, `src/main/tasks/TaskRepository.ts`, `src/renderer/features/tasks/TaskDetail.tsx`, `src/renderer/features/tasks/RichTextEditor.tsx`

- [ ] 运行 `npm run typecheck`。
- [ ] 若类型检查失败，按错误位置修复，不扩大无关改动。
- [ ] 快速检查导入、创建、删除、详情跳转和窄屏样式涉及的调用链。
