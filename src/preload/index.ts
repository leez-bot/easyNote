import { contextBridge, ipcRenderer } from 'electron'
import type { EasyNoteApi } from '../shared/api'

const api: EasyNoteApi = {
  workspace: {
    getCurrent: () => ipcRenderer.invoke('workspace:getCurrent'),
    chooseDirectory: () => ipcRenderer.invoke('workspace:chooseDirectory'),
  },
  tasks: {
    list: () => ipcRenderer.invoke('tasks:list'),
    create: (input) => ipcRenderer.invoke('tasks:create', input),
    update: (id, input) => ipcRenderer.invoke('tasks:update', id, input),
    remove: (id) => ipcRenderer.invoke('tasks:remove', id),
    setStatus: (id, status) => ipcRenderer.invoke('tasks:setStatus', id, status),
    batchUpdate: (ids, patch) => ipcRenderer.invoke('tasks:batchUpdate', ids, patch),
    batchRemove: (ids) => ipcRenderer.invoke('tasks:batchRemove', ids),
  },
  tags: {
    list: () => ipcRenderer.invoke('tags:list'),
    create: (input) => ipcRenderer.invoke('tags:create', input),
    update: (id, input) => ipcRenderer.invoke('tags:update', id, input),
    remove: (id) => ipcRenderer.invoke('tags:remove', id),
  },
  attachments: {
    addFiles: (taskId, imagesOnly) => ipcRenderer.invoke('attachments:addFiles', taskId, imagesOnly),
    remove: (taskId, attachmentId) => ipcRenderer.invoke('attachments:remove', taskId, attachmentId),
    getPreviewUrl: (relativePath) => ipcRenderer.invoke('attachments:getPreviewUrl', relativePath),
    openFile: (relativePath) => ipcRenderer.invoke('attachments:openFile', relativePath),
  },
  importExport: {
    exportData: () => ipcRenderer.invoke('importExport:exportData'),
    importData: (mode) => ipcRenderer.invoke('importExport:importData', mode),
  },
  window: {
    showPanel: () => ipcRenderer.invoke('window:showPanel'),
    collapseToLauncher: () => ipcRenderer.invoke('window:collapseToLauncher'),
    toggleMaximize: () => ipcRenderer.invoke('window:toggleMaximize'),
    close: () => ipcRenderer.invoke('window:close'),
    beginLauncherDrag: () => ipcRenderer.invoke('window:beginLauncherDrag'),
    moveLauncher: () => ipcRenderer.invoke('window:moveLauncher'),
    quit: () => ipcRenderer.invoke('window:quit'),
    onImageCopied: (listener) => {
      const handler = (): void => listener()
      ipcRenderer.on('clipboard:imageCopied', handler)
      return () => ipcRenderer.removeListener('clipboard:imageCopied', handler)
    },
  },
  settings: {
    getOpenAtLogin: () => ipcRenderer.invoke('settings:getOpenAtLogin'),
    setOpenAtLogin: (enabled) => ipcRenderer.invoke('settings:setOpenAtLogin', enabled),
  },
}

contextBridge.exposeInMainWorld('easyNoteApi', api)
