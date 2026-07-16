import { isAbsolute, relative, resolve } from 'node:path'

export function assertInsideWorkspace(workspaceRoot: string, targetPath: string): void {
  const root = resolve(workspaceRoot)
  const target = resolve(targetPath)
  const relativePath = relative(root, target)

  if (relativePath.startsWith('..') || relativePath === '..' || isAbsolute(relativePath)) {
    throw new Error('目标路径不在当前工作区内')
  }
}
