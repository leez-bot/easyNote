import { ImagePlus, ListChecks } from 'lucide-react'
import { useState } from 'react'
import { useTaskStore } from '../../store/taskStore'

export function QuickCapture(): JSX.Element {
  const createQuickTask = useTaskStore((state) => state.createQuickTask)
  const [title, setTitle] = useState('')

  const submit = async (mode: 'today' | 'inbox' | 'image'): Promise<void> => {
    const value = title.trim()
    if (!value) return
    const task = await createQuickTask(value, { dueToday: mode !== 'inbox', addImage: mode === 'image' })
    if (task) setTitle('')
  }

  return (
    <div className="quick-capture">
      <input
        value={title}
        placeholder="快速记录..."
        onChange={(event) => setTitle(event.target.value)}
        onKeyDown={(event) => { if (event.key === 'Enter') void submit('today') }}
      />
      <button type="button" title="创建并添加图片" onClick={() => void submit('image')}><ImagePlus size={16} /></button>
      <button type="button" title="创建无日期任务" onClick={() => void submit('inbox')}><ListChecks size={16} /></button>
    </div>
  )
}
