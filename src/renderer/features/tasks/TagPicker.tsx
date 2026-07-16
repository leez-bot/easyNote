import { Button, Checkbox, Input, Popconfirm, Popover } from 'antd'
import { Check, MoreHorizontal, Plus, Trash2 } from 'lucide-react'
import { useState, type ReactNode } from 'react'
import { useTaskStore } from '../../store/taskStore'

const TAG_COLORS = ['#ef4444', '#f59e0b', '#22c55e', '#3b82f6', '#8b5cf6', '#8b6f47']
const HEX_COLOR_PATTERN = /^#[0-9a-fA-F]{6}$/

interface TagPickerProps {
  value: string[]
  onChange: (value: string[]) => void
  trigger: ReactNode
  manageOnly?: boolean
}

export function TagPicker({ value, onChange, trigger, manageOnly = false }: TagPickerProps): JSX.Element {
  const tags = useTaskStore((state) => state.tags)
  const createTag = useTaskStore((state) => state.createTag)
  const updateTag = useTaskStore((state) => state.updateTag)
  const removeTag = useTaskStore((state) => state.removeTag)
  const [name, setName] = useState('')
  const [color, setColor] = useState(TAG_COLORS[3])
  const [editingId, setEditingId] = useState<string | null>(null)

  const submit = async (): Promise<void> => {
    if (!name.trim() || !HEX_COLOR_PATTERN.test(color)) return
    if (editingId) await updateTag(editingId, { name: name.trim(), color })
    else await createTag({ name: name.trim(), color })
    setName('')
    setEditingId(null)
  }

  const updateColor = (nextColor: string): void => {
    if (HEX_COLOR_PATTERN.test(nextColor)) {
      setColor(nextColor.toLowerCase())
      return
    }
    setColor(nextColor)
  }

  const content = (
    <div className="tag-picker-panel">
      <div className="tag-picker-list">
        {tags.map((tag) => (
          <div className="tag-picker-row" key={tag.id}>
            {!manageOnly ? <Checkbox checked={value.includes(tag.id)} onChange={(event) => onChange(event.target.checked ? [...value, tag.id] : value.filter((id) => id !== tag.id))} /> : <span className="tag-checkbox-placeholder" />}
            <span className="tag-color-dot" style={{ backgroundColor: tag.color }} />
            <span className="tag-picker-name">{tag.name}</span>
            <button className="tag-row-action" type="button" title="编辑标签" onClick={() => { setEditingId(tag.id); setName(tag.name); setColor(tag.color) }}><MoreHorizontal size={14} /></button>
            <Popconfirm title="删除标签" description="任务会保留，仅解除标签引用。" onConfirm={() => void removeTag(tag.id)}>
              <button className="tag-row-action danger" type="button" title="删除标签"><Trash2 size={13} /></button>
            </Popconfirm>
          </div>
        ))}
      </div>
      <div className="tag-editor-row">
        <Input size="small" value={name} placeholder={editingId ? '修改标签名称' : '新标签名称'} onChange={(event) => setName(event.target.value)} onPressEnter={() => void submit()} />
        <Button size="small" type="primary" icon={editingId ? <Check size={13} /> : <Plus size={13} />} onClick={() => void submit()} />
      </div>
      <div className="tag-color-row">
        {TAG_COLORS.map((item) => <button className={item === color ? 'active' : ''} type="button" key={item} style={{ backgroundColor: item }} onClick={() => setColor(item)} aria-label={`选择颜色 ${item}`} />)}
      </div>
      <div className="tag-custom-color">
        <input type="color" value={HEX_COLOR_PATTERN.test(color) ? color : TAG_COLORS[3]} onChange={(event) => setColor(event.target.value)} aria-label="自定义标签颜色" />
        <Input size="small" value={color} status={HEX_COLOR_PATTERN.test(color) ? undefined : 'error'} onChange={(event) => updateColor(event.target.value)} onPressEnter={() => void submit()} />
      </div>
    </div>
  )

  return <Popover content={content} trigger="click" placement="bottomLeft"><span className="tag-picker-trigger">{trigger}</span></Popover>
}
