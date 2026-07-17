import { useEffect, useMemo, useRef } from 'react'
import { NotebookPen } from 'lucide-react'
import { isTaskInDateFilter } from '../../shared/date'
import { useTaskStore } from '../../store/taskStore'

export function LauncherView(): JSX.Element {
  const tasks = useTaskStore((state) => state.tasks)
  const error = useTaskStore((state) => state.error)
  const reloadData = useTaskStore((state) => state.reloadData)
  const dragRef = useRef({ dragging: false, moved: false })

  const counts = useMemo(
    () => {
      const todayTasks = tasks.filter((task) => isTaskInDateFilter(task, 'today'))
      return {
        todayDone: todayTasks.filter((task) => task.status === 'done').length,
        todayTotal: todayTasks.length,
        overdue: tasks.filter((task) => isTaskInDateFilter(task, 'overdue')).length,
      }
    },
    [tasks],
  )

  useEffect(() => {
    document.documentElement.classList.add('launcher-root')
    document.body.classList.add('launcher-body')
    return () => {
      document.documentElement.classList.remove('launcher-root')
      document.body.classList.remove('launcher-body')
    }
  }, [])

  useEffect(() => {
    const refreshVisibleData = (): void => {
      if (document.visibilityState === 'visible') {
        void reloadData()
      }
    }

    document.addEventListener('visibilitychange', refreshVisibleData)
    window.addEventListener('focus', refreshVisibleData)
    return () => {
      document.removeEventListener('visibilitychange', refreshVisibleData)
      window.removeEventListener('focus', refreshVisibleData)
    }
  }, [reloadData])

  const showPanel = async (): Promise<void> => {
    try {
      await window.easyNoteApi.window.showPanel()
    } catch {
      // Launcher 只负责唤起主面板，失败时保持静默。
    }
  }

  return (
    <button
      className="launcher-view"
      type="button"
      onPointerDown={(event) => {
        dragRef.current = {
          dragging: true,
          moved: false,
        }
        event.currentTarget.setPointerCapture(event.pointerId)
        void window.easyNoteApi.window.beginLauncherDrag()
      }}
      onPointerMove={(event) => {
        const drag = dragRef.current
        if (!drag.dragging) {
          return
        }

        drag.moved = true
        void window.easyNoteApi.window.moveLauncher()
      }}
      onPointerUp={(event) => {
        const wasClick = !dragRef.current.moved
        dragRef.current.dragging = false
        event.currentTarget.releasePointerCapture(event.pointerId)
        if (wasClick) {
          void showPanel()
        }
      }}
      aria-label="打开 easyNote 主面板"
    >
      <span className="launcher-mark" aria-hidden="true">
        <NotebookPen size={21} strokeWidth={2.2} />
      </span>
      <span className="launcher-counts">
        <span>今 {counts.todayDone}/{counts.todayTotal}</span>
        <span className={counts.overdue > 0 ? 'launcher-danger' : undefined}>逾 {counts.overdue}</span>
      </span>
      {error ? <span className="launcher-error">!</span> : null}
    </button>
  )
}
