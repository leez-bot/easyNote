"use strict";
const electron = require("electron");
const api = {
  workspace: {
    getCurrent: () => electron.ipcRenderer.invoke("workspace:getCurrent"),
    chooseDirectory: () => electron.ipcRenderer.invoke("workspace:chooseDirectory")
  },
  tasks: {
    list: () => electron.ipcRenderer.invoke("tasks:list"),
    create: (input) => electron.ipcRenderer.invoke("tasks:create", input),
    update: (id, input) => electron.ipcRenderer.invoke("tasks:update", id, input),
    remove: (id) => electron.ipcRenderer.invoke("tasks:remove", id),
    setStatus: (id, status) => electron.ipcRenderer.invoke("tasks:setStatus", id, status)
  },
  tags: {
    list: () => electron.ipcRenderer.invoke("tags:list"),
    create: (input) => electron.ipcRenderer.invoke("tags:create", input),
    update: (id, input) => electron.ipcRenderer.invoke("tags:update", id, input),
    remove: (id) => electron.ipcRenderer.invoke("tags:remove", id)
  },
  attachments: {
    addFiles: (taskId, imagesOnly) => electron.ipcRenderer.invoke("attachments:addFiles", taskId, imagesOnly),
    remove: (taskId, attachmentId) => electron.ipcRenderer.invoke("attachments:remove", taskId, attachmentId),
    getPreviewUrl: (relativePath) => electron.ipcRenderer.invoke("attachments:getPreviewUrl", relativePath),
    openFile: (relativePath) => electron.ipcRenderer.invoke("attachments:openFile", relativePath)
  },
  importExport: {
    exportData: () => electron.ipcRenderer.invoke("importExport:exportData"),
    importData: (mode) => electron.ipcRenderer.invoke("importExport:importData", mode)
  },
  window: {
    showPanel: () => electron.ipcRenderer.invoke("window:showPanel"),
    collapseToLauncher: () => electron.ipcRenderer.invoke("window:collapseToLauncher"),
    toggleMaximize: () => electron.ipcRenderer.invoke("window:toggleMaximize"),
    close: () => electron.ipcRenderer.invoke("window:close"),
    moveLauncher: (deltaX, deltaY) => electron.ipcRenderer.invoke("window:moveLauncher", deltaX, deltaY),
    quit: () => electron.ipcRenderer.invoke("window:quit")
  }
};
electron.contextBridge.exposeInMainWorld("easyNoteApi", api);
