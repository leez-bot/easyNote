import { Dropdown } from 'antd'
import { ChevronDown, FolderOpen, Settings } from 'lucide-react'
import { useTaskStore } from '../../store/taskStore'

export function WorkspaceMenu(): JSX.Element {
  const workspace = useTaskStore((state) => state.workspace)
  const chooseWorkspace = useTaskStore((state) => state.chooseWorkspace)
  return (
    <Dropdown
      trigger={['click']}
      menu={{
        items: [
          { key: 'path', label: <span className="workspace-path">{workspace?.rootPath}</span>, disabled: true },
          { type: 'divider' },
          { key: 'switch', icon: <FolderOpen size={14} />, label: '切换工作区', onClick: () => void chooseWorkspace() },
          { key: 'settings', icon: <Settings size={14} />, label: '工作区设置', disabled: true },
        ],
      }}
    >
      <button className="workspace-menu-trigger" type="button" title={workspace?.rootPath}>
        <span>{workspace?.name || '个人工作区'}</span>
        <ChevronDown size={14} />
      </button>
    </Dropdown>
  )
}
