import Image from '@tiptap/extension-image'
import Color from '@tiptap/extension-color'
import Link from '@tiptap/extension-link'
import TextAlign from '@tiptap/extension-text-align'
import { TextStyle } from '@tiptap/extension-text-style'
import Underline from '@tiptap/extension-underline'
import { TableCell, TableHeader, TableRow } from '@tiptap/extension-table'
import { ResizableTable } from './table-column-resize'
import TaskItem from '@tiptap/extension-task-item'
import TaskList from '@tiptap/extension-task-list'
import StarterKit from '@tiptap/starter-kit'
import { EditorContent, useEditor } from '@tiptap/react'
import { Button, Dropdown, Image as AntImage, Input, InputNumber, Modal, Space, type MenuProps } from 'antd'
import { AlignCenter, AlignJustify, AlignLeft, AlignRight, Bold, Braces, CheckSquare, Code2, Expand, Heading2, ImageIcon, Italic, Link2, List, ListOrdered, Maximize2, Quote, Strikethrough, Table2, Underline as UnderlineIcon, Columns3, Rows3, Trash2, Merge, Split } from 'lucide-react'
import { useEffect, useRef, useState } from 'react'
import type { EditorDocument } from '../../../shared/models'

export function RichTextEditor({ value, onChange, readOnly = false }: { value: EditorDocument; onChange?: (value: EditorDocument) => void; readOnly?: boolean }): JSX.Element {
  const [fullscreen, setFullscreen] = useState(false)
  const [linkOpen, setLinkOpen] = useState(false)
  const [linkHref, setLinkHref] = useState('')
  const [previewImageSrc, setPreviewImageSrc] = useState<string>()
  const [tableDialogOpen, setTableDialogOpen] = useState(false)
  const [tableMenuOpen, setTableMenuOpen] = useState(false)
  const [tableSize, setTableSize] = useState({ rows: 3, cols: 3 })
  const fileInputRef = useRef<HTMLInputElement | null>(null)
  const editor = useEditor({
    extensions: [
      StarterKit.configure({ link: false }),
      Link.configure({ openOnClick: false }),
      Color.configure({ types: ['textStyle'] }),
      Underline,
      TextAlign.configure({ types: ['heading', 'paragraph'] }),
      FontSize,
      Image.configure({ allowBase64: true }),
      ResizableTable.configure({ resizable: true, handleWidth: 12, cellMinWidth: 48, lastColumnResizable: true }),
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

  const runTableCommand = (command: 'addRowAfter' | 'addColumnAfter' | 'deleteRow' | 'deleteColumn' | 'deleteTable' | 'mergeCells' | 'splitCell'): void => {
    const chain = editor.chain().focus()
    const commandMap = {
      addRowAfter: () => chain.addRowAfter(),
      addColumnAfter: () => chain.addColumnAfter(),
      deleteRow: () => chain.deleteRow(),
      deleteColumn: () => chain.deleteColumn(),
      deleteTable: () => chain.deleteTable(),
      mergeCells: () => chain.mergeCells(),
      splitCell: () => chain.splitCell(),
    }
    commandMap[command]().run()
  }

  const tableMenuItems: MenuProps['items'] = [
    { key: 'addRowAfter', label: '在下方新增行', icon: <Rows3 size={14} /> },
    { key: 'addColumnAfter', label: '在右侧新增列', icon: <Columns3 size={14} /> },
    { type: 'divider' },
    { key: 'deleteRow', label: '删除当前行', icon: <Rows3 size={14} />, danger: true },
    { key: 'deleteColumn', label: '删除当前列', icon: <Columns3 size={14} />, danger: true },
    { key: 'deleteTable', label: '删除表格', icon: <Trash2 size={14} />, danger: true },
    { type: 'divider' },
    { key: 'mergeCells', label: '合并单元格', icon: <Merge size={14} /> },
    { key: 'splitCell', label: '拆分单元格', icon: <Split size={14} /> },
    { key: 'hint', label: '快捷键：Tab 移动，末尾自动新增行', disabled: true },
  ]

  const buttons = [
    { title: '二级标题', icon: Heading2, active: editor.isActive('heading', { level: 2 }), run: () => editor.chain().focus().toggleHeading({ level: 2 }).run() },
    { title: '粗体', icon: Bold, active: editor.isActive('bold'), run: () => editor.chain().focus().toggleBold().run() },
    { title: '斜体', icon: Italic, active: editor.isActive('italic'), run: () => editor.chain().focus().toggleItalic().run() },
    { title: '下划线', icon: UnderlineIcon, active: editor.isActive('underline'), run: () => editor.chain().focus().toggleUnderline().run() },
    { title: '删除线', icon: Strikethrough, active: editor.isActive('strike'), run: () => editor.chain().focus().toggleStrike().run() },
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
        <label className="rich-toolbar-select" title="文字颜色"><input type="color" value={editor.getAttributes('textStyle').color ?? '#303847'} onChange={(event) => editor.chain().focus().setColor(event.target.value).run()} /></label>
        <select className="rich-toolbar-font-size" title="字号" value={editor.getAttributes('textStyle').fontSize ?? ''} onChange={(event) => { const value = event.target.value; if (value) editor.chain().focus().setMark('textStyle', { fontSize: value }).run(); else editor.chain().focus().unsetMark('textStyle').run() }}><option value="">字号</option><option value="12px">小</option><option value="14px">中</option><option value="18px">大</option><option value="24px">特大</option></select>
        <button type="button" title="左对齐" className={editor.isActive({ textAlign: 'left' }) ? 'active' : ''} onClick={() => editor.chain().focus().setTextAlign('left').run()}><AlignLeft size={16} /></button>
        <button type="button" title="居中对齐" className={editor.isActive({ textAlign: 'center' }) ? 'active' : ''} onClick={() => editor.chain().focus().setTextAlign('center').run()}><AlignCenter size={16} /></button>
        <button type="button" title="右对齐" className={editor.isActive({ textAlign: 'right' }) ? 'active' : ''} onClick={() => editor.chain().focus().setTextAlign('right').run()}><AlignRight size={16} /></button>
        <button type="button" title="两端对齐" className={editor.isActive({ textAlign: 'justify' }) ? 'active' : ''} onClick={() => editor.chain().focus().setTextAlign('justify').run()}><AlignJustify size={16} /></button>
        <span className="toolbar-divider" />
        <button className={editor.isActive('link') ? 'active' : ''} type="button" title="链接" onClick={openLinkDialog}><Link2 size={16} /></button>
        <button type="button" title="插入图片" onClick={() => fileInputRef.current?.click()}><ImageIcon size={16} /></button>
        <button type="button" title="插入表格" onClick={() => setTableDialogOpen(true)}><Table2 size={16} /></button>
        {/* {editor.isActive('table') ? <>
          <span className="toolbar-divider" />
          <button type="button" title="新增行" onClick={() => runTableCommand('addRowAfter')}><Rows3 size={16} /></button>
          <button type="button" title="新增列" onClick={() => runTableCommand('addColumnAfter')}><Columns3 size={16} /></button>
          <button type="button" title="删除当前行" onClick={() => runTableCommand('deleteRow')}><Rows3 size={16} /></button>
          <button type="button" title="删除当前列" onClick={() => runTableCommand('deleteColumn')}><Columns3 size={16} /></button>
          <button type="button" title="删除表格" onClick={() => runTableCommand('deleteTable')}><Trash2 size={16} /></button>
        </> : null} */}
        <button type="button" title="代码块" onClick={() => editor.chain().focus().toggleCodeBlock().run()}><Braces size={16} /></button>
        <span className="toolbar-spacer" />
        <button type="button" title={fullscreen ? '退出全屏' : '全屏编辑'} onClick={() => setFullscreen((current) => !current)}>{fullscreen ? <Expand size={16} /> : <Maximize2 size={16} />}</button>
        <input ref={fileInputRef} type="file" accept="image/*" hidden onChange={(event) => { addImageFiles(event.target.files); event.target.value = '' }} />
      </div> : null}
      <Dropdown trigger={['contextMenu']} open={tableMenuOpen} onOpenChange={setTableMenuOpen} menu={{ items: tableMenuItems, onClick: ({ key }) => { runTableCommand(key as Parameters<typeof runTableCommand>[0]); setTableMenuOpen(false) } }}>
        <div
          className="rich-editor-content"
          onContextMenu={(event) => {
            if (readOnly || !editor.isActive('table')) return
            event.preventDefault()
            setTableMenuOpen(true)
          }}
        >
          <EditorContent editor={editor} />
        </div>
      </Dropdown>
      {readOnly ? <AntImage className="rich-editor-preview-image" src={previewImageSrc} preview={{ visible: Boolean(previewImageSrc), onVisibleChange: (visible) => { if (!visible) setPreviewImageSrc(undefined) } }} /> : null}
      <Modal title="设置链接" open={linkOpen} width={420} onCancel={() => setLinkOpen(false)} footer={null}>
        <Space.Compact block>
          <Input autoFocus value={linkHref} placeholder="https://example.com" onChange={(event) => setLinkHref(event.target.value)} onPressEnter={applyLink} />
          <Button type="primary" onClick={applyLink}>确定</Button>
        </Space.Compact>
      </Modal>
      <Modal title="插入表格" open={tableDialogOpen} width={360} okText="插入" cancelText="取消" onCancel={() => setTableDialogOpen(false)} onOk={() => { editor.chain().focus().insertTable({ rows: tableSize.rows, cols: tableSize.cols, withHeaderRow: true }).run(); setTableDialogOpen(false) }}>
        <div className="table-size-form"><label>行数<InputNumber min={1} max={30} value={tableSize.rows} onChange={(value) => setTableSize((current) => ({ ...current, rows: value ?? 1 }))} /></label><label>列数<InputNumber min={1} max={20} value={tableSize.cols} onChange={(value) => setTableSize((current) => ({ ...current, cols: value ?? 1 }))} /></label></div>
      </Modal>
    </div>
  )
}

const FontSize = TextStyle.extend({
  addGlobalAttributes() {
    return [{ types: ['textStyle'], attributes: { fontSize: { default: null, parseHTML: (element: HTMLElement) => element.style.fontSize || null, renderHTML: (attributes: { fontSize?: string }) => attributes.fontSize ? { style: `font-size: ${attributes.fontSize}` } : {} } } }]
  },
})

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
