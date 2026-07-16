import { Button, Dropdown, Image, Popconfirm } from 'antd'
import { ChevronDown, FileText, ImagePlus, Paperclip, X } from 'lucide-react'
import { useEffect, useState } from 'react'
import type { Task } from '../../../shared/models'
import { useTaskStore } from '../../store/taskStore'

export function AttachmentGrid({ task, editable = false }: { task: Task; editable?: boolean }): JSX.Element {
  const addFiles = useTaskStore((state) => state.addFiles)
  const removeAttachment = useTaskStore((state) => state.removeAttachment)
  const openAttachment = useTaskStore((state) => state.openAttachment)
  const [previews, setPreviews] = useState<Record<string, string>>({})
  const [missing, setMissing] = useState<Record<string, boolean>>({})

  useEffect(() => {
    let disposed = false
    void Promise.all(task.attachments.filter((item) => item.kind === 'image').map(async (attachment) => {
      try {
        const url = await window.easyNoteApi.attachments.getPreviewUrl(attachment.relativePath)
        return [attachment.id, url] as const
      } catch {
        return [attachment.id, ''] as const
      }
    })).then((entries) => {
      if (disposed) return
      setPreviews(Object.fromEntries(entries.filter(([, url]) => Boolean(url))))
      setMissing(Object.fromEntries(entries.filter(([, url]) => !url).map(([id]) => [id, true])))
    })
    return () => { disposed = true }
  }, [task.attachments])

  return (
    <section className="attachment-section">
      <div className="attachment-head">
        <div><strong>附件</strong><span>{task.attachments.length}</span></div>
        {editable ? <div className="attachment-actions">
          <Button size="small" type="primary" ghost icon={<Paperclip size={14} />} onClick={() => void addFiles(task.id, false)}>添加附件</Button>
          <Dropdown
            trigger={['click']}
            menu={{ items: [{ key: 'image', icon: <ImagePlus size={14} />, label: '添加图片', onClick: () => void addFiles(task.id, true) }] }}
          ><Button size="small" type="primary" ghost icon={<ChevronDown size={14} />} /></Dropdown>
        </div> : null}
      </div>
      <div className="attachment-grid">
        {task.attachments.map((attachment) => (
          <div className={`attachment-card ${missing[attachment.id] ? 'missing' : ''}`} key={attachment.id}>
            {attachment.kind === 'image' && previews[attachment.id] ? (
              <Image className="attachment-preview" src={previews[attachment.id]} alt={attachment.fileName} preview={{ src: previews[attachment.id] }} />
            ) : (
              <button className="file-preview" type="button" onClick={() => void openAttachment(attachment.relativePath)}>
                <FileText size={30} />
              </button>
            )}
            <div className="attachment-meta"><strong title={attachment.fileName}>{attachment.fileName}</strong><span>{missing[attachment.id] ? '文件已失效' : formatFileSize(attachment.size)}</span></div>
            {editable ? <Popconfirm title="删除附件" description="将同时删除工作区内的附件文件。" onConfirm={() => void removeAttachment(task.id, attachment.id)}>
              <button className="attachment-remove" type="button" title="删除附件"><X size={13} /></button>
            </Popconfirm> : null}
          </div>
        ))}
        {task.attachments.length === 0 ? <div className="attachment-empty">暂无附件</div> : null}
      </div>
    </section>
  )
}

function formatFileSize(size: number): string {
  if (size < 1024) return `${size} B`
  if (size < 1024 * 1024) return `${Math.round(size / 1024)} KB`
  return `${(size / 1024 / 1024).toFixed(1)} MB`
}
