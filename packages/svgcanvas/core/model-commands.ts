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
import SvgPath from 'svgpath'
import { parseAffine, affineEdit, strokeForBake, translationEdit, composeAffine as compose, IDENTITY_AFFINE as IDENTITY, planPlacement, moveEdit, snapEdit } from './placement.ts'
import type { Affine, DragEntry, GridSnap } from './placement.ts'
import { bakeInScratch } from './scratch-bake.ts'
import { BatchCommand } from './history.js'
import { readDom } from './model-render.ts'
import { findById, withChildren, moveToEnd, moveToStart, moveNextTo, swapSiblings, removeIds, setAttrsById } from './model/edit.ts'
import { getRotationAngle } from './dom-utils.ts'
import { BBOX_AFFECTING_ATTRS } from './history.js'
import { LAYOUT_ATTRS, isAreaText } from './text-rows.ts'
import type SvgCanvas from '../svgcanvas.ts'
import type { SVGElementJSON } from '../svgcanvas.ts'
import { parseMatrix } from './model/matrix.ts'
import type { Matrix6 } from './model/matrix.ts'
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
  /** Fold the pure translation this element carries into its coordinates through the model; false when it carries more than that. */
  bakeTranslation(el: Element): boolean
  /**
   * A drag or resize of plain shapes ended: put each back to the transform it had before the drag (`before`) and state the move on
   * the model instead, as one step. Returns false, having touched nothing, unless every one of them can take it that way.
   * `dragPlan` is the gesture's model plan (`dragPlan`): its entries with feature data are baked on a copy.
   */
  bakeDrag(before: Map<Element, string>, undoPreview: (el: Element, was: string) => void, dragPlan: Map<Element, DragEntry> | null): boolean
  /** `setElementAttributes` for several elements at once: one step. False, touching nothing, if one has no id. */
  /**
   * A gesture that left a new `transform` on each of these elements (a rotation) ended: put each back to the transform it had
   * (`before`, undone with `undoPreview`) and state the transforms on the model instead, as one step. False, touching nothing,
   * when one has no id.
   */
  commitTransforms(label: string, before: Map<Element, string>, undoPreview: (el: Element, was: string) => void): boolean
  /**
   * End the undoable change `undoMgr.beginUndoableChange` started and record it: the attributes it changed are put back and
   * stated on the model instead (one step), so the model is what changes them. A change the model cannot state (an element
   * without an id, a pseudo attribute such as `#text`) is recorded as the command history does. Nothing changed: nothing recorded.
   */
  commitUndoableChange(restore: (el: Element, name: string, was: string | null) => void): void
  /** Remove these elements (and what is inside them) through the model, as one step. False, touching nothing, if one has no id. */
  removeElements(label: string, els: Element[]): boolean
  /**
   * Whether a drag of these elements can be shown through the model (each has an id and only a translation or scale for a transform,
   * and can take it in its own coordinates); the map is what each one's transform amounts to before the drag, or null.
   */
  dragPlan(elems: Element[], allowRotated?: boolean): Map<Element, DragEntry> | null
  /** Show the elements moved by (dx, dy) from where `plan` has them: the renderer writes the DOM, nothing is recorded yet. */
  previewDrag(plan: Map<Element, DragEntry>, dx: number, dy: number): void
  /** Show the elements scaled by `scale` (about the origin the caller put in it) after the transform each has in `plan`. */
  previewScale(plan: Map<Element, DragEntry>, scale: Affine): void
  /**
   * `previewScale` for an element turned by `rotate()`: `scale` is in the element's own (unturned) frame. The geometry is scaled
   * there, and the rotation keeps turning about the middle of the new geometry, which sits where the turned one's middle lands.
   */
  previewTurnedScale(plan: Map<Element, DragEntry>, scale: Affine): void
  /** Show every element in `plan` mapped by `map` after the transform it has in `plan` (a selection scaled or moved as one). */
  previewAfter(plan: Map<Element, Affine>, map: Affine): void
  /**
   * Where a rotation of this element can be shown through the model: its id and the point it turns about (the middle of its box,
   * or the point its `rotate()` already turns about); null when it carries another transform.
   */
  rotationPlan(el: Element): { id: string, cx: number, cy: number } | null
  /** Show the element turned to `angle` (degrees) about the plan's point; the renderer writes the transform. */
  previewRotation(plan: { id: string, cx: number, cy: number }, angle: number): void
  /** Starting transforms of these elements when a rotation of the whole selection can be shown through the model (each has an id and a plain transform); else null. */
  rotationGroupPlan(elems: Element[]): Map<Element, Affine> | null
  /** Show the selection turned by `angle` degrees about (cx, cy): each element's transform becomes that rotation after its own. */
  previewGroupRotation(plan: Map<Element, Affine>, angle: number, cx: number, cy: number): void
  setElementsAttributes(label: string, entries: Array<{ el: Element, attrs: Record<string, string | null> }>): boolean
  setElementAttributes(label: string, el: Element, attrs: Record<string, string | null>): boolean
  insertLooseElements(entries: Array<{ parent: Element, el: Element, before?: Element | null }>, label?: string): Element[]
}

export { parseMatrix }
export type { Matrix6 }
// the placement policy lives in placement.ts (roadmap R12); re-exported for the modules that import it from here
export { parseAffine, affineEdit, strokeForBake, translationEdit, composeAffine, IDENTITY_AFFINE } from './placement.ts'
export type { Affine, DragEntry } from './placement.ts'

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

  /** Run a reorder of the selected elements as one step (announced as `documentChanged`, which names the parents that changed). */
  const reorder = (label: string, edit: (ids: string[]) => (root: import('./model/node.ts').ModelElement) => import('./model/node.ts').ModelElement): void => {
    const selected = selectedWithIds()
    if (!selected.length) return
    const ids = selected.sort((a, b) => byDocumentOrder(a.el, b.el)).map(({ id }) => id)
    svgCanvas.snapshotHistory.edit(label, edit(ids))
  }

  const moveToTopSelectedElement = (): void => reorder('Move to Top', (ids) => (root) => moveToEnd(root, ids))
  const moveToBottomSelectedElement = (): void => reorder('Move to Bottom', (ids) => (root) => moveToStart(root, ids))

  /**
   * Moves one selected element up or down the stack by a single step, past the nearest element it visibly overlaps.
   * Looking (the intersection list) reads the drawing; the move is an edit of the model.
   */
  const moveOne = (selected: Element, dir: 'Up' | 'Down'): void => {
    svgCanvas.setCurBBoxes([])
    const list = svgCanvas.getIntersectionList(svgCanvas.getStrokedBBoxDefaultVisible([selected])) as Element[]
    if (dir === 'Down') list.reverse()
    const here = list.indexOf(selected)
    const closest = here < 0 ? undefined : list[here + 1]
    if (!closest?.id || !selected.id) return
    svgCanvas.snapshotHistory.edit(`Move ${dir}`, (root) => moveNextTo(root, selected.id, closest.id, dir === 'Down' ? 'before' : 'after'))
  }

  const moveUpDownSelected = (dir: 'Up' | 'Down'): void => {
    const selected = selectedWithIds().map(({ el }) => el)
    if (!selected.length) return
    // The bottommost first when moving down and the topmost first when moving up, so a multi-selection steps past the
    // elements that are not selected instead of blocking itself.
    const ascending = [...selected].sort(byDocumentOrder)
    const ordered = dir === 'Down' ? ascending : ascending.reverse()
    svgCanvas.transact(`Move ${dir}`, () => {
      for (const el of ordered) moveOne(el, dir)
    })
  }

  const switchSelectedZorder = (): void => {
    const selected = selectedWithIds()
    if (selected.length !== 2) return
    const [a, b] = selected
    if (a.el.parentNode !== b.el.parentNode) return
    svgCanvas.snapshotHistory.edit('Switch Layers', (root) => swapSiblings(root, a.id, b.id))
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

  const bakeTranslation = (el: Element): boolean => {
    const set = el.id ? translationEdit(el, 0, 0) : null
    if (!set || !el.hasAttribute('transform')) return false
    svgCanvas.snapshotHistory.edit('position', (root) => setAttrsById(root, el.id, set))
    return true
  }

  const bakeDrag = (before: Map<Element, string>, undoPreview: (el: Element, was: string) => void, dragPlan: Map<Element, DragEntry> | null): boolean => {
    // a drag shown through the model ends here: the preview is the step
    if (svgCanvas.snapshotHistory.previewing) {
      // Shapes with feature data are baked on a copy now that the move is final; the model takes what the bake changed
      const scratch = [...(dragPlan ?? [])].filter(([, entry]) => entry.scratch)
      const baked = scratch.map(([el, entry]) => {
        const changes = bakeInScratch(svgCanvas, el)
        // the bake folds the matrix the element had before the drag (entry.matrix) into its geometry: keep the stroke's look
        const m = entry.matrix
        const s = m ? Math.sqrt(Math.abs(m[0] * m[3] - m[1] * m[2])) : 1
        return [el, changes && { ...changes, ...strokeForBake(el, { a: s, d: s, e: 0, f: 0 }) }] as const
      })
      const show = lastPreview
      if (show && baked.length && baked.every(([, changes]) => changes)) {
        svgCanvas.snapshotHistory.preview((root) => {
          let out = show(root)
          for (const [el, changes] of baked) out = setAttrsById(out, el.id, changes as Record<string, string | null>)
          return out
        })
      }
      svgCanvas.snapshotHistory.endPreview('position')
      return true
    }
    const plan: Array<{ el: Element, was: string, set: Record<string, string | null> }> = []
    for (const [el, was] of before) {
      const now = parseAffine(el.getAttribute('transform'))
      const set = el.id && now ? affineEdit(el, now) : null
      if (!set) return false
      // the scale the element had before the drag is baked too: its stroke keeps its look
      plan.push({ el, was, set: { ...set, ...strokeForBake(el, parseAffine(was) ?? IDENTITY) } })
    }
    if (!plan.length) return false
    // the preview is undone first, so the step starts from the drawing as it was before the gesture
    for (const { el, was } of plan) undoPreview(el, was)
    svgCanvas.snapshotHistory.edit('position', (root) => {
      let out = root
      for (const { el, set } of plan) out = setAttrsById(out, el.id, set)
      return out
    })
    return true
  }

  const setElementsAttributes = (label: string, entries: Array<{ el: Element, attrs: Record<string, string | null> }>): boolean => {
    if (!entries.length || entries.some(({ el }) => !el.id)) return false
    svgCanvas.snapshotHistory.edit(label, (root) => {
      let out = root
      for (const { el, attrs } of entries) out = setAttrsById(out, el.id, attrs)
      return out
    })
    return true
  }

  const commitTransforms = (label: string, before: Map<Element, string>, undoPreview: (el: Element, was: string) => void): boolean => {
    const entries = [...before.keys()].map((el) => ({ el, attrs: { transform: el.getAttribute('transform') || null } }))
    if (!entries.length || entries.some(({ el }) => !el.id)) return false
    for (const [el, was] of before) undoPreview(el, was)
    return setElementsAttributes(label, entries)
  }

  const commitUndoableChange = (restore: (el: Element, name: string, was: string | null) => void): void => {
    const batch = svgCanvas.undoMgr.finishUndoableChange()
    if (batch.isEmpty()) return
    type Change = { elem: Element, oldValues: Record<string, string | null> }
    const changes = (batch as unknown as { stack: Change[] }).stack.filter(Boolean)
    const statable = changes.every(({ elem, oldValues }) => elem.id && Object.keys(oldValues).every((name) => !name.startsWith('#')))
    if (!statable) {
      svgCanvas.undoMgr.addCommandToHistory(batch)
      return
    }
    const entries = changes.map(({ elem, oldValues }) => ({
      elem,
      was: oldValues,
      attrs: Object.fromEntries(Object.keys(oldValues).map((name) => [name, elem.getAttribute(name)]))
    }))
    for (const { elem, was } of entries) for (const [name, value] of Object.entries(was)) restore(elem, name, value)
    setElementsAttributes(batch.getText?.() ?? 'Change', entries.map(({ elem, attrs }) => ({ el: elem, attrs })))
  }

  const removeElements = (label: string, els: Element[]): boolean => {
    if (!els.length || els.some((el) => !el.id)) return false
    const ids = els.map((el) => el.id)
    svgCanvas.snapshotHistory.edit(label, (root) => removeIds(root, ids))
    return true
  }

  // the policy (placement.ts) for every element of a drag, a resize or a rotation
  const dragPlan = (elems: Element[], allowRotated = false): Map<Element, DragEntry> | null => {
    if (!elems.length) return null
    const plan = new Map<Element, DragEntry>()
    for (const el of elems) {
      const entry = planPlacement(el, allowRotated)
      if (!entry) return null
      plan.set(el, entry)
    }
    return plan
  }

  const previewWith = (plan: Map<Element, DragEntry>, total: (own: Affine) => Affine): void => {
    svgCanvas.snapshotHistory.preview((root) => {
      let out = root
      for (const [el, own] of plan) {
        const node = findById(root, el.id)
        const set = node && affineEdit(node, total(own))
        if (set) out = setAttrsById(out, el.id, { ...set, ...own.stroke })
      }
      return out
    })
  }
  let lastPreview: ((root: ModelElement) => ModelElement) | null = null
  /** The grid, when it is on: a move's written coordinates land on it (the drag's delta is snapped by the gesture). */
  const grid = (): GridSnap | null => svgCanvas.getGridSnapping?.()
    ? { point: (x, y) => svgCanvas.snapPointToGrid(x, y), value: (v) => svgCanvas.snapToGrid(v) }
    : null
  const previewDrag = (plan: Map<Element, DragEntry>, dx: number, dy: number): void => {
    const snap = grid()
    svgCanvas.snapshotHistory.preview(lastPreview = (root) => {
      let out = root
      for (const [el, entry] of plan) {
        const node = findById(root, el.id)
        const set = node && moveEdit(node, entry, dx, dy)
        // what the drag shows is what it writes: on the grid, before the release (a turned shape turns about a centre the
        // grid does not move, and a matrix-placed one keeps its geometry: the snapped drag moves those)
        if (set) out = setAttrsById(out, el.id, snap && !entry.matrix && !entry.rot ? snapEdit(el, set, snap) : set)
      }
      return out
    })
  }
  const previewScale = (plan: Map<Element, DragEntry>, scale: Affine): void => previewWith(plan, (own) => compose(own, scale))
  /** The middle of the bounds of the coordinates an edit wrote (a point of the new geometry to keep the turn about). */
  const geometryMiddle = (node: ModelElement, set: Record<string, string | null>): [number, number] | null => {
    const num = (name: string): number => Number(set[name] ?? node.attrs.find((a) => a.name === name)?.value ?? 0)
    const bounds = (pts: Array<[number, number]>): [number, number] | null => {
      if (!pts.length) return null
      const xs = pts.map((p) => p[0])
      const ys = pts.map((p) => p[1])
      return [(Math.min(...xs) + Math.max(...xs)) / 2, (Math.min(...ys) + Math.max(...ys)) / 2]
    }
    switch (node.name) {
      case 'rect': case 'image': case 'foreignObject': return [num('x') + num('width') / 2, num('y') + num('height') / 2]
      case 'ellipse': case 'circle': return [num('cx'), num('cy')]
      case 'line': return bounds([[num('x1'), num('y1')], [num('x2'), num('y2')]])
      case 'polyline': case 'polygon': {
        const n = (set.points ?? '').trim().split(/[\s,]+/).filter(Boolean).map(Number)
        return bounds(n.flatMap((v, i) => (i % 2 ? [] : [[v, n[i + 1]] as [number, number]])))
      }
      case 'path': {
        const pts: Array<[number, number]> = []
        for (const seg of (new SvgPath(set.d ?? '').abs().unarc().unshort() as unknown as { segments: Array<[string, ...number[]]> }).segments) {
          const v = seg.slice(1) as number[]
          if (seg[0] === 'H') pts.push([v[0], 0])
          else if (seg[0] === 'V') pts.push([0, v[0]])
          else for (let i = 0; i + 1 < v.length; i += 2) pts.push([v[i], v[i + 1]])
        }
        return bounds(pts)
      }
      default: return null
    }
  }

  const previewTurnedScale = (plan: Map<Element, DragEntry>, scale: Affine): void => {
    svgCanvas.snapshotHistory.preview((root) => {
      let out = root
      for (const [el, entry] of plan) {
        const rot = entry.rot
        const node = findById(root, el.id)
        const scaled = rot && node && affineEdit(node, scale)
        const was = scaled && node && geometryMiddle(node, scaled)
        if (!rot || !node || !scaled || !was) continue
        // The scaled geometry's middle lands where the turn takes it; the shape is then moved there and turned about it
        const rad = rot.angle * Math.PI / 180
        const ox = was[0] - rot.cx
        const oy = was[1] - rot.cy
        const c1x = rot.cx + Math.cos(rad) * ox - Math.sin(rad) * oy
        const c1y = rot.cy + Math.sin(rad) * ox + Math.cos(rad) * oy
        const set = affineEdit(node, compose({ a: 1, d: 1, e: c1x - was[0], f: c1y - was[1] }, scale))
        if (!set) continue
        const round = (v: number) => Number(v.toFixed(6))
        set.transform = `rotate(${rot.angle} ${round(c1x)} ${round(c1y)})`
        out = setAttrsById(out, el.id, set)
      }
      return out
    })
  }
  const previewAfter = (plan: Map<Element, DragEntry>, map: Affine): void => previewWith(plan, (own) => compose(map, own))

  const rotationPlan = (el: Element): { id: string, cx: number, cy: number } | null => {
    if (!el.id) return null
    const transform = (el.getAttribute('transform') ?? '').trim()
    const turned = /^rotate\(\s*(-?[\d.eE+-]+)[\s,]+(-?[\d.eE+-]+)[\s,]+(-?[\d.eE+-]+)\s*\)$/.exec(transform)
    if (turned) return { id: el.id, cx: Number(turned[2]), cy: Number(turned[3]) }
    if (transform) return null
    const box = (el as unknown as SVGGraphicsElement).getBBox?.()
    return box ? { id: el.id, cx: box.x + box.width / 2, cy: box.y + box.height / 2 } : null
  }

  const previewRotation = (plan: { id: string, cx: number, cy: number }, angle: number): void => {
    svgCanvas.snapshotHistory.preview((root) => setAttrsById(root, plan.id, {
      transform: angle ? `rotate(${Number(angle.toFixed(6))} ${plan.cx} ${plan.cy})` : null
    }))
  }

  const rotationGroupPlan = (elems: Element[]): Map<Element, Affine> | null => {
    if (!elems.length) return null
    const plan = new Map<Element, Affine>()
    for (const el of elems) {
      const own = el.id ? parseAffine(el.getAttribute('transform')) : null
      if (!own) return null
      plan.set(el, own)
    }
    return plan
  }

  const previewGroupRotation = (plan: Map<Element, Affine>, angle: number, cx: number, cy: number): void => {
    const rad = angle * Math.PI / 180
    const cos = Math.cos(rad)
    const sin = Math.sin(rad)
    // rotation about (cx, cy): x' = cos x - sin y + (cx - cos cx + sin cy), y' = sin x + cos y + (cy - sin cx - cos cy)
    const re = cx - cos * cx + sin * cy
    const rf = cy - sin * cx - cos * cy
    const n = (v: number) => Number(v.toFixed(6))
    svgCanvas.snapshotHistory.preview((root) => {
      let out = root
      for (const [el, { a, d, e, f }] of plan) {
        const m = [cos * a, sin * a, -sin * d, cos * d, cos * e - sin * f + re, sin * e + cos * f + rf].map(n)
        out = setAttrsById(out, el.id, { transform: `matrix(${m.join(' ')})` })
      }
      return out
    })
  }

  return {
    rotationGroupPlan,
    previewGroupRotation,
    rotationPlan,
    previewRotation,
    dragPlan,
    previewDrag,
    previewScale,
    previewTurnedScale,
    previewAfter,
    removeElements,
    commitUndoableChange,
    commitTransforms,
    setElementsAttributes,
    bakeDrag,
    bakeTranslation,
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
