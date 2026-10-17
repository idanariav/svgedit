/**
 * Gestures of the Layers panel's eye / lock columns and layer rows:
 *  - **Alt-click an eye or a padlock** acts on every *other* row (the siblings,
 *    for an object row): hide / lock them all, or, when they already are, show /
 *    unlock them all. Alt-click the comment icon toggles the tracing template.
 *  - **Drag down the eye or lock column** sets every row it passes to the state
 *    the first row is going to (one undo step for visibility; layer locks are not
 *    undoable, as ever).
 *  - **Drag a layer row** (by its name or thumbnail) to reorder the layers.
 *
 * Plain clicks stay with the cells' own handlers (`RightPanel.populateLayers`,
 * `layerTree.js`); this class only adds what they do not do. Pointer events, so
 * it works for mouse and pen; touch scrolls the panel instead of dragging.
 *
 * Ported idea: VectorCraft's layer panel (`crates/ui-egui/src/panels/layers.rs`,
 * `crates/engine/src/cmd/layerpanel.rs`: hideOthers / showAll / lockOthers /
 * unlockAll), MIT OR Apache-2.0.
 * @module layerGestures
 * @license MIT
 */

import { isPanelObject, isObjectHidden, hasLockMark } from '@svgedit/svgcanvas/core/object-state.ts'

const DRAG_THRESHOLD = 4
const CELLS = 'td.layervis, td.layerlock, td.objvis, td.objlock'

/**
 * What an Alt-click on a row's eye / lock does. `on` is the restrictive state
 * (hidden / locked). If any other row is off, all of them go on; if they are all on,
 * all go off. `revealClicked` (eyes) also shows the clicked row when others get hidden.
 * @param rows every sibling row, clicked one included
 * @param clicked the key of the clicked row
 * @returns key → new `on`
 */
export const planOthers = (rows: Array<{ key: unknown, on: boolean, skip?: boolean }>, clicked: unknown, revealClicked: boolean = false): Array<[any, boolean]> => {
  const others = rows.filter((r) => r.key !== clicked && !r.skip)
  if (!others.length) return []
  const turnOn = others.some((r) => !r.on)
  const out: Array<[unknown, boolean]> = others.filter((r) => r.on !== turnOn).map((r) => [r.key, turnOn])
  if (revealClicked && rows.find((r) => r.key === clicked)?.on) out.push([clicked, false])
  return out
}

/**
 * Where a dragged layer ends up: its z-index (0 = bottom) once dropped above or
 * below `target` in the panel, which lists the top layer first.
 * @param names layer names, bottom to top
 * @param above dropped on the upper half (nearer the top of the panel)
 * @returns the new index (the old one when nothing moves)
 */
export const layerDropIndex = (names: string[], dragged: string, target: string, above: boolean): number => {
  if (dragged === target) return names.indexOf(dragged)
  const rest = names.filter((n) => n !== dragged)
  const t = rest.indexOf(target)
  return above ? t + 1 : t
}

export class LayerGestures {
  editor: EditorInstance
  drag: unknown

  constructor (editor: EditorInstance) {
    this.editor = editor
    this.drag = null
  }

  get canvas () { return this.editor.svgCanvas }
  get table () { return this.editor.$req('layerlist') }
  get panel () { return this.editor.rightPanel }

  /** Wire the table's events once. */
  attach (): void {
    const table = this.table
    // Capture, so an Alt-click never reaches the cells' own (plain click) handlers.
    table.addEventListener('click', (evt) => this.onAltClick(evt), true)
    table.addEventListener('pointerdown', (evt: PointerEvent) => this.onPointerDown(evt))
  }

  /** @returns the name a layer row stands for */
  nameOf (tr: Element): string { return tr.querySelector('td.layername')?.textContent ?? '' }

  // ── Alt-click ────────────────────────────────────────────────────────────

  onAltClick (evt: MouseEvent) {
    if (!evt.altKey || evt.button > 0) return
    const target = evt.target as Element
    const cell = target.closest(`${CELLS}, td.layercomment`)
    if (!cell) return
    evt.preventDefault()
    evt.stopPropagation()
    const tr = (cell.closest('tr') as unknown) as HTMLElement & { _el: Element }
    if (cell.matches('td.layercomment')) {
      this.panel.toggleLayerTemplate(this.nameOf(tr))
    } else if (tr.classList.contains('layer')) {
      this.layerOthers(tr, cell.matches('td.layervis') ? 'vis' : 'lock')
    } else {
      this.objectOthers(tr._el, cell.matches('td.objvis') ? 'vis' : 'lock')
    }
  }

  /** @param tr the clicked layer row */
  layerOthers (tr: Element, col: 'vis' | 'lock'): void {
    const drawing = this.canvas.getCurrentDrawing()
    const rows = this.panel.layerTree.layerRows().map((row: Element) => {
      const name = this.nameOf(row)
      return {
        key: name,
        on: col === 'vis' ? !drawing.getLayerVisibility(name) : drawing.getLayerLocked(name),
        // Comment layers are managed on their own (as Focus mode does).
        skip: drawing.getLayerComment(name)
      }
    })
    const plan = planOthers(rows, this.nameOf(tr), col === 'vis')
    if (!plan.length) return
    const states = Object.fromEntries(plan.map(([name, on]) => [name, col === 'vis' ? !on : on]))
    if (col === 'vis') this.panel.applyLayerVisibility(states)
    else this.panel.applyLayerLock(states)
  }

  /** @param el the clicked object */
  objectOthers (el: Element, col: 'vis' | 'lock'): void {
    const sibs = Array.from((el.parentNode as ParentNode).children).filter(isPanelObject)
    const rows = sibs.map((e) => ({ key: e, on: col === 'vis' ? isObjectHidden(e) : hasLockMark(e) }))
    const plan = planOthers(rows, el, col === 'vis')
    if (!plan.length) return
    this.setObjects(col, plan.filter(([, on]) => on).map(([e]) => e), plan.filter(([, on]) => !on).map(([e]) => e))
  }

  /**
 * @param on to hide / lock
 * @param off to show / unlock
   */
  setObjects (col: 'vis' | 'lock', on: Element[], off: Element[]): void {
    const c = this.canvas
    c.transact(col === 'vis' ? 'Hide' : 'Lock', () => {
      if (col === 'vis') { c.setObjectsHidden(on, true); c.setObjectsHidden(off, false) } else { c.setObjectsLocked(on, true); c.setObjectsLocked(off, false) }
    })
    this.panel.layerTree.invalidate()
  }

  // ── Pointer: column paint and layer reorder ──────────────────────────────

  onPointerDown (evt: PointerEvent) {
    if (evt.button !== 0 || evt.altKey) return
    const target = evt.target as Element
    const cell = target.closest(CELLS)
    if (cell) return this.startPaint(evt, cell)
    const tr = target.closest('tr.layer')
    if (tr && !target.closest('td.layertoggle, td.layercomment, input')) this.startReorder(evt, tr)
  }

  /** Run a pointer gesture: `move(e)` once the pointer is 4px away, `end(e, committed)` on release / Esc. */
  track (evt: PointerEvent, begin: (e: PointerEvent) => void, move: (e: PointerEvent) => void, end: (commit: boolean) => void): void {
    const start = { x: evt.clientX, y: evt.clientY }
    let began = false
    const onMove = (e: PointerEvent) => {
      if (!began) {
        if (Math.hypot(e.clientX - start.x, e.clientY - start.y) < DRAG_THRESHOLD) return
        began = true
        begin(e)
      }
      move(e)
    }
    const finish = (commit: boolean) => {
      document.removeEventListener('pointermove', onMove)
      document.removeEventListener('pointerup', onUp)
      document.removeEventListener('keydown', onKey, true)
      if (began) end(commit)
    }
    const onUp = () => finish(true)
    const onKey = (e: { key: string; stopPropagation: () => void; }) => { if (e.key === 'Escape') { e.stopPropagation(); finish(false) } }
    document.addEventListener('pointermove', onMove)
    document.addEventListener('pointerup', onUp)
    document.addEventListener('keydown', onKey, true)
  }

  /** The click / mouseup that ends a drag must not act as a plain click. */
  swallowNext (...types: string[]) {
    const table = this.table
    const stop = (e: { stopPropagation: () => void; preventDefault: () => void; }) => { e.stopPropagation(); e.preventDefault() }
    for (const type of types) {
      table.addEventListener(type, stop, true)
      setTimeout(() => table.removeEventListener(type, stop, true), 0)
    }
  }

  // Column paint

  startPaint (evt: PointerEvent, cell: Element): void {
    const col = cell.matches('td.layervis, td.objvis') ? 'vis' : 'lock'
    const first = cell.closest('tr') as HTMLTableRowElement
    const flagOf = (c: Element) => c.classList.contains(col === 'vis' ? (c.matches('td.layervis') ? 'layerinvis' : 'objinvis') : 'locked')
    const goOn = !flagOf(cell)
    const sel = col === 'vis' ? 'td.layervis, td.objvis' : 'td.layerlock, td.objlock'
    let painted: Element[] = []
    const clear = () => { painted.forEach((c) => c.classList.remove('colpaint')); painted = [] }
    const rowsBetween = (a: Element, b: Element) => {
      const all = Array.from(this.table.querySelectorAll('tbody > tr.layer, tbody > tr.object'))
      const i = all.indexOf(a)
      const j = all.indexOf(b)
      return i < 0 || j < 0 ? [] : all.slice(Math.min(i, j), Math.max(i, j) + 1)
    }
    let last: Element = first
    this.track(evt, () => {}, (e) => {
      const under = document.elementFromPoint(e.clientX, e.clientY)?.closest('#layerlist tr.layer, #layerlist tr.object')
      if (under) last = under
      clear()
      painted = (rowsBetween(first, last).map((tr) => tr.querySelector(sel)).filter(Boolean) as Element[])
      painted.forEach((c) => c.classList.add('colpaint'))
    }, (commit) => {
      const rows = painted.map((c) => c.closest('tr')) as Element[]
      clear()
      this.swallowNext('click')
      if (commit) this.paint(col, goOn, rows)
    })
  }

  /** Set the rows' eye / lock to `on` (hidden / locked): one undo step. */
  paint (col: 'vis' | 'lock', on: boolean, rows: Element[]): void {
    const names = rows.filter((r) => r.classList.contains('layer')).map((r) => this.nameOf(r))
    const objs = rows.filter((r) => r.classList.contains('object')).map((r) => (r as Element & { _el: Element })._el)
    const layerStates = Object.fromEntries(names.map((n) => [n, col === 'vis' ? !on : on]))
    this.canvas.transact(col === 'vis' ? 'Layer Visibility' : 'Lock', () => {
      if (col === 'vis') this.panel.applyLayerVisibility(layerStates)
      else this.panel.applyLayerLock(layerStates)
      if (objs.length) {
        if (col === 'vis') this.canvas.setObjectsHidden(objs, on)
        else this.canvas.setObjectsLocked(objs, on)
      }
    })
    if (objs.length) this.panel.layerTree.invalidate()
  }

  // Layer reorder

  startReorder (evt: PointerEvent, tr: Element): void {
    const name = this.nameOf(tr)
    if (!name) return
    let drop: { tr: Element; above: boolean; index: number; } | null = null
    const clear = () => this.table.querySelectorAll('.drop-above, .drop-below').forEach((r) =>
      r.classList.remove('drop-above', 'drop-below'))
    this.track(evt, () => {
      tr.classList.add('layerdragging')
      this.table.classList.add('tree-dragging')
    }, (e) => {
      clear()
      drop = this.reorderTarget(name, e)
      if (drop) drop.tr.classList.add(drop.above ? 'drop-above' : 'drop-below')
    }, (commit) => {
      clear()
      tr.classList.remove('layerdragging')
      this.table.classList.remove('tree-dragging')
      // The mouseup that follows would make the row under the pointer current.
      this.swallowNext('mouseup', 'click')
      if (commit && drop) this.reorder(name, drop.index)
    })
  }

  /** @param name the dragged layer */
  reorderTarget (name: string, e: PointerEvent): { tr: Element, above: boolean, index: number } | null {
    let tr = document.elementFromPoint(e.clientX, e.clientY)?.closest('#layerlist tr.layer, #layerlist tr.object, #layerlist tr.objmore')
    // An object row stands for its layer's block.
    while (tr && !tr.classList.contains('layer')) tr = tr.previousElementSibling
    if (!tr) return null
    let end = tr
    while (end.nextElementSibling?.matches('tr.object, tr.objmore')) end = end.nextElementSibling
    const top = tr.getBoundingClientRect().top
    const bottom = end.getBoundingClientRect().bottom
    const above = e.clientY < (top + bottom) / 2
    const drawing = this.canvas.getCurrentDrawing()
    const names = Array.from({ length: drawing.getNumLayers() }, (_, i) => drawing.getLayerName(i))
    const index = layerDropIndex(names, name, this.nameOf(tr), above)
    // Show the line at the edge of the block, not of the row the pointer is over.
    return index === names.indexOf(name) ? null : { tr: above ? tr : end, above, index }
  }

  reorder (name: string, index: number): void {
    this.canvas.setCurrentLayer(name)
    this.canvas.setCurrentLayerPosition(index)
    this.panel.populateLayers()
  }
}
