import type { EditorDocument } from '../../shared/models'

export const EMPTY_DOCUMENT: EditorDocument = { type: 'doc', content: [{ type: 'paragraph' }] }

export function getDocumentText(document: EditorDocument): string {
  const parts: string[] = []
  walk(document, (node) => {
    if (typeof node.text === 'string') parts.push(node.text)
    if (isBlockNode(node.type)) parts.push('\n')
  })
  return parts.join('').replace(/\n{3,}/g, '\n\n').trim()
}

export function getDocumentStats(document: EditorDocument): { characters: number; paragraphs: number } {
  let paragraphs = 0
  walk(document, (node) => {
    if (isBlockNode(node.type)) paragraphs += 1
  })
  return { characters: getDocumentText(document).replace(/\s/g, '').length, paragraphs }
}

function walk(node: unknown, visitor: (value: Record<string, unknown>) => void): void {
  if (!node || typeof node !== 'object') return
  const value = node as Record<string, unknown>
  visitor(value)
  if (Array.isArray(value.content)) value.content.forEach((child) => walk(child, visitor))
}

function isBlockNode(type: unknown): boolean {
  return type === 'paragraph' || type === 'heading' || type === 'listItem' || type === 'taskItem'
}
