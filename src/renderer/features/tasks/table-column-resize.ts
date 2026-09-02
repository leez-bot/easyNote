import { Table } from '@tiptap/extension-table'
import { Plugin } from '@tiptap/pm/state'
import { cellAround, TableMap, updateColumnsOnResize } from '@tiptap/pm/tables'
import type { EditorView } from '@tiptap/pm/view'

const EDGE_PX = 12
const MIN_COL_WIDTH = 48

type EdgeInfo = {
  cellPos: number
  startWidth: number
}

function findResizeEdge(view: EditorView, event: MouseEvent): EdgeInfo | null {
  const target = event.target
  if (!(target instanceof Element)) return null
  const cellEl = target.closest('td, th')
  if (!(cellEl instanceof HTMLElement) || !view.dom.contains(cellEl)) return null

  const rect = cellEl.getBoundingClientRect()
  const nearRight = rect.right - event.clientX <= EDGE_PX && event.clientX <= rect.right + 6
  const nearLeft = event.clientX - rect.left <= EDGE_PX
  if (!nearRight && !nearLeft) return null

  let pos: number
  try {
    pos = view.posAtDOM(cellEl, 0)
  } catch {
    return null
  }

  const $cell = cellAround(view.state.doc.resolve(pos))
  if (!$cell || !$cell.nodeAfter) return null

  if (nearLeft) {
    const table = $cell.node(-1)
    const start = $cell.start(-1)
    const map = TableMap.get(table)
    const index = map.map.indexOf($cell.pos - start)
    if (index % map.width === 0) return null
    const prevPos = start + map.map[index - 1]
    const prevCell = table.nodeAt(map.map[index - 1])
    if (!prevCell) return null
    return { cellPos: prevPos, startWidth: Math.max(cellEl.previousElementSibling instanceof HTMLElement ? cellEl.previousElementSibling.offsetWidth : MIN_COL_WIDTH, MIN_COL_WIDTH) }
  }

  return { cellPos: $cell.pos, startWidth: Math.max(cellEl.offsetWidth, MIN_COL_WIDTH) }
}

function previewWidth(view: EditorView, cellPos: number, width: number): void {
  const $cell = view.state.doc.resolve(cellPos)
  const table = $cell.node(-1)
  const start = $cell.start(-1)
  const col = TableMap.get(table).colCount($cell.pos - start) + ($cell.nodeAfter?.attrs.colspan ?? 1) - 1
  let dom: Node | null = view.domAtPos(start).node
  while (dom && !(dom instanceof HTMLTableElement)) dom = dom.parentNode
  if (!(dom instanceof HTMLTableElement) || !(dom.firstChild instanceof HTMLTableColElement)) return
  updateColumnsOnResize(table, dom.firstChild, dom, MIN_COL_WIDTH, col, width)
}

function commitWidth(view: EditorView, cellPos: number, width: number): void {
  const $cell = view.state.doc.resolve(cellPos)
  const table = $cell.node(-1)
  const map = TableMap.get(table)
  const start = $cell.start(-1)
  const col = map.colCount($cell.pos - start) + ($cell.nodeAfter?.attrs.colspan ?? 1) - 1
  const tr = view.state.tr

  for (let row = 0; row < map.height; row += 1) {
    const mapIndex = row * map.width + col
    if (row && map.map[mapIndex] === map.map[mapIndex - map.width]) continue
    const pos = map.map[mapIndex]
    const cell = table.nodeAt(pos)
    if (!cell) continue
    const attrs = cell.attrs
    const index = attrs.colspan === 1 ? 0 : col - map.colCount(pos)
    const colwidth = attrs.colwidth ? [...attrs.colwidth] : Array.from({ length: attrs.colspan }, () => 0)
    colwidth[index] = width
    tr.setNodeMarkup(start + pos, null, { ...attrs, colwidth })
  }

  if (tr.docChanged) view.dispatch(tr)
}

export const ResizableTable = Table.extend({
  addProseMirrorPlugins() {
    return [
      ...(this.parent?.() ?? []),
      new Plugin({
        props: {
          handleDOMEvents: {
            mousemove: (view, event) => {
              if (!view.editable) {
                view.dom.classList.remove('resize-cursor')
                return false
              }
              view.dom.classList.toggle('resize-cursor', Boolean(findResizeEdge(view, event)))
              return false
            },
            mouseleave: (view) => {
              view.dom.classList.remove('resize-cursor')
              return false
            },
            mousedown: (view, event) => {
              if (!view.editable || event.button !== 0) return false
              const edge = findResizeEdge(view, event)
              if (!edge) return false

              event.preventDefault()
              const startX = event.clientX
              const { cellPos, startWidth } = edge

              const onMove = (moveEvent: MouseEvent): void => {
                previewWidth(view, cellPos, Math.max(MIN_COL_WIDTH, startWidth + (moveEvent.clientX - startX)))
              }
              const onUp = (upEvent: MouseEvent): void => {
                window.removeEventListener('mousemove', onMove)
                window.removeEventListener('mouseup', onUp)
                commitWidth(view, cellPos, Math.max(MIN_COL_WIDTH, startWidth + (upEvent.clientX - startX)))
                view.dom.classList.remove('resize-cursor')
              }

              window.addEventListener('mousemove', onMove)
              window.addEventListener('mouseup', onUp)
              return true
            },
          },
        },
      }),
    ]
  },
})
