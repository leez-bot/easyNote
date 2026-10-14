import { app } from 'electron'

export function getOpenAtLogin(): boolean {
  return app.getLoginItemSettings().openAtLogin
}

export function setOpenAtLogin(enabled: boolean): boolean {
  app.setLoginItemSettings({
    openAtLogin: enabled,
    name: 'easyNote',
  })
  return app.getLoginItemSettings().openAtLogin
}
