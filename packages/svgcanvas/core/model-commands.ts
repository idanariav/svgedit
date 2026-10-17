/**
 * Commands that edit the drawing through the document model (R1 step c): stacking order and deletion.
 *
 * Each one decides what to do by looking at the drawing (the selection, where things are), then states the change as a
 * function of the model (`model/edit.ts`) and hands it to `snapshotHistory.edit`, which makes the DOM show it and records
 * the step. Nothing in this file writes to the DOM: an ESLint rule (`eslint.config.mjs`) rejects `append`, `remove`,
 * `insertBefore`, `setAttribute` and the like here, so a command cannot drift back to editing the live tree. Elements keep
 * their identity (the renderer matches by id), so the selection stays valid across an edit.
 * @module model-commands
 * @license MIT
 */
import { BatchCommand } from './history.js'
import { moveToEnd, moveToStart, moveNextTo, swapSiblings, removeIds } from './model/edit.ts'
import type SvgCanvas from '../svgcanvas.ts'

/** The members `model-commands.ts` gives its canvas. */
export interface ModelCommandsApi {
  moveToTopSelectedElement(): void
  moveToBottomSelectedElement(): void
  moveUpDownSelected(dir: 'Up' | 'Down'): void
  switchSelectedZorder(): void
  deleteSelectedElements(): void
}

/** Ascending document order (a before b in the DOM sorts first). */
const byDocumentOrder = (a: Element, b: Element): number => {
  const position = a.compareDocumentPosition(b)
  if (position & Node.DOCUMENT_POSITION_FOLLOWING) return -1
  if (position & Node.DOCUMENT_POSITION_PRECEDING) return 1
  return 0
}

export const createModelCommands = (canvas: SvgCanvas): ModelCommandsApi => {
  const svgCanvas = canvas

  /** The selection, without the holes, with an id each (an element without one cannot be addressed in the model). */
  const selectedWithIds = (): Array<{ el: Element, id: string }> =>
    svgCanvas.getSelectedElements().filter((el): el is Element => Boolean(el) && Boolean(el?.id)).map((el) => ({ el, id: el.id }))

  /** Run a reorder of the selected elements as one step; announce `changed` for the ones that ended up somewhere else. */
  const reorder = (label: string, edit: (ids: string[]) => (root: import('./model/node.ts').ModelElement) => import('./model/node.ts').ModelElement): void => {
    const selected = selectedWithIds()
    if (!selected.length) return
    const was = new Map(selected.map(({ el }) => [el, el.nextSibling]))
    const ids = selected.sort((a, b) => byDocumentOrder(a.el, b.el)).map(({ id }) => id)
    if (!svgCanvas.snapshotHistory.edit(label, edit(ids))) return
    const moved = selected.map(({ el }) => el).filter((el) => was.get(el) !== el.nextSibling)
    if (moved.length) svgCanvas.call('changed', moved)
  }

  const moveToTopSelectedElement = (): void => reorder('Move to Top', (ids) => (root) => moveToEnd(root, ids))
  const moveToBottomSelectedElement = (): void => reorder('Move to Bottom', (ids) => (root) => moveToStart(root, ids))

  /**
   * Moves one selected element up or down the stack by a single step, past the nearest element it visibly overlaps.
   * Looking (the intersection list) reads the drawing; the move is an edit of the model.
   */
  const moveOne = (selected: Element, dir: 'Up' | 'Down'): boolean => {
    svgCanvas.setCurBBoxes([])
    const list = svgCanvas.getIntersectionList(svgCanvas.getStrokedBBoxDefaultVisible([selected])) as Element[]
    if (dir === 'Down') list.reverse()
    const here = list.indexOf(selected)
    const closest = here < 0 ? undefined : list[here + 1]
    if (!closest?.id || !selected.id) return false
    const was = selected.nextSibling
    svgCanvas.snapshotHistory.edit(`Move ${dir}`, (root) => moveNextTo(root, selected.id, closest.id, dir === 'Down' ? 'before' : 'after'))
    return was !== selected.nextSibling
  }

  const moveUpDownSelected = (dir: 'Up' | 'Down'): void => {
    const selected = selectedWithIds().map(({ el }) => el)
    if (!selected.length) return
    // The bottommost first when moving down and the topmost first when moving up, so a multi-selection steps past the
    // elements that are not selected instead of blocking itself.
    const ascending = [...selected].sort(byDocumentOrder)
    const ordered = dir === 'Down' ? ascending : ascending.reverse()
    const moved: Element[] = []
    svgCanvas.transact(`Move ${dir}`, () => {
      for (const el of ordered) if (moveOne(el, dir)) moved.push(el)
    })
    if (moved.length) svgCanvas.call('changed', moved)
  }

  const switchSelectedZorder = (): void => {
    const selected = selectedWithIds()
    if (selected.length !== 2) return
    const [a, b] = selected
    if (a.el.parentNode !== b.el.parentNode) return
    if (svgCanvas.snapshotHistory.edit('Switch Layers', (root) => swapSiblings(root, a.id, b.id))) {
      svgCanvas.call('changed', [a.el, b.el])
    }
  }

  const deleteSelectedElements = (): void => {
    const selectedElements = svgCanvas.getSelectedElements()
    const gone: Element[] = [] // selectedElements is emptied below
    svgCanvas.transact('Delete Elements', () => {
      // Text that follows a path being deleted becomes plain text (needs the rail still in place); the entry it fills is not used
      svgCanvas.releaseTextOnPath?.(selectedElements.filter(Boolean), new BatchCommand('Delete Elements'))
      const ids: string[] = []
      for (const selected of selectedElements) {
        if (!selected) continue
        // this will unselect the element and remove the selectedOutline
        svgCanvas.selectorManager.releaseSelector(selected)
        // Remove the path if present.
        svgCanvas.removePath_(selected.id)
        // A single-child anchor goes with its child
        const parent = selected.parentNode as Element | null
        const target = parent && parent.tagName === 'a' && parent.childNodes.length === 1 ? parent : selected
        gone.push(selected)
        if (target.id) ids.push(target.id)
      }
      svgCanvas.snapshotHistory.edit('Delete Elements', (root) => removeIds(root, ids))
    })
    svgCanvas.setEmptySelectedElements()
    svgCanvas.call('changed', gone)
    svgCanvas.clearSelection()
  }

  return {
    moveToTopSelectedElement,
    moveToBottomSelectedElement,
    moveUpDownSelected,
    switchSelectedZorder,
    deleteSelectedElements
  }
}
