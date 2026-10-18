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
import { readDom } from './model-render.ts'
import { withChildren, moveToEnd, moveToStart, moveNextTo, swapSiblings, removeIds, setAttrsById } from './model/edit.ts'
import { getRotationAngle } from './dom-utils.ts'
import { BBOX_AFFECTING_ATTRS } from './history.js'
import { LAYOUT_ATTRS, isAreaText } from './text-rows.ts'
import type SvgCanvas from '../svgcanvas.ts'
import type { SVGElementJSON } from '../svgcanvas.ts'
import type { ModelElement } from './model/node.ts'

/** The members `model-commands.ts` gives its canvas. */
export interface ModelCommandsApi {
  moveToTopSelectedElement(): void
  moveToBottomSelectedElement(): void
  moveUpDownSelected(dir: 'Up' | 'Down'): void
  switchSelectedZorder(): void
  deleteSelectedElements(): void
  /**
   * Set one attribute on these elements through the model, as one step. Returns false, having done nothing, for the attributes
   * and situations that still go through the DOM (`undo.ts`): ids, text, hrefs, x / y of a group or path, node editing, a
   * rotated element's box, an area text's layout.
   */
  changeSelectedAttributeByModel(attr: string, val: string | number, elems: Element[]): boolean
  /**
   * Create the element `data` describes (styled with the current paint when it asks for `curStyles`) as the last child of the
   * current group or layer, through the model, as one step. The element it returns is the one the renderer put in the DOM.
   */
  insertElementFromJson(data: SVGElementJSON): Element | null
  /**
   * Add these detached elements as the last child of the parent each names, through the model, as one step (inside a
   * transaction it joins that). Returns the elements the renderer put in the DOM, in the order given.
   */
  /**
   * Set (a string) or remove (`null`) attributes on one element through the model, as one step; the element keeps its node.
   * Returns false, having done nothing, for an element without an id (the model addresses by id).
   */
  setElementAttributes(label: string, el: Element, attrs: Record<string, string | null>): boolean
  insertLooseElements(entries: Array<{ parent: Element, el: Element, before?: Element | null }>, label?: string): Element[]
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

  /** The value an attribute gets from `val`: a number-like string is normalised, an empty one removes the attribute (0 stays). */
  const attributeValue = (val: string | number): string | null => {
    if (val) return String(Number.isNaN(parseFloat(String(val))) ? val : parseFloat(String(val)))
    if (typeof val === 'number') return String(val)
    return null
  }

  const changeSelectedAttributeByModel = (attr: string, val: string | number, elems: Element[]): boolean => {
    if (attr === 'id' || attr === '#text' || attr === '#href') return false
    if (svgCanvas.getCurrentMode() === 'pathedit' || svgCanvas.getCurrentMode() === 'textedit') return false
    const targets = elems.filter(Boolean)
    if (!targets.length || targets.some((el) => !el.id)) return false
    if ((attr === 'x' || attr === 'y') && targets.some((el) => ['g', 'polyline', 'path'].includes(el.tagName))) return false
    if (LAYOUT_ATTRS.has(attr) && targets.some(isAreaText)) return false
    if (attr !== 'transform' && BBOX_AFFECTING_ATTRS.has(attr) && targets.some((el) => getRotationAngle(el) !== 0)) return false
    const value = attributeValue(val)
    const changing = targets.filter((el) => (el.getAttribute(attr) ?? '') !== String(val))
    if (!changing.length) return true
    const set = Object.fromEntries(changing.map((el) => [el.id, value]))
    svgCanvas.snapshotHistory.edit(`Change ${attr}`, (root) => {
      let out = root
      for (const [id, v] of Object.entries(set)) out = setAttrsById(out, id, { [attr]: v })
      return out
    })
    // The selection boxes follow the new geometry (deferred, as the DOM path does)
    const selected = svgCanvas.getSelectedElements()
    for (const el of changing) {
      if (!selected.includes(el)) continue
      setTimeout(() => {
        if (el.parentNode && svgCanvas.getSelectedElements().includes(el)) svgCanvas.selectorManager.requestSelector(el).resize()
      }, 0)
    }
    return true
  }

  const insertElementFromJson = (data: SVGElementJSON): Element | null => {
    const attr = { ...data.attr } as Record<string, string | number>
    attr.id ??= svgCanvas.getNextId()
    const built = svgCanvas.buildElementFromJson({ ...data, attr })
    const container = svgCanvas.getCurrentGroup() || svgCanvas.getDrawing().getTargetLayerGroup()
    const at = container && svgCanvas.snapshotHistory.pathOf(container)
    if (!built || !at) return null
    const model = readDom(built) as ModelElement
    svgCanvas.snapshotHistory.edit(`Create ${data.element}`, (root) => withChildren(root, at, (kids) => [...kids, model]))
    return svgCanvas.getElement(String(attr.id)) ?? null
  }

  const insertLooseElements = (entries: Array<{ parent: Element, el: Element, before?: Element | null }>, label = 'Insert Elements'): Element[] => {
    const adds = entries.flatMap(({ parent, el, before }) => {
      const at = svgCanvas.snapshotHistory.pathOf(parent)
      return at ? [{ at, id: el.id, model: readDom(el) as ModelElement, beforeId: before?.id }] : []
    })
    if (!adds.length) return []
    svgCanvas.snapshotHistory.edit(label, (root) => {
      let out = root
      // Paths are indexes, and appending to a parent never moves another parent's children: later paths stay valid.
      for (const { at, model, beforeId } of adds) {
        out = withChildren(out, at, (kids) => {
          const i = beforeId ? kids.findIndex((k) => k.kind === 'element' && k.attrs.some((a) => a.name === 'id' && a.value === beforeId)) : -1
          return i < 0 ? [...kids, model] : [...kids.slice(0, i), model, ...kids.slice(i)]
        })
      }
      return out
    })
    return adds.map(({ id }) => (id ? svgCanvas.getElement(id) : null)).filter((el): el is Element => Boolean(el))
  }

  const setElementAttributes = (label: string, el: Element, attrs: Record<string, string | null>): boolean => {
    if (!el.id) return false
    svgCanvas.snapshotHistory.edit(label, (root) => setAttrsById(root, el.id, attrs))
    return true
  }

  return {
    setElementAttributes,
    insertLooseElements,
    insertElementFromJson,
    changeSelectedAttributeByModel,
    moveToTopSelectedElement,
    moveToBottomSelectedElement,
    moveUpDownSelected,
    switchSelectedZorder,
    deleteSelectedElements
  }
}
