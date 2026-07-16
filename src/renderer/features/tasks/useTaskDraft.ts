import { useCallback, useEffect, useRef, useState } from 'react'
import type { Task, TaskInput } from '../../../shared/models'
import { useTaskStore } from '../../store/taskStore'

export function useTaskDraft(task: Task | null): {
  draft: TaskInput | null
  updateDraft: (patch: Partial<TaskInput>) => void
  flush: () => Promise<void>
  dirty: boolean
} {
  const updateTask = useTaskStore((state) => state.updateTask)
  const [draft, setDraft] = useState<TaskInput | null>(() => task ? toDraft(task) : null)
  const [dirty, setDirty] = useState(false)
  const taskIdRef = useRef(task?.id ?? null)
  const draftRef = useRef(draft)
  const dirtyRef = useRef(false)
  const saveChainRef = useRef<Promise<void>>(Promise.resolve())

  const queueSave = useCallback((taskId: string, input: TaskInput): Promise<void> => {
    const snapshot = JSON.stringify(input)
    saveChainRef.current = saveChainRef.current.then(async () => {
      const saved = await updateTask(taskId, input)
      if (saved && taskIdRef.current === taskId && JSON.stringify(draftRef.current) === snapshot) {
        dirtyRef.current = false
        setDirty(false)
      }
    })
    return saveChainRef.current
  }, [updateTask])

  const flush = useCallback(async (): Promise<void> => {
    if (taskIdRef.current && dirtyRef.current && draftRef.current) {
      await queueSave(taskIdRef.current, draftRef.current)
    } else {
      await saveChainRef.current
    }
  }, [queueSave])

  useEffect(() => {
    const nextId = task?.id ?? null
    if (taskIdRef.current && taskIdRef.current !== nextId && dirtyRef.current && draftRef.current) {
      void queueSave(taskIdRef.current, draftRef.current)
    }
    taskIdRef.current = nextId
    const nextDraft = task ? toDraft(task) : null
    draftRef.current = nextDraft
    dirtyRef.current = false
    setDraft(nextDraft)
    setDirty(false)
  }, [queueSave, task])

  useEffect(() => {
    if (!dirty || !taskIdRef.current || !draft) return undefined
    const timer = window.setTimeout(() => void queueSave(taskIdRef.current as string, draft), 600)
    return () => window.clearTimeout(timer)
  }, [dirty, draft, queueSave])

  const updateDraft = useCallback((patch: Partial<TaskInput>): void => {
    setDraft((current) => {
      if (!current) return current
      const next = { ...current, ...patch }
      draftRef.current = next
      dirtyRef.current = true
      setDirty(true)
      return next
    })
  }, [])

  return { draft, updateDraft, flush, dirty }
}

function toDraft(task: Task): TaskInput {
  return {
    title: task.title,
    content: task.content,
    status: task.status,
    priority: task.priority,
    tagIds: task.tagIds,
    pinned: task.pinned,
    dueDate: task.dueDate,
  }
}
