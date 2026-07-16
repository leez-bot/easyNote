import type { EasyNoteApi } from '../shared/api'

declare global {
  interface Window {
    easyNoteApi: EasyNoteApi
  }
}

export {}
