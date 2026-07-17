import { dialog, shell, ipcMain, app, screen, BrowserWindow } from "electron";
import { access, readFile, mkdir, writeFile, rename, stat, copyFile, unlink, rm, mkdtemp, cp } from "node:fs/promises";
import { dirname, resolve, relative, isAbsolute, join, extname, basename } from "node:path";
import { nanoid } from "nanoid";
import AdmZip from "adm-zip";
import { tmpdir } from "node:os";
import { readFileSync, mkdirSync, writeFileSync, existsSync } from "node:fs";
import { fileURLToPath } from "node:url";
async function ensureDir(dirPath) {
  await mkdir(dirPath, { recursive: true });
}
async function pathExists(targetPath) {
  try {
    await access(targetPath);
    return true;
  } catch (error) {
    if (error.code === "ENOENT") {
      return false;
    }
    throw error;
  }
}
async function readJsonFile(filePath) {
  const content = await readFile(filePath, "utf-8");
  return JSON.parse(content);
}
async function writeJsonFileAtomic(filePath, data) {
  await ensureDir(dirname(filePath));
  const tempPath = `${filePath}.tmp`;
  await writeFile(tempPath, `${JSON.stringify(data, null, 2)}
`, "utf-8");
  await rename(tempPath, filePath);
}
function assertInsideWorkspace(workspaceRoot, targetPath) {
  const root = resolve(workspaceRoot);
  const target = resolve(targetPath);
  const relativePath = relative(root, target);
  if (relativePath.startsWith("..") || relativePath === ".." || isAbsolute(relativePath)) {
    throw new Error("目标路径不在当前工作区内");
  }
}
const IMAGE_EXTENSIONS = /* @__PURE__ */ new Set([".png", ".jpg", ".jpeg", ".gif", ".webp"]);
const MIME_TYPES = {
  ".png": "image/png",
  ".jpg": "image/jpeg",
  ".jpeg": "image/jpeg",
  ".gif": "image/gif",
  ".webp": "image/webp",
  ".pdf": "application/pdf",
  ".txt": "text/plain",
  ".md": "text/markdown",
  ".json": "application/json",
  ".csv": "text/csv",
  ".zip": "application/zip",
  ".doc": "application/msword",
  ".docx": "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
  ".xls": "application/vnd.ms-excel",
  ".xlsx": "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
  ".ppt": "application/vnd.ms-powerpoint",
  ".pptx": "application/vnd.openxmlformats-officedocument.presentationml.presentation"
};
class AttachmentService {
  constructor(workspace, tasks) {
    this.workspace = workspace;
    this.tasks = tasks;
  }
  async addFiles(taskId, imagesOnly = false) {
    const workspace = await this.workspace.requireWorkspace();
    const result = await dialog.showOpenDialog({
      title: imagesOnly ? "选择图片附件" : "选择附件",
      properties: ["openFile", "multiSelections"],
      filters: imagesOnly ? [{ name: "Images", extensions: ["png", "jpg", "jpeg", "gif", "webp"] }] : void 0
    });
    if (result.canceled || result.filePaths.length === 0) return [];
    const currentTask = (await this.tasks.list()).find((task) => task.id === taskId);
    if (!currentTask) throw new Error("任务不存在");
    const taskAttachmentDir = join(workspace.rootPath, "attachments", taskId);
    await ensureDir(taskAttachmentDir);
    const createdAt = (/* @__PURE__ */ new Date()).toISOString();
    const nextAttachments = [...currentTask.attachments];
    for (const sourcePath of result.filePaths) {
      const extension = extname(sourcePath).toLowerCase();
      if (imagesOnly && !IMAGE_EXTENSIONS.has(extension)) continue;
      const fileInfo = await stat(sourcePath);
      const storedName = `${nanoid()}${extension}`;
      const targetPath = join(taskAttachmentDir, storedName);
      assertInsideWorkspace(workspace.rootPath, targetPath);
      await copyFile(sourcePath, targetPath);
      const mimeType = getMimeType(extension);
      nextAttachments.push({
        id: nanoid(),
        taskId,
        fileName: basename(sourcePath) || storedName,
        storedName,
        relativePath: normalizeRelative(relative(workspace.rootPath, targetPath)),
        mimeType,
        size: fileInfo.size,
        kind: mimeType.startsWith("image/") ? "image" : "file",
        createdAt
      });
    }
    const updatedTask = await this.tasks.updateAttachments(taskId, nextAttachments);
    return updatedTask.attachments;
  }
  async remove(taskId, attachmentId) {
    const workspace = await this.workspace.requireWorkspace();
    const currentTask = (await this.tasks.list()).find((task) => task.id === taskId);
    if (!currentTask) throw new Error("任务不存在");
    const target = currentTask.attachments.find((attachment) => attachment.id === attachmentId);
    if (!target) return;
    const filePath = join(workspace.rootPath, target.relativePath);
    assertInsideWorkspace(workspace.rootPath, filePath);
    if (await pathExists(filePath)) await unlink(filePath);
    await this.tasks.updateAttachments(taskId, currentTask.attachments.filter((item) => item.id !== attachmentId));
  }
  async getPreviewUrl(relativePath) {
    const workspace = await this.workspace.requireWorkspace();
    const filePath = join(workspace.rootPath, relativePath);
    assertInsideWorkspace(workspace.rootPath, filePath);
    const extension = extname(filePath).toLowerCase();
    if (!IMAGE_EXTENSIONS.has(extension)) throw new Error("该附件不支持预览");
    const content = await readFile(filePath);
    return `data:${getMimeType(extension)};base64,${content.toString("base64")}`;
  }
  async openFile(relativePath) {
    const workspace = await this.workspace.requireWorkspace();
    const filePath = join(workspace.rootPath, relativePath);
    assertInsideWorkspace(workspace.rootPath, filePath);
    if (!await pathExists(filePath)) throw new Error("附件文件不存在");
    const error = await shell.openPath(filePath);
    if (error) throw new Error("无法打开附件");
  }
  async removeTaskAttachments(taskId) {
    const workspace = await this.workspace.requireWorkspace();
    const taskAttachmentDir = join(workspace.rootPath, "attachments", taskId);
    assertInsideWorkspace(workspace.rootPath, taskAttachmentDir);
    if (await pathExists(taskAttachmentDir)) await rm(taskAttachmentDir, { recursive: true, force: true });
  }
}
function normalizeRelative(value) {
  return value.replace(/\\/g, "/");
}
function getMimeType(extension) {
  return MIME_TYPES[extension] ?? "application/octet-stream";
}
const DEFAULT_TAGS = [
  { name: "产品", color: "#ef4444" },
  { name: "开发", color: "#f59e0b" },
  { name: "设计", color: "#22c55e" },
  { name: "个人", color: "#8b5cf6" },
  { name: "杂项", color: "#8b6f47" }
];
function createDefaultTags(now = (/* @__PURE__ */ new Date()).toISOString()) {
  return DEFAULT_TAGS.map((tag) => ({
    id: nanoid(),
    ...tag,
    createdAt: now,
    updatedAt: now
  }));
}
function textToDocument(value) {
  const lines = (value ?? "").split(/\r?\n/);
  return {
    type: "doc",
    content: lines.map((line) => ({
      type: "paragraph",
      content: line ? [{ type: "text", text: line }] : void 0
    }))
  };
}
function migrateV1Data(data, now = (/* @__PURE__ */ new Date()).toISOString()) {
  return {
    schemaVersion: 2,
    revision: data.revision,
    tags: createDefaultTags(now),
    tasks: data.tasks.map(({ description, ...task }) => ({
      ...task,
      content: textToDocument(description),
      priority: "none",
      tagIds: [],
      pinned: false,
      attachments: task.attachments.map((attachment) => ({
        ...attachment,
        kind: attachment.mimeType.startsWith("image/") ? "image" : "file"
      }))
    }))
  };
}
class ImportExportService {
  constructor(workspace, tasks) {
    this.workspace = workspace;
    this.tasks = tasks;
  }
  async exportData() {
    const workspace = await this.workspace.requireWorkspace();
    const result = await dialog.showSaveDialog({
      title: "导出 easyNote 数据",
      defaultPath: "easyNote.enote",
      filters: [{ name: "easyNote Export", extensions: ["enote"] }]
    });
    if (result.canceled || !result.filePath) return null;
    const zip = new AdmZip();
    const manifest = { app: "easyNote", formatVersion: 2, exportedAt: (/* @__PURE__ */ new Date()).toISOString() };
    zip.addFile("manifest.json", Buffer.from(JSON.stringify(manifest, null, 2)));
    zip.addLocalFile(join(workspace.rootPath, "workspace.json"));
    zip.addLocalFile(await this.workspace.getTasksFilePath(), "data");
    const attachmentsDir = await this.workspace.getAttachmentsDir();
    if (await pathExists(attachmentsDir)) zip.addLocalFolder(attachmentsDir, "attachments");
    zip.writeZip(result.filePath);
    return result.filePath;
  }
  async importData(mode) {
    const workspace = await this.workspace.requireWorkspace();
    const result = await dialog.showOpenDialog({
      title: "导入 easyNote 数据",
      properties: ["openFile"],
      filters: [{ name: "easyNote Export", extensions: ["enote"] }]
    });
    if (result.canceled || result.filePaths.length === 0) return null;
    if (extname(result.filePaths[0]).toLowerCase() !== ".enote") throw new Error("请选择 .enote 导入文件");
    const tempDir = await mkdtemp(join(tmpdir(), "easynote-import-"));
    try {
      const zip = new AdmZip(result.filePaths[0]);
      this.validateEntries(zip, tempDir);
      zip.extractAllTo(tempDir, true);
      const manifest = await readJsonFile(join(tempDir, "manifest.json"));
      if (manifest.app !== "easyNote" || ![1, 2].includes(manifest.formatVersion)) {
        throw new Error("无效的 easyNote 导入包");
      }
      const importedRaw = await readJsonFile(join(tempDir, "data", "tasks.json"));
      const importedData = importedRaw.schemaVersion === 1 ? migrateV1Data(importedRaw) : importedRaw;
      if (importedData.schemaVersion !== 2 || !Array.isArray(importedData.tasks) || !Array.isArray(importedData.tags)) {
        throw new Error("不支持的任务数据版本");
      }
      await this.backupCurrentWorkspace();
      if (mode === "replace") {
        await this.replaceImport(tempDir, importedData);
        return { importedCount: importedData.tasks.length, skippedCount: 0 };
      }
      const importedCount = await this.mergeImport(workspace.id, tempDir, importedData);
      return { importedCount, skippedCount: 0 };
    } finally {
      await rm(tempDir, { recursive: true, force: true });
    }
  }
  validateEntries(zip, tempDir) {
    for (const entry of zip.getEntries()) {
      assertInsideWorkspace(tempDir, resolve(tempDir, entry.entryName));
    }
  }
  async backupCurrentWorkspace() {
    const workspace = await this.workspace.requireWorkspace();
    const backupRoot = join(await this.workspace.getBackupsDir(), `import-${Date.now()}`);
    await ensureDir(backupRoot);
    const tasksFile = await this.workspace.getTasksFilePath();
    if (await pathExists(tasksFile)) await cp(tasksFile, join(backupRoot, "tasks.json"));
    const attachmentsDir = await this.workspace.getAttachmentsDir();
    if (await pathExists(attachmentsDir)) await cp(attachmentsDir, join(backupRoot, "attachments"), { recursive: true });
    assertInsideWorkspace(workspace.rootPath, backupRoot);
  }
  async replaceImport(tempDir, importedData) {
    const workspace = await this.workspace.requireWorkspace();
    const tasksFile = await this.workspace.getTasksFilePath();
    const attachmentsDir = await this.workspace.getAttachmentsDir();
    await rm(attachmentsDir, { recursive: true, force: true });
    await ensureDir(attachmentsDir);
    const importedAttachmentsDir = join(tempDir, "attachments");
    if (await pathExists(importedAttachmentsDir)) await cp(importedAttachmentsDir, attachmentsDir, { recursive: true });
    const normalizedTasks = importedData.tasks.map((task) => ({
      ...task,
      workspaceId: workspace.id,
      source: "local",
      attachments: normalizeImportedAttachments(task.id, task.attachments)
    }));
    await writeJsonFileAtomic(tasksFile, { ...importedData, revision: 0, tasks: normalizedTasks });
  }
  async mergeImport(workspaceId, tempDir, importedData) {
    const currentTasks = await this.tasks.list();
    const currentTags = await this.tasks.listTags();
    const tagIdMap = /* @__PURE__ */ new Map();
    const mergedTags = [...currentTags];
    for (const importedTag of importedData.tags) {
      const sameName = mergedTags.find((tag) => tag.name.toLowerCase() === importedTag.name.toLowerCase());
      if (sameName) {
        tagIdMap.set(importedTag.id, sameName.id);
        continue;
      }
      const id = mergedTags.some((tag) => tag.id === importedTag.id) ? nanoid() : importedTag.id;
      tagIdMap.set(importedTag.id, id);
      mergedTags.push({ ...importedTag, id, updatedAt: (/* @__PURE__ */ new Date()).toISOString() });
    }
    const existingIds = new Set(currentTasks.map((task) => task.id));
    const mergedTasks = [...currentTasks];
    for (const importedTask of importedData.tasks) {
      const finalTaskId = existingIds.has(importedTask.id) ? nanoid() : importedTask.id;
      existingIds.add(finalTaskId);
      const attachments = await this.copyImportedAttachments(tempDir, importedTask.id, finalTaskId, importedTask.attachments);
      mergedTasks.push({
        ...importedTask,
        id: finalTaskId,
        attachments,
        tagIds: importedTask.tagIds.map((id) => tagIdMap.get(id)).filter((id) => Boolean(id)),
        workspaceId,
        source: "local",
        updatedAt: (/* @__PURE__ */ new Date()).toISOString()
      });
    }
    await this.tasks.replaceData(mergedTags, mergedTasks);
    return importedData.tasks.length;
  }
  async copyImportedAttachments(tempDir, originalTaskId, finalTaskId, attachments) {
    const workspace = await this.workspace.requireWorkspace();
    const sourceDir = join(tempDir, "attachments", originalTaskId);
    const targetDir = join(workspace.rootPath, "attachments", finalTaskId);
    await ensureDir(targetDir);
    if (await pathExists(sourceDir)) await cp(sourceDir, targetDir, { recursive: true });
    return normalizeImportedAttachments(finalTaskId, attachments).map((attachment) => ({ ...attachment, id: nanoid() }));
  }
}
function normalizeImportedAttachments(taskId, attachments) {
  return attachments.flatMap((attachment) => {
    const storedName = basename(attachment.storedName);
    if (!storedName || storedName !== attachment.storedName) return [];
    return [{
      ...attachment,
      taskId,
      storedName,
      relativePath: `attachments/${taskId}/${storedName}`,
      kind: attachment.mimeType.startsWith("image/") ? "image" : "file"
    }];
  });
}
function registerIpcHandlers(services) {
  ipcMain.handle("window:showPanel", () => {
    services.windows.showPanel();
  });
  ipcMain.handle("window:collapseToLauncher", () => {
    services.windows.collapseToLauncher();
  });
  ipcMain.handle("window:toggleMaximize", () => services.windows.togglePanelMaximize());
  ipcMain.handle("window:close", () => {
    services.windows.closePanel();
  });
  ipcMain.handle("window:beginLauncherDrag", () => services.windows.beginLauncherDrag());
  ipcMain.handle("window:moveLauncher", () => services.windows.moveLauncher());
  ipcMain.handle("window:quit", () => {
    app.quit();
  });
  ipcMain.handle("workspace:getCurrent", () => services.workspace.getCurrentWorkspace());
  ipcMain.handle("workspace:chooseDirectory", () => services.workspace.chooseWorkspaceDirectory());
  ipcMain.handle("tasks:list", () => services.tasks.list());
  ipcMain.handle("tasks:create", (_event, input) => services.tasks.create(input));
  ipcMain.handle("tasks:update", (_event, id, input) => services.tasks.update(id, input));
  ipcMain.handle("tasks:setStatus", (_event, id, status) => services.tasks.setStatus(id, status));
  ipcMain.handle("tasks:remove", async (_event, id) => {
    await services.tasks.remove(id);
    await services.attachments.removeTaskAttachments(id);
  });
  ipcMain.handle("tags:list", () => services.tasks.listTags());
  ipcMain.handle("tags:create", (_event, input) => services.tasks.createTag(input));
  ipcMain.handle("tags:update", (_event, id, input) => services.tasks.updateTag(id, input));
  ipcMain.handle("tags:remove", (_event, id) => services.tasks.removeTag(id));
  ipcMain.handle("attachments:addFiles", (_event, taskId, imagesOnly) => services.attachments.addFiles(taskId, imagesOnly));
  ipcMain.handle("attachments:remove", (_event, taskId, attachmentId) => services.attachments.remove(taskId, attachmentId));
  ipcMain.handle("attachments:getPreviewUrl", (_event, relativePath) => services.attachments.getPreviewUrl(relativePath));
  ipcMain.handle("attachments:openFile", (_event, relativePath) => services.attachments.openFile(relativePath));
  ipcMain.handle("importExport:exportData", () => services.importExport.exportData());
  ipcMain.handle("importExport:importData", (_event, mode) => services.importExport.importData(mode));
}
const EMPTY_DOCUMENT = { type: "doc", content: [{ type: "paragraph" }] };
class TaskRepository {
  constructor(workspace) {
    this.workspace = workspace;
  }
  async list() {
    const data = await this.readData();
    return [...data.tasks].sort(compareTasks);
  }
  async listTags() {
    const data = await this.readData();
    return [...data.tags].sort((a, b) => a.createdAt.localeCompare(b.createdAt));
  }
  async create(input) {
    const title = input.title.trim();
    if (!title) throw new Error("任务标题不能为空");
    const workspace = await this.workspace.requireWorkspace();
    const data = await this.readData();
    this.assertTagIds(data, input.tagIds ?? []);
    const now = (/* @__PURE__ */ new Date()).toISOString();
    const task = {
      id: nanoid(),
      title,
      content: input.content ?? EMPTY_DOCUMENT,
      status: input.status,
      priority: input.priority ?? "none",
      tagIds: input.tagIds ?? [],
      pinned: input.pinned ?? false,
      dueDate: input.dueDate || void 0,
      attachments: [],
      createdAt: now,
      updatedAt: now,
      completedAt: input.status === "done" ? now : void 0,
      workspaceId: workspace.id,
      source: "local"
    };
    data.tasks.push(task);
    await this.writeData(data);
    return task;
  }
  async update(id, input) {
    const data = await this.readData();
    const task = this.findTask(data, id);
    if (input.title !== void 0) {
      const title = input.title.trim();
      if (!title) throw new Error("任务标题不能为空");
      task.title = title;
    }
    if (input.content !== void 0) task.content = input.content;
    if (input.dueDate !== void 0) task.dueDate = input.dueDate || void 0;
    if (input.priority !== void 0) task.priority = input.priority;
    if (input.pinned !== void 0) task.pinned = input.pinned;
    if (input.tagIds !== void 0) {
      this.assertTagIds(data, input.tagIds);
      task.tagIds = [...new Set(input.tagIds)];
    }
    if (input.status !== void 0) applyStatus(task, input.status);
    task.updatedAt = (/* @__PURE__ */ new Date()).toISOString();
    await this.writeData(data);
    return task;
  }
  async remove(id) {
    const data = await this.readData();
    const nextTasks = data.tasks.filter((task) => task.id !== id);
    if (nextTasks.length === data.tasks.length) throw new Error("任务不存在");
    data.tasks = nextTasks;
    await this.writeData(data);
  }
  async setStatus(id, status) {
    const data = await this.readData();
    const task = this.findTask(data, id);
    applyStatus(task, status);
    task.updatedAt = (/* @__PURE__ */ new Date()).toISOString();
    await this.writeData(data);
    return task;
  }
  async updateAttachments(taskId, attachments) {
    const data = await this.readData();
    const task = this.findTask(data, taskId);
    task.attachments = attachments;
    task.updatedAt = (/* @__PURE__ */ new Date()).toISOString();
    await this.writeData(data);
    return task;
  }
  async createTag(input) {
    const data = await this.readData();
    const name = this.normalizeTagName(data, input.name);
    const now = (/* @__PURE__ */ new Date()).toISOString();
    const tag = { id: nanoid(), name, color: input.color, createdAt: now, updatedAt: now };
    data.tags.push(tag);
    await this.writeData(data);
    return tag;
  }
  async updateTag(id, input) {
    const data = await this.readData();
    const tag = data.tags.find((item) => item.id === id);
    if (!tag) throw new Error("标签不存在");
    tag.name = this.normalizeTagName(data, input.name, id);
    tag.color = input.color;
    tag.updatedAt = (/* @__PURE__ */ new Date()).toISOString();
    await this.writeData(data);
    return tag;
  }
  async removeTag(id) {
    const data = await this.readData();
    if (!data.tags.some((tag) => tag.id === id)) throw new Error("标签不存在");
    data.tags = data.tags.filter((tag) => tag.id !== id);
    data.tasks.forEach((task) => {
      task.tagIds = task.tagIds.filter((tagId) => tagId !== id);
    });
    await this.writeData(data);
  }
  async replaceData(tags, tasks) {
    const data = await this.readData();
    data.tags = tags;
    data.tasks = tasks;
    await this.writeData(data);
  }
  async readData() {
    const filePath = await this.workspace.getTasksFilePath();
    if (!await pathExists(filePath)) {
      const emptyData = { schemaVersion: 2, revision: 0, tags: createDefaultTags(), tasks: [] };
      await writeJsonFileAtomic(filePath, emptyData);
      return emptyData;
    }
    const data = await readJsonFile(filePath);
    if (data.schemaVersion === 2 && Array.isArray(data.tasks) && Array.isArray(data.tags)) return data;
    if (data.schemaVersion === 1 && Array.isArray(data.tasks)) {
      const backupDir = join(await this.workspace.getBackupsDir(), `migration-${Date.now()}`);
      await ensureDir(backupDir);
      await copyFile(filePath, join(backupDir, "tasks.json"));
      const migrated = migrateV1Data(data);
      await writeJsonFileAtomic(filePath, migrated);
      return migrated;
    }
    throw new Error("不支持的任务数据版本");
  }
  async writeData(data) {
    const filePath = await this.workspace.getTasksFilePath();
    await writeJsonFileAtomic(filePath, { ...data, revision: data.revision + 1 });
  }
  findTask(data, id) {
    const task = data.tasks.find((item) => item.id === id);
    if (!task) throw new Error("任务不存在");
    return task;
  }
  assertTagIds(data, tagIds) {
    const existing = new Set(data.tags.map((tag) => tag.id));
    if (tagIds.some((id) => !existing.has(id))) throw new Error("任务包含无效标签");
  }
  normalizeTagName(data, value, currentId) {
    const name = value.trim();
    if (!name) throw new Error("标签名称不能为空");
    const duplicate = data.tags.some((tag) => tag.id !== currentId && tag.name.toLowerCase() === name.toLowerCase());
    if (duplicate) throw new Error("标签名称已存在");
    return name;
  }
}
function compareTasks(a, b) {
  if (a.pinned !== b.pinned) return a.pinned ? -1 : 1;
  const dueA = a.dueDate ?? "9999-12-31";
  const dueB = b.dueDate ?? "9999-12-31";
  if (dueA !== dueB) return dueA.localeCompare(dueB);
  return b.createdAt.localeCompare(a.createdAt);
}
function applyStatus(task, status) {
  const wasDone = task.status === "done";
  task.status = status;
  if (status === "done" && !task.completedAt) task.completedAt = (/* @__PURE__ */ new Date()).toISOString();
  if (wasDone && status !== "done") task.completedAt = void 0;
}
const currentDir = dirname(fileURLToPath(import.meta.url));
const unpackagedIconPath = join(process.cwd(), "build", "icon.ico");
const packagedIconPath = join(process.resourcesPath, "icon.ico");
const LAUNCHER_WIDTH = 92;
const LAUNCHER_HEIGHT = 52;
class WindowManager {
  launcherWindow = null;
  panelWindow = null;
  launcherDragOffset = null;
  statePath = join(app.getPath("userData"), "window-state.json");
  windowState = this.readWindowState();
  createLauncherWindow() {
    if (this.launcherWindow && !this.launcherWindow.isDestroyed()) {
      return this.launcherWindow;
    }
    const { workArea } = screen.getPrimaryDisplay();
    const launcherPosition = this.windowState.launcher ?? {
      x: workArea.x + workArea.width - 88,
      y: workArea.y + Math.round(workArea.height * 0.28)
    };
    this.launcherWindow = new BrowserWindow({
      width: LAUNCHER_WIDTH,
      height: LAUNCHER_HEIGHT,
      minWidth: LAUNCHER_WIDTH,
      minHeight: LAUNCHER_HEIGHT,
      maxWidth: LAUNCHER_WIDTH,
      maxHeight: LAUNCHER_HEIGHT,
      x: launcherPosition.x,
      y: launcherPosition.y,
      frame: false,
      transparent: true,
      backgroundColor: "#00000000",
      hasShadow: false,
      resizable: false,
      alwaysOnTop: true,
      skipTaskbar: true,
      show: false,
      webPreferences: {
        preload: join(currentDir, "../preload/index.cjs"),
        contextIsolation: true,
        nodeIntegration: false
      }
    });
    this.launcherWindow.setAlwaysOnTop(true, "floating");
    this.loadRenderer(this.launcherWindow, "launcher");
    this.launcherWindow.on("show", () => this.enforceLauncherHitArea());
    this.launcherWindow.on("ready-to-show", () => this.enforceLauncherHitArea());
    this.launcherWindow.on("moved", () => this.saveLauncherPosition());
    this.launcherWindow.on("closed", () => {
      this.saveLauncherPosition();
      this.launcherWindow = null;
    });
    return this.launcherWindow;
  }
  createPanelWindow() {
    if (this.panelWindow && !this.panelWindow.isDestroyed()) {
      return this.panelWindow;
    }
    const panelBounds = this.getVisiblePanelBounds();
    const icon = getWindowIconPath();
    this.panelWindow = new BrowserWindow({
      width: Math.max(panelBounds.width, 1024),
      height: Math.max(panelBounds.height, 640),
      minWidth: 1024,
      minHeight: 640,
      x: panelBounds.x,
      y: panelBounds.y,
      title: "easyNote",
      frame: false,
      autoHideMenuBar: true,
      resizable: true,
      show: false,
      ...icon ? { icon } : {},
      webPreferences: {
        preload: join(currentDir, "../preload/index.cjs"),
        contextIsolation: true,
        nodeIntegration: false
      }
    });
    this.loadRenderer(this.panelWindow);
    this.panelWindow.on("moved", () => this.savePanelBounds());
    this.panelWindow.on("resized", () => this.savePanelBounds());
    this.panelWindow.on("closed", () => {
      this.savePanelBounds();
      this.panelWindow = null;
    });
    return this.panelWindow;
  }
  showLauncher() {
    const launcher = this.createLauncherWindow();
    if (this.panelWindow && !this.panelWindow.isDestroyed()) {
      this.panelWindow.hide();
    }
    this.enforceLauncherHitArea();
    launcher.show();
    launcher.focus();
  }
  showPanel() {
    const panel = this.createPanelWindow();
    if (this.launcherWindow && !this.launcherWindow.isDestroyed()) {
      this.launcherWindow.hide();
    }
    panel.show();
    panel.focus();
  }
  collapseToLauncher() {
    this.showLauncher();
  }
  togglePanelMaximize() {
    if (!this.panelWindow || this.panelWindow.isDestroyed()) {
      return false;
    }
    if (this.panelWindow.isMaximized()) {
      this.panelWindow.unmaximize();
      return false;
    }
    this.panelWindow.maximize();
    return true;
  }
  closePanel() {
    app.quit();
  }
  beginLauncherDrag() {
    if (!this.launcherWindow || this.launcherWindow.isDestroyed()) {
      return;
    }
    const bounds = this.launcherWindow.getBounds();
    const cursor = screen.getCursorScreenPoint();
    this.launcherDragOffset = { x: cursor.x - bounds.x, y: cursor.y - bounds.y };
  }
  moveLauncher() {
    if (!this.launcherWindow || this.launcherWindow.isDestroyed() || !this.launcherDragOffset) {
      return;
    }
    const cursor = screen.getCursorScreenPoint();
    this.launcherWindow.setBounds({
      x: Math.round(cursor.x - this.launcherDragOffset.x),
      y: Math.round(cursor.y - this.launcherDragOffset.y),
      width: LAUNCHER_WIDTH,
      height: LAUNCHER_HEIGHT
    });
    this.enforceLauncherHitArea();
    this.saveLauncherPosition();
  }
  getPanelWindow() {
    return this.panelWindow;
  }
  getLauncherWindow() {
    return this.launcherWindow;
  }
  loadRenderer(window, mode) {
    const devUrl = process.env.ELECTRON_RENDERER_URL;
    if (devUrl) {
      const url = new URL(devUrl);
      if (mode) {
        url.searchParams.set("mode", mode);
      }
      void window.loadURL(url.toString());
      return;
    }
    void window.loadFile(join(currentDir, "../renderer/index.html"), {
      query: mode ? { mode } : void 0
    });
  }
  readWindowState() {
    try {
      return JSON.parse(readFileSync(this.statePath, "utf-8"));
    } catch {
      return {};
    }
  }
  writeWindowState() {
    try {
      mkdirSync(dirname(this.statePath), { recursive: true });
      writeFileSync(this.statePath, `${JSON.stringify(this.windowState, null, 2)}
`, "utf-8");
    } catch {
    }
  }
  saveLauncherPosition() {
    if (!this.launcherWindow || this.launcherWindow.isDestroyed()) {
      return;
    }
    const [x, y] = this.launcherWindow.getPosition();
    this.windowState.launcher = { x, y };
    this.writeWindowState();
  }
  enforceLauncherHitArea() {
    if (!this.launcherWindow || this.launcherWindow.isDestroyed()) {
      return;
    }
    const bounds = this.launcherWindow.getBounds();
    if (bounds.width !== LAUNCHER_WIDTH || bounds.height !== LAUNCHER_HEIGHT) {
      this.launcherWindow.setBounds({ ...bounds, width: LAUNCHER_WIDTH, height: LAUNCHER_HEIGHT });
    }
    const shapedWindow = this.launcherWindow;
    shapedWindow.setShape?.([{ x: 0, y: 0, width: LAUNCHER_WIDTH, height: LAUNCHER_HEIGHT }]);
  }
  savePanelBounds() {
    if (!this.panelWindow || this.panelWindow.isDestroyed()) {
      return;
    }
    this.windowState.panel = this.panelWindow.getBounds();
    this.writeWindowState();
  }
  getVisiblePanelBounds() {
    const primaryWorkArea = screen.getPrimaryDisplay().workArea;
    const saved = this.windowState.panel;
    const targetWorkArea = saved ? screen.getAllDisplays().map((display) => display.workArea).find((workArea2) => hasUsableIntersection(saved, workArea2)) : void 0;
    const workArea = targetWorkArea ?? primaryWorkArea;
    const width = Math.min(Math.max(saved?.width ?? 1280, 1024), workArea.width);
    const height = Math.min(Math.max(saved?.height ?? 760, 640), workArea.height);
    if (!targetWorkArea || !saved) {
      return {
        x: workArea.x + Math.round((workArea.width - width) / 2),
        y: workArea.y + Math.round((workArea.height - height) / 2),
        width,
        height
      };
    }
    return {
      x: Math.min(Math.max(saved.x, workArea.x), workArea.x + workArea.width - width),
      y: Math.min(Math.max(saved.y, workArea.y), workArea.y + workArea.height - height),
      width,
      height
    };
  }
}
function hasUsableIntersection(bounds, workArea) {
  const visibleWidth = Math.min(bounds.x + bounds.width, workArea.x + workArea.width) - Math.max(bounds.x, workArea.x);
  const visibleHeight = Math.min(bounds.y + bounds.height, workArea.y + workArea.height) - Math.max(bounds.y, workArea.y);
  return visibleWidth >= 160 && visibleHeight >= 80;
}
function getWindowIconPath() {
  if (existsSync(unpackagedIconPath)) {
    return unpackagedIconPath;
  }
  if (existsSync(packagedIconPath)) {
    return packagedIconPath;
  }
  return void 0;
}
class WorkspaceService {
  settingsPath = join(app.getPath("userData"), "settings.json");
  async getCurrentWorkspace() {
    const settings = await this.readSettings();
    if (!settings.workspacePath) {
      return null;
    }
    const workspaceFile = join(settings.workspacePath, "workspace.json");
    if (!await pathExists(workspaceFile)) {
      return null;
    }
    try {
      const workspace = await readJsonFile(workspaceFile);
      return { ...workspace, rootPath: settings.workspacePath };
    } catch {
      return null;
    }
  }
  async chooseWorkspaceDirectory() {
    const result = await dialog.showOpenDialog({
      title: "选择 easyNote 数据目录",
      properties: ["openDirectory", "createDirectory"]
    });
    if (result.canceled || result.filePaths.length === 0) {
      return null;
    }
    const rootPath = result.filePaths[0];
    const workspace = await this.initializeWorkspace(rootPath);
    await this.writeSettings({ workspacePath: rootPath });
    return workspace;
  }
  async requireWorkspace() {
    const workspace = await this.getCurrentWorkspace();
    if (!workspace) {
      throw new Error("请先选择 easyNote 数据目录");
    }
    return workspace;
  }
  async getTasksFilePath() {
    const workspace = await this.requireWorkspace();
    return join(workspace.rootPath, "data", "tasks.json");
  }
  async getAttachmentsDir() {
    const workspace = await this.requireWorkspace();
    return join(workspace.rootPath, "attachments");
  }
  async getBackupsDir() {
    const workspace = await this.requireWorkspace();
    return join(workspace.rootPath, "backups");
  }
  async initializeWorkspace(rootPath) {
    await ensureDir(rootPath);
    await ensureDir(join(rootPath, "data"));
    await ensureDir(join(rootPath, "attachments"));
    await ensureDir(join(rootPath, "backups"));
    await ensureDir(join(rootPath, "logs"));
    const now = (/* @__PURE__ */ new Date()).toISOString();
    const workspaceFile = join(rootPath, "workspace.json");
    let workspace;
    if (await pathExists(workspaceFile)) {
      workspace = await readJsonFile(workspaceFile);
      workspace = { ...workspace, rootPath };
    } else {
      workspace = {
        id: nanoid(),
        name: basename(rootPath) || "easyNote-data",
        rootPath,
        schemaVersion: 1,
        createdAt: now,
        updatedAt: now
      };
      await writeJsonFileAtomic(workspaceFile, workspace);
    }
    const tasksFile = join(rootPath, "data", "tasks.json");
    if (!await pathExists(tasksFile)) {
      const emptyData = {
        schemaVersion: 2,
        revision: 0,
        tags: createDefaultTags(),
        tasks: []
      };
      await writeJsonFileAtomic(tasksFile, emptyData);
    }
    return workspace;
  }
  async readSettings() {
    if (!await pathExists(this.settingsPath)) {
      return {};
    }
    try {
      return await readJsonFile(this.settingsPath);
    } catch {
      return {};
    }
  }
  async writeSettings(settings) {
    await writeJsonFileAtomic(this.settingsPath, settings);
  }
}
app.setAppUserModelId("com.easynote.desktop");
let windows = null;
async function bootstrap() {
  const workspace = new WorkspaceService();
  const tasks = new TaskRepository(workspace);
  const attachments = new AttachmentService(workspace, tasks);
  const importExport = new ImportExportService(workspace, tasks);
  windows = new WindowManager();
  registerIpcHandlers({
    windows,
    workspace,
    tasks,
    attachments,
    importExport
  });
  const currentWorkspace = await workspace.getCurrentWorkspace();
  if (process.env.EASYNOTE_QA_PANEL === "1") {
    windows.showPanel();
  } else if (currentWorkspace) {
    windows.showLauncher();
  } else {
    windows.showPanel();
  }
}
app.whenReady().then(() => {
  void bootstrap();
  app.on("activate", () => {
    if (!windows?.getLauncherWindow() && !windows?.getPanelWindow()) {
      windows?.showLauncher();
    }
  });
});
app.on("window-all-closed", () => {
  if (process.platform !== "darwin") {
    app.quit();
  }
});
