import { useEffect } from 'react'
import { PanelLayout } from './features/shell/PanelLayout'
import { LauncherView } from './features/shell/LauncherView'
import { WorkspaceGate } from './features/workspace/WorkspaceGate'
import { useTaskStore } from './store/taskStore'

export function App(): JSX.Element {
  const isLauncher = new URLSearchParams(window.location.search).get('mode') === 'launcher'
  const workspace = useTaskStore((state) => state.workspace)
  const bootstrapped = useTaskStore((state) => state.bootstrapped)
  const bootstrap = useTaskStore((state) => state.bootstrap)

  useEffect(() => {
    void bootstrap()
  }, [bootstrap])

  if (isLauncher) {
    return <LauncherView />
  }

  if (!bootstrapped) {
    return <main className="app-bootstrap" />
  }

  if (!workspace) {
    return <WorkspaceGate />
  }

  return <PanelLayout />
}
