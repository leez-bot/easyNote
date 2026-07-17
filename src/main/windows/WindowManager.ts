import { BrowserWindow, screen, type Rectangle } from 'electron'
import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'
import { app } from 'electron'

const currentDir = dirname(fileURLToPath(import.meta.url))
const unpackagedIconPath = join(process.cwd(), 'build', 'icon.ico')
const packagedIconPath = join(process.resourcesPath, 'icon.ico')
const LAUNCHER_WIDTH = 92
const LAUNCHER_HEIGHT = 52

interface WindowState {
  launcher?: { x: number; y: number }
  panel?: { x: number; y: number; width: number; height: number }
}

export class WindowManager {
  private launcherWindow: BrowserWindow | null = null
  private panelWindow: BrowserWindow | null = null
  private launcherDragOffset: { x: number; y: number } | null = null
  private readonly statePath = join(app.getPath('userData'), 'window-state.json')
  private windowState: WindowState = this.readWindowState()

  createLauncherWindow(): BrowserWindow {
    if (this.launcherWindow && !this.launcherWindow.isDestroyed()) {
      return this.launcherWindow
    }

    const { workArea } = screen.getPrimaryDisplay()
    const launcherPosition = this.windowState.launcher ?? {
      x: workArea.x + workArea.width - 88,
      y: workArea.y + Math.round(workArea.height * 0.28),
    }

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
      backgroundColor: '#00000000',
      hasShadow: false,
      resizable: false,
      alwaysOnTop: true,
      skipTaskbar: true,
      show: false,
      webPreferences: {
        preload: join(currentDir, '../preload/index.cjs'),
        contextIsolation: true,
        nodeIntegration: false,
      },
    })

    this.launcherWindow.setAlwaysOnTop(true, 'floating')
    this.loadRenderer(this.launcherWindow, 'launcher')
    this.launcherWindow.on('show', () => this.enforceLauncherHitArea())
    this.launcherWindow.on('ready-to-show', () => this.enforceLauncherHitArea())
    this.launcherWindow.on('moved', () => this.saveLauncherPosition())
    this.launcherWindow.on('closed', () => {
      this.saveLauncherPosition()
      this.launcherWindow = null
    })

    return this.launcherWindow
  }

  createPanelWindow(): BrowserWindow {
    if (this.panelWindow && !this.panelWindow.isDestroyed()) {
      return this.panelWindow
    }

    const panelBounds = this.getVisiblePanelBounds()
    const icon = getWindowIconPath()

    this.panelWindow = new BrowserWindow({
      width: Math.max(panelBounds.width, 1024),
      height: Math.max(panelBounds.height, 640),
      minWidth: 1024,
      minHeight: 640,
      x: panelBounds.x,
      y: panelBounds.y,
      title: 'easyNote',
      frame: false,
      autoHideMenuBar: true,
      resizable: true,
      show: false,
      ...(icon ? { icon } : {}),
      webPreferences: {
        preload: join(currentDir, '../preload/index.cjs'),
        contextIsolation: true,
        nodeIntegration: false,
      },
    })

    this.loadRenderer(this.panelWindow)
    this.panelWindow.on('moved', () => this.savePanelBounds())
    this.panelWindow.on('resized', () => this.savePanelBounds())
    this.panelWindow.on('closed', () => {
      this.savePanelBounds()
      this.panelWindow = null
    })

    return this.panelWindow
  }

  showLauncher(): void {
    const launcher = this.createLauncherWindow()
    if (this.panelWindow && !this.panelWindow.isDestroyed()) {
      this.panelWindow.hide()
    }
    this.enforceLauncherHitArea()
    launcher.show()
    launcher.focus()
  }

  showPanel(): void {
    const panel = this.createPanelWindow()
    if (this.launcherWindow && !this.launcherWindow.isDestroyed()) {
      this.launcherWindow.hide()
    }
    panel.show()
    panel.focus()
  }

  collapseToLauncher(): void {
    this.showLauncher()
  }

  togglePanelMaximize(): boolean {
    if (!this.panelWindow || this.panelWindow.isDestroyed()) {
      return false
    }

    if (this.panelWindow.isMaximized()) {
      this.panelWindow.unmaximize()
      return false
    }

    this.panelWindow.maximize()
    return true
  }

  closePanel(): void {
    app.quit()
  }

  beginLauncherDrag(): void {
    if (!this.launcherWindow || this.launcherWindow.isDestroyed()) {
      return
    }

    const bounds = this.launcherWindow.getBounds()
    const cursor = screen.getCursorScreenPoint()
    this.launcherDragOffset = { x: cursor.x - bounds.x, y: cursor.y - bounds.y }
  }

  moveLauncher(): void {
    if (!this.launcherWindow || this.launcherWindow.isDestroyed() || !this.launcherDragOffset) {
      return
    }

    const cursor = screen.getCursorScreenPoint()
    this.launcherWindow.setBounds({
      x: Math.round(cursor.x - this.launcherDragOffset.x),
      y: Math.round(cursor.y - this.launcherDragOffset.y),
      width: LAUNCHER_WIDTH,
      height: LAUNCHER_HEIGHT,
    })
    this.enforceLauncherHitArea()
    this.saveLauncherPosition()
  }

  getPanelWindow(): BrowserWindow | null {
    return this.panelWindow
  }

  getLauncherWindow(): BrowserWindow | null {
    return this.launcherWindow
  }

  private loadRenderer(window: BrowserWindow, mode?: 'launcher'): void {
    const devUrl = process.env.ELECTRON_RENDERER_URL
    if (devUrl) {
      const url = new URL(devUrl)
      if (mode) {
        url.searchParams.set('mode', mode)
      }
      void window.loadURL(url.toString())
      return
    }

    void window.loadFile(join(currentDir, '../renderer/index.html'), {
      query: mode ? { mode } : undefined,
    })
  }

  private readWindowState(): WindowState {
    try {
      return JSON.parse(readFileSync(this.statePath, 'utf-8')) as WindowState
    } catch {
      return {}
    }
  }

  private writeWindowState(): void {
    try {
      mkdirSync(dirname(this.statePath), { recursive: true })
      writeFileSync(this.statePath, `${JSON.stringify(this.windowState, null, 2)}\n`, 'utf-8')
    } catch {
      // 窗口状态不影响核心数据，写入失败时忽略。
    }
  }

  private saveLauncherPosition(): void {
    if (!this.launcherWindow || this.launcherWindow.isDestroyed()) {
      return
    }
    const [x, y] = this.launcherWindow.getPosition()
    this.windowState.launcher = { x, y }
    this.writeWindowState()
  }

  private enforceLauncherHitArea(): void {
    if (!this.launcherWindow || this.launcherWindow.isDestroyed()) {
      return
    }

    const bounds = this.launcherWindow.getBounds()
    if (bounds.width !== LAUNCHER_WIDTH || bounds.height !== LAUNCHER_HEIGHT) {
      this.launcherWindow.setBounds({ ...bounds, width: LAUNCHER_WIDTH, height: LAUNCHER_HEIGHT })
    }

    const shapedWindow = this.launcherWindow as BrowserWindow & { setShape?: (rectangles: Rectangle[]) => void }
    shapedWindow.setShape?.([{ x: 0, y: 0, width: LAUNCHER_WIDTH, height: LAUNCHER_HEIGHT }])
  }

  private savePanelBounds(): void {
    if (!this.panelWindow || this.panelWindow.isDestroyed()) {
      return
    }
    this.windowState.panel = this.panelWindow.getBounds()
    this.writeWindowState()
  }

  private getVisiblePanelBounds(): Rectangle {
    const primaryWorkArea = screen.getPrimaryDisplay().workArea
    const saved = this.windowState.panel
    const targetWorkArea = saved
      ? screen.getAllDisplays().map((display) => display.workArea).find((workArea) => hasUsableIntersection(saved, workArea))
      : undefined
    const workArea = targetWorkArea ?? primaryWorkArea
    const width = Math.min(Math.max(saved?.width ?? 1280, 1024), workArea.width)
    const height = Math.min(Math.max(saved?.height ?? 760, 640), workArea.height)

    if (!targetWorkArea || !saved) {
      return {
        x: workArea.x + Math.round((workArea.width - width) / 2),
        y: workArea.y + Math.round((workArea.height - height) / 2),
        width,
        height,
      }
    }

    return {
      x: Math.min(Math.max(saved.x, workArea.x), workArea.x + workArea.width - width),
      y: Math.min(Math.max(saved.y, workArea.y), workArea.y + workArea.height - height),
      width,
      height,
    }
  }
}

function hasUsableIntersection(bounds: Rectangle, workArea: Rectangle): boolean {
  const visibleWidth = Math.min(bounds.x + bounds.width, workArea.x + workArea.width) - Math.max(bounds.x, workArea.x)
  const visibleHeight = Math.min(bounds.y + bounds.height, workArea.y + workArea.height) - Math.max(bounds.y, workArea.y)
  return visibleWidth >= 160 && visibleHeight >= 80
}

function getWindowIconPath(): string | undefined {
  if (existsSync(unpackagedIconPath)) {
    return unpackagedIconPath
  }

  if (existsSync(packagedIconPath)) {
    return packagedIconPath
  }

  return undefined
}
