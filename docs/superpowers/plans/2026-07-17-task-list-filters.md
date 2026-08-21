# 任务列表紧凑筛选 Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 在已完成和全部任务视图提供紧凑的日期弹层筛选、可收起实时标题搜索，并让空筛选结果仍保留分类标题和筛选入口。

**Architecture:** 筛选状态继续由 `TaskList` 组件本地维护。先按当前视图生成分组，再对每个分组的任务依次应用日期和关键词条件，最后应用已有的拖拽排序；分组容器不再因筛选后的任务数组为空而被跳过。

**Tech Stack:** React 18、TypeScript 严格模式、Ant Design 6 `DatePicker.RangePicker` / `Popover` / `Input`、Lucide React、CSS transitions。

---

## 文件结构

- 修改 `src/renderer/features/tasks/TaskList.tsx`：本地筛选状态、工具栏控件、关键词筛选、空分组渲染。
- 修改 `src/renderer/styles/app.css`：紧凑图标按钮、日期弹层、搜索展开/收起动画和分组内空态样式。
- 不修改共享模型、Zustand、IPC、主进程或任务数据文件。

### Task 1: 调整任务列表筛选状态与数据派生

**Files:**
- Modify: `src/renderer/features/tasks/TaskList.tsx`

- [ ] **Step 1: 扩展现有导入与组件状态**

将 Ant Design 导入替换为以下声明，并在 Lucide 导入中加入 `CalendarDays`、`Search` 和 `X`：

```tsx
import { Checkbox, DatePicker, Dropdown, Input, Popover, Tooltip, type MenuProps } from 'antd'
```

在 `TaskList` 内、现有 `dateRange` 状态之后加入：

```tsx
const [searchKeyword, setSearchKeyword] = useState('')
const [searchOpen, setSearchOpen] = useState(false)
```

- [ ] **Step 2: 让派生列表同时使用日期与关键词条件**

将 `orderedGroups` 内的任务派生替换为：

```tsx
tasks: applySavedOrder(
  filterTasks(group.tasks, dateRange, searchKeyword, activeView),
  taskOrders[getOrderKey(workspaceId, viewKey, group.id)],
),
```

将现有 `filterTasksByDateRange` 替换为以下完整函数，日期过滤之后再增加标题关键词过滤：

```tsx
function filterTasks(
  tasks: Task[],
  dateRange: [Dayjs, Dayjs] | null,
  keyword: string,
  view: TaskView,
): Task[] {
  const dateFilteredTasks = !dateRange || view.type !== 'date' || (view.value !== 'done' && view.value !== 'all')
    ? tasks
    : tasks.filter((task) => {
      const timestamp = view.value === 'done' ? task.completedAt ?? task.updatedAt : task.createdAt
      const date = dayjs(timestamp)
      return !date.isBefore(dateRange[0], 'day') && !date.isAfter(dateRange[1], 'day')
    })
  const normalizedKeyword = keyword.trim().toLocaleLowerCase()
  return normalizedKeyword
    ? dateFilteredTasks.filter((task) => task.title.toLocaleLowerCase().includes(normalizedKeyword))
    : dateFilteredTasks
}
```

函数在关键词为空时直接返回日期过滤后的数组；日期范围判断保持完成视图使用 `completedAt ?? updatedAt`、全部任务视图使用 `createdAt` 的现有语义。

### Task 2: 渲染紧凑日期筛选与可收起搜索

**Files:**
- Modify: `src/renderer/features/tasks/TaskList.tsx`

- [ ] **Step 1: 提取分组标题右侧工具栏 JSX**

在 `TaskList` 返回 JSX 之前定义 `renderFilters`，只在 `supportsDateRange` 为真时返回筛选操作。日期筛选使用 `Popover` 包裹 `DatePicker.RangePicker`，标题为空字符串，触发方式为 click：

```tsx
<Popover
  trigger="click"
  placement="bottomRight"
  content={
    <div className="task-date-filter-popover">
      <DatePicker.RangePicker
        size="small"
        allowClear={false}
        format="YY/MM/DD"
        value={dateRange}
        onChange={(value) => setDateRange(value?.[0] && value[1] ? [value[0], value[1]] : null)}
      />
      {dateRange ? <button className="task-filter-clear" type="button" onClick={() => setDateRange(null)}>清空</button> : null}
    </div>
  }
>
  <button className={`task-filter-icon ${dateRange ? 'active' : ''}`} type="button" aria-label="按日期范围筛选">
    <CalendarDays size={16} />
  </button>
</Popover>
```

搜索图标与输入框使用一个 `task-search-filter` 容器。点击图标设置 `searchOpen` 为真；输入框使用受控的 `searchKeyword`，并在 `onKeyDown` 中处理 Escape：清空关键词并收起。输入框后仅在已有关键词时渲染清空按钮，点击后同步清空和收起。

- [ ] **Step 2: 将控件放入每个分组标题且始终渲染分组**

把现有 `orderedGroups.map` 中的条件表达式：

```tsx
orderedGroups.map((group) => group.tasks.length > 0 ? (
```

改为无条件渲染：

```tsx
orderedGroups.map((group) => (
```

在 `.task-group-heading` 的标题按钮后调用 `renderFilters()`。保留任务行的现有映射；在其后、未折叠且 `group.tasks.length === 0` 时插入：

```tsx
<div className="task-group-empty">当前筛选条件下暂无任务</div>
```

删除全局的 `orderedGroups.every(...)` 空态，避免在分组标题和筛选控件之外再渲染无法操作的空白区域。

### Task 3: 添加紧凑筛选控件与空态样式

**Files:**
- Modify: `src/renderer/styles/app.css`

- [ ] **Step 1: 替换宽度固定的日期范围样式**

删除 `.task-date-range { flex: 0 0 172px; }`，添加图标、弹层和搜索容器的稳定尺寸与状态样式：

```css
.task-group-filters { display: flex; align-items: center; gap: 4px; }
.task-filter-icon { width: 28px; height: 28px; display: grid; place-items: center; padding: 0; border: 0; border-radius: 4px; background: transparent; color: #7b8494; }
.task-filter-icon:hover { background: #f0f4f9; color: #2563eb; }
.task-filter-icon.active { color: var(--color-primary); background: var(--color-primary-soft); }
.task-date-filter-popover { display: grid; gap: 8px; }
.task-date-filter-popover .ant-picker { width: 208px; }
.task-filter-clear { justify-self: end; padding: 0; border: 0; background: transparent; color: var(--color-primary); font-size: 12px; }
```

- [ ] **Step 2: 添加搜索展开和空结果布局样式**

为 `.task-search-filter` 指定 `display: flex` 和 `overflow: hidden`。输入包装层使用 `max-width`、`opacity` 和 `transform` 的 transition；关闭状态的最大宽度为 `0` 并禁用指针事件，开启状态最大宽度为 `156px`。输入框高度固定为 `28px`，保证标题栏高度不变化。

添加以下空态样式，确保空态属于分组而非整个滚动容器：

```css
.task-group-empty { min-height: 120px; display: grid; place-items: center; border: 1px dashed var(--color-border); border-radius: 6px; color: #9aa3b1; font-size: 13px; }
```

在 `@media (prefers-reduced-motion: reduce)` 已有的全局规则下无需额外声明，搜索动画会自动被缩短。

### Task 4: 验证类型一致性

**Files:**
- Verify: `src/renderer/features/tasks/TaskList.tsx`
- Verify: `src/renderer/styles/app.css`

- [ ] **Step 1: 运行 TypeScript 检查**

运行：

```powershell
npm run typecheck
```

预期：命令以退出码 `0` 完成，没有 TypeScript 诊断。

- [ ] **Step 2: 人工核对关键状态**

在 Electron 应用中切换“已完成”和“全部任务”，确认：未选日期时图标为灰色；选中范围后图标为蓝色且可从弹层清空；搜索输入随点击展开、输入实时过滤、清空与 Escape 收起；任意筛选组合无结果时仍显示分组标题、筛选控件和 `0 项任务`。

项目约定不新增测试用例；该改动没有新增可独立测试的业务服务或跨进程接口。
