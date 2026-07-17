import Image from '@tiptap/extension-image'
import Link from '@tiptap/extension-link'
import { Table } from '@tiptap/extension-table'
import TableCell from '@tiptap/extension-table-cell'
import TableHeader from '@tiptap/extension-table-header'
import TableRow from '@tiptap/extension-table-row'
import TaskItem from '@tiptap/extension-task-item'
import TaskList from '@tiptap/extension-task-list'
import StarterKit from '@tiptap/starter-kit'
import { EditorContent, useEditor } from '@tiptap/react'
import { Button, Image as AntImage, Input, Modal, Space } from 'antd'
import { Bold, Braces, CheckSquare, Code2, Expand, Heading2, ImageIcon, Italic, Link2, List, ListOrdered, Maximize2, Quote, Table2 } from 'lucide-react'
import { useEffect, useRef, useState } from 'react'
import type { EditorDocument } from '../../../shared/models'

export function RichTextEditor({ value, onChange, readOnly = false }: { value: EditorDocument; onChange?: (value: EditorDocument) => void; readOnly?: boolean }): JSX.Element {
  const [fullscreen, setFullscreen] = useState(false)
  const [linkOpen, setLinkOpen] = useState(false)
  const [linkHref, setLinkHref] = useState('')
  const [previewImageSrc, setPreviewImageSrc] = useState<string>()
  const fileInputRef = useRef<HTMLInputElement | null>(null)
  const editor = useEditor({
    extensions: [
      StarterKit.configure({ link: false }),
      Link.configure({ openOnClick: false }),
      Image.configure({ allowBase64: true }),
      Table.configure({ resizable: true }),
      TableRow,
      TableHeader,
      TableCell,
      TaskList,
      TaskItem.configure({ nested: true }),
    ],
    content: value,
    editable: !readOnly,
    onUpdate: ({ editor: current }) => onChange?.(current.getJSON() as EditorDocument),
    editorProps: {
      attributes: { class: 'tiptap-content' },
      handlePaste: (view, event) => {
        const imageFiles = Array.from(event.clipboardData?.files ?? []).filter((file) => file.type.startsWith('image/'))
        if (imageFiles.length === 0) return false
        event.preventDefault()
        imageFiles.forEach((file) => {
          void insertImageFile(file, (src) => {
            editor?.chain().focus().setImage({ src }).run()
          })
        })
        return true
      },
    },
  })

  useEffect(() => {
    if (!editor) return
    const current = JSON.stringify(editor.getJSON())
    if (current !== JSON.stringify(value)) editor.commands.setContent(value, { emitUpdate: false })
  }, [editor, value])

  useEffect(() => {
    editor?.setEditable(!readOnly)
  }, [editor, readOnly])

  if (!editor) return <div className="rich-editor loading">正在加载编辑器...</div>

  const openLinkDialog = (): void => {
    setLinkHref(editor.getAttributes('link').href ?? '')
    setLinkOpen(true)
  }

  const applyLink = (): void => {
    const href = linkHref.trim()
    if (!href) editor.chain().focus().extendMarkRange('link').unsetLink().run()
    else editor.chain().focus().extendMarkRange('link').setLink({ href }).run()
    setLinkOpen(false)
  }

  const addImageFiles = (files: FileList | null): void => {
    const image = Array.from(files ?? []).find((file) => file.type.startsWith('image/'))
    if (!image) return
    void insertImageFile(image, (src) => editor.chain().focus().setImage({ src }).run())
  }

  const buttons = [
    { title: '二级标题', icon: Heading2, active: editor.isActive('heading', { level: 2 }), run: () => editor.chain().focus().toggleHeading({ level: 2 }).run() },
    { title: '粗体', icon: Bold, active: editor.isActive('bold'), run: () => editor.chain().focus().toggleBold().run() },
    { title: '斜体', icon: Italic, active: editor.isActive('italic'), run: () => editor.chain().focus().toggleItalic().run() },
    { title: '行内代码', icon: Code2, active: editor.isActive('code'), run: () => editor.chain().focus().toggleCode().run() },
    { title: '无序列表', icon: List, active: editor.isActive('bulletList'), run: () => editor.chain().focus().toggleBulletList().run() },
    { title: '有序列表', icon: ListOrdered, active: editor.isActive('orderedList'), run: () => editor.chain().focus().toggleOrderedList().run() },
    { title: '任务列表', icon: CheckSquare, active: editor.isActive('taskList'), run: () => editor.chain().focus().toggleTaskList().run() },
    { title: '引用', icon: Quote, active: editor.isActive('blockquote'), run: () => editor.chain().focus().toggleBlockquote().run() },
  ]

  const previewImage = (event: React.MouseEvent<HTMLDivElement>): void => {
    if (!readOnly || !(event.target instanceof HTMLImageElement)) return
    setPreviewImageSrc(event.target.currentSrc || event.target.src)
  }

  return (
    <div className={`rich-editor ${readOnly ? 'readonly' : ''} ${fullscreen ? 'rich-editor-fullscreen' : ''}`} onClick={previewImage}>
      {!readOnly ? <div className="rich-editor-toolbar">
        {buttons.map(({ title, icon: Icon, active, run }) => <button className={active ? 'active' : ''} type="button" title={title} key={title} onClick={run}><Icon size={16} /></button>)}
        <span className="toolbar-divider" />
        <button className={editor.isActive('link') ? 'active' : ''} type="button" title="链接" onClick={openLinkDialog}><Link2 size={16} /></button>
        <button type="button" title="插入图片" onClick={() => fileInputRef.current?.click()}><ImageIcon size={16} /></button>
        <button type="button" title="插入表格" onClick={() => editor.chain().focus().insertTable({ rows: 3, cols: 3, withHeaderRow: true }).run()}><Table2 size={16} /></button>
        <button type="button" title="代码块" onClick={() => editor.chain().focus().toggleCodeBlock().run()}><Braces size={16} /></button>
        <span className="toolbar-spacer" />
        <button type="button" title={fullscreen ? '退出全屏' : '全屏编辑'} onClick={() => setFullscreen((current) => !current)}>{fullscreen ? <Expand size={16} /> : <Maximize2 size={16} />}</button>
        <input ref={fileInputRef} type="file" accept="image/*" hidden onChange={(event) => { addImageFiles(event.target.files); event.target.value = '' }} />
      </div> : null}
      <EditorContent editor={editor} />
      {readOnly ? <AntImage className="rich-editor-preview-image" src={previewImageSrc} preview={{ visible: Boolean(previewImageSrc), onVisibleChange: (visible) => { if (!visible) setPreviewImageSrc(undefined) } }} /> : null}
      <Modal title="设置链接" open={linkOpen} width={420} onCancel={() => setLinkOpen(false)} footer={null}>
        <Space.Compact block>
          <Input autoFocus value={linkHref} placeholder="https://example.com" onChange={(event) => setLinkHref(event.target.value)} onPressEnter={applyLink} />
          <Button type="primary" onClick={applyLink}>确定</Button>
        </Space.Compact>
      </Modal>
    </div>
  )
}

function insertImageFile(file: File, insert: (src: string) => void): Promise<void> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader()
    reader.onload = () => {
      if (typeof reader.result === 'string') insert(reader.result)
      resolve()
    }
    reader.onerror = () => reject(reader.error)
    reader.readAsDataURL(file)
  })
}
