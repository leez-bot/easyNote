import { nanoid } from 'nanoid'
import type { EditorDocument, TaskDataFileV1, TaskDataFileV2, TaskTag } from '../../shared/models'

export const DEFAULT_TAGS = [
  { name: '产品', color: '#ef4444' },
  { name: '开发', color: '#f59e0b' },
  { name: '设计', color: '#22c55e' },
  { name: '个人', color: '#8b5cf6' },
  { name: '杂项', color: '#8b6f47' },
] as const

export function createDefaultTags(now = new Date().toISOString()): TaskTag[] {
  return DEFAULT_TAGS.map((tag) => ({
    id: nanoid(),
    ...tag,
    createdAt: now,
    updatedAt: now,
  }))
}

export function textToDocument(value?: string): EditorDocument {
  const lines = (value ?? '').split(/\r?\n/)
  return {
    type: 'doc',
    content: lines.map((line) => ({
      type: 'paragraph',
      content: line ? [{ type: 'text', text: line }] : undefined,
    })),
  }
}

export function migrateV1Data(data: TaskDataFileV1, now = new Date().toISOString()): TaskDataFileV2 {
  return {
    schemaVersion: 2,
    revision: data.revision,
    tags: createDefaultTags(now),
    tasks: data.tasks.map(({ description, ...task }) => ({
      ...task,
      content: textToDocument(description),
      priority: 'none',
      tagIds: [],
      pinned: false,
      attachments: task.attachments.map((attachment) => ({
        ...attachment,
        kind: attachment.mimeType.startsWith('image/') ? 'image' : 'file',
      })),
    })),
  }
}
