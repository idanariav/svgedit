/**
 * Object rows of the Layers panel: under each expanded layer, a row per object
 * and group (groups expand), with an eye (hide), a lock, the name (double-click
 * renames), the selection highlight, and drag to reorder or move into another
 * layer or group.
 *
 * The rows live in the same `#layerlist` table as the layer rows (`tr.layer`),
 * as `tr.object` / `tr.objmore` rows after their layer's row, listed front-most
 * first like the layers. `RightPanel.populateLayers` owns the layer rows (and
 * clears the selection, so it is for structural layer changes only); this class
 * only adds and removes the object rows and never touches the selection except
 * when the user clicks a row.
 *
 * Refreshing is cheap by construction: only expanded subtrees are listed (at
 * most `ROW_LIMIT` children per parent, "N more…" for the rest), the model is
 * compared with the last one so an unchanged tree touches no DOM, and nothing
 * is done while the Layers tab is hidden (it refreshes when shown).
 * @module layerTree
 * @license MIT
 */

import {
  isPanelObject, isExpandableGroup, isObjectLocked, isObjectHidden, hasLockMark
} from '@svgedit/svgcanvas/core/object-state.ts'
import { fetchSvgEl } from '../components/svgIconLoader.js'
import { LayerKeyboard } from './layerKeyboard.ts'

/** an object (or group) to list */
export type ObjectRow = { el: Element, depth: number, group: boolean, expanded: boolean }
/** the "N more…" row of a truncated parent */
export type MoreRow = { more: Element, hidden: number, depth: number }
/** the row `objectRow` builds */
export type ObjectTr = HTMLTableRowElement & { _el: Element, _depth: number }
/** the row `moreRow` builds */
export type MoreTr = HTMLTableRowElement & { _more: Element, _depth: number }
/** where a drag would land */
export type DropTarget = { parent: Element, before: Node | null, mode: string, tr: Element }
/** a drag in progress */
export type Drag = { tr: Element, movers: Element[], drop: DropTarget | null }

/** Children listed per parent before "N more…". */
export const ROW_LIMIT = 200
const DRAG_THRESHOLD = 4

/**
 * The rows under `parent`, front-most first, depth first through expanded groups.
 * @param parent a layer or an expanded group
 * @returns `{el, depth, group, expanded}` per object, `{more, hidden, depth}` per truncated parent
 */
export const objectRows = (parent: Element, depth: number, ctx: { isExpanded: (el: Element) => boolean, limitOf: (el: Element) => number }, out: Array<ObjectRow | MoreRow> = []): Array<ObjectRow | MoreRow> => {
  const kids = Array.from(parent.children).filter(isPanelObject).reverse()
  const limit = ctx.limitOf(parent)
  for (const el of kids.slice(0, limit)) {
    const group = isExpandableGroup(el) && el.children.length > 0
    const expanded = group && ctx.isExpanded(el)
    out.push({ el, depth, group, expanded })
    if (expanded) objectRows(el, depth + 1, ctx, out)
  }
  if (kids.length > limit) out.push({ more: parent, hidden: kids.length - limit, depth })
  return out
}

const svgIcon = (file: string) => {
  const span = document.createElement('span')
  span.className = 'tree-icon'
  fetchSvgEl(file).then(svg => { if (svg) span.appendChild(svg) })
  return span
}

/** The Layers panel's object tree. */
export class LayerTree {
  editor: EditorInstance
  expanded: Map<Element, boolean>
  limits: Map<Element, number>
  ids: WeakMap<object, number>
  nextId: number
  sig: string
  dirty: boolean
  raf: number
  anchor: Element | null
  drag: Drag | null
  keyboard: LayerKeyboard
  observer: MutationObserver | null

  constructor (editor: EditorInstance) {
    this.editor = editor
    /** explicit expand / collapse of layers and groups */
    this.expanded = new Map()
    /** children shown per parent */
    this.limits = new Map()
    this.ids = new WeakMap()
    this.nextId = 1
    this.sig = ''
    this.dirty = true
    this.raf = 0
    /** the last plainly clicked object, the anchor of a Shift range */
    this.anchor = null
    this.drag = null
    this.keyboard = new LayerKeyboard(this)
    this.observer = typeof MutationObserver === 'function' ? new MutationObserver(() => this.schedule()) : null
  }

  get canvas () { return this.editor.svgCanvas }
  get table () { return this.editor.$id('layerlist') }
  /** The layers table, which must be there. */
  requireTable (): HTMLTableElement { return this.editor.$req('layerlist') }
  t (key: string, opts?: Record<string, unknown>): string { return (this.editor.i18next.t(key, opts) as string) }

  /** Wire the table's events once. */
  attach (): void {
    const table = this.requireTable()
    table.addEventListener('click', (evt) => this.onClick((evt as MouseEvent)))
    table.addEventListener('dblclick', (evt) => this.onDblClick(evt))
    table.addEventListener('pointerdown', (evt) => this.onPointerDown((evt as PointerEvent)))
    this.keyboard.attach()
    this.canvas.bind('selected', (_win, elems: Element[]) => this.reveal(elems))
    this.observe()
  }

  /** (Re)watch the drawing's content element, which a load replaces. */
  observe (): void {
    if (!this.observer) return
    this.observer.disconnect()
    const content = this.canvas.getSvgContent()
    if (content) this.observer.observe(content, { childList: true, subtree: true, attributes: true, attributeFilter: ['display', 'data-name'] })
  }

  /** Refresh on the next frame (many events, one refresh). */
  schedule (): void {
    this.dirty = true
    if (this.raf) return
    const run = () => { this.raf = 0; this.refresh() }
    this.raf = typeof requestAnimationFrame === 'function' ? requestAnimationFrame(run) : (setTimeout(run, 0))
  }

  /** The layer rows were rebuilt: list the objects again. */
  invalidate (): void {
    this.sig = ''
    this.dirty = true
    this.refresh()
  }

  uid (el: object) {
    let id = this.ids.get(el)
    if (id === undefined) {
      id = this.nextId++
      this.ids.set(el, id)
    }
    return id
  }

  /** Layers start open (at most `ROW_LIMIT` rows each); groups start closed. */
  isOpen (el: Element) {
    return this.expanded.get(el) ?? true
  }

  /** @returns the layer rows, top first */
  layerRows (): HTMLElement[] { return (Array.from(this.requireTable().querySelectorAll('tbody > tr.layer')) as HTMLElement[]) }

  layerOf (tr: Element | null) {
    const name = tr?.querySelector('td.layername')?.textContent
    return name ? this.canvas.getCurrentDrawing().getLayerByName(name) : null
  }

  /** Bring the object rows up to date with the drawing. */
  refresh (): void {
    // Rebuilding would drop a name being typed; rename's finish() refreshes.
    if (this.drag || this.table?.querySelector('.objrename')) return
    const table = this.table
    if (!table || !this.dirty) return
    // Hidden tab: do it when it is shown (see RightPanel.activateTab).
    if (table.offsetParent === null) return
    this.dirty = false
    const ctx = {
      isExpanded: (el: Element) => this.expanded.get(el) === true,
      limitOf: (el: Element) => this.limits.get(el) ?? ROW_LIMIT
    }
    const plan = this.layerRows().map((tr) => {
      const layer = this.layerOf(tr)
      const open = !!layer && this.isOpen(layer)
      const rows = open ? objectRows(layer, 0, ctx) : []
      return { tr, layer, open, rows }
    })
    const sig = plan.map(({ layer, open, rows }) =>
      `${layer ? this.uid(layer) : '-'}${open ? '+' : '.'}` + rows.map((r) => 'more' in r
        ? `M${r.hidden}`
        : `${this.uid(r.el)}:${r.depth}${r.group ? 'g' : ''}${r.expanded ? '+' : ''}${isObjectHidden(r.el) ? 'h' : ''}${hasLockMark(r.el) ? 'l' : ''}${isObjectLocked(r.el) ? 'L' : ''}:${r.el.getAttribute('data-name') ?? ''}`
      ).join(',')
    ).join('|')
    if (sig !== this.sig) {
      this.sig = sig
      table.querySelectorAll('tr.object, tr.objmore').forEach((tr) => tr.remove())
      for (const { tr, layer, open, rows } of plan) {
        tr.querySelector('td.layertoggle')?.classList.toggle('open', open)
        if (!layer) continue
        const frag = document.createDocumentFragment()
        for (const row of rows) frag.appendChild('more' in row ? this.moreRow(row) : this.objectRow(row))
        tr.after(frag)
      }
    }
    this.markSelection()
  }

  /** Highlight the rows of the selected objects. */
  markSelection (): void {
    const selected = new Set(this.canvas.getSelectedElements().filter(Boolean))
    this.requireTable().querySelectorAll('tr.object').forEach((tr) => {
      tr.classList.toggle('objsel', selected.has((tr as ObjectTr)._el))
    })
    this.keyboard.mark()
  }

  label (el: Element): string {
    const named = el.getAttribute('data-name')
    if (named) return named
    switch (el.tagName) {
      case 'g': case 'a': return this.t('layers.obj_group')
      case 'rect': return this.t('layers.obj_rect')
      case 'ellipse': case 'circle': return this.t('layers.obj_ellipse')
      case 'line': return this.t('layers.obj_line')
      case 'path': return this.t('layers.obj_path')
      case 'polygon': case 'polyline': return this.t('layers.obj_polygon')
      case 'text': return this.t('layers.obj_text')
      case 'image': return this.t('layers.obj_image')
      default: return el.tagName
    }
  }

  objectRow ({ el, depth, group, expanded }: ObjectRow): ObjectTr {
    const tr = document.createElement('tr') as ObjectTr
    tr._el = el
    tr._depth = depth
    const hidden = isObjectHidden(el)
    const locked = hasLockMark(el)
    tr.className = 'object' + (isObjectLocked(el) ? ' objlockedtree' : '') + (hidden ? ' objhidden' : '')
    tr.setAttribute('role', 'row')
    if (group) tr.setAttribute('aria-expanded', String(expanded))

    const lead = document.createElement('td')
    lead.className = 'objlead'

    const vis = document.createElement('td')
    vis.className = 'objvis' + (hidden ? ' objinvis' : '')
    vis.title = this.t(hidden ? 'layers.obj_show' : 'layers.obj_hide')
    vis.appendChild(svgIcon('eye.svg'))

    const lock = document.createElement('td')
    lock.className = 'objlock' + (locked ? ' locked' : '')
    lock.title = this.t(locked ? 'layers.obj_unlock' : 'layers.obj_lock')
    lock.appendChild(svgIcon(locked ? 'lock.svg' : 'lock_open.svg'))

    const name = document.createElement('td')
    name.className = 'objname'
    name.colSpan = 3
    name.style.paddingLeft = `${4 + depth * 14}px`
    const disclosure = document.createElement('span')
    disclosure.className = 'disclosure' + (group ? (expanded ? ' open' : ' closed') : ' none')
    const label = document.createElement('span')
    label.className = 'objlabel'
    label.textContent = this.label(el)
    label.title = label.textContent
    name.append(disclosure, label)

    tr.append(lead, vis, lock, name)
    return tr
  }

  moreRow ({ more, hidden, depth }: MoreRow): MoreTr {
    const tr = document.createElement('tr') as MoreTr
    tr.className = 'objmore'
    tr._more = more
    tr._depth = depth
    const td = document.createElement('td')
    td.colSpan = 6
    td.style.paddingLeft = `${30 + depth * 14}px`
    td.textContent = this.t('layers.show_more', { count: hidden })
    tr.appendChild(td)
    return tr
  }

  // ── Selection ────────────────────────────────────────────────────────────

  /** Make `el`'s layer current and its group the editing context, so it can be selected. */
  enter (el: Element): void {
    const c = this.canvas
    let layer = el.parentNode as Element | null
    while (layer && !c.isLayer(layer)) layer = (layer.parentNode as Element | null)
    if (!layer) return
    const drawing = c.getCurrentDrawing()
    if (drawing.getCurrentLayer() !== layer) {
      c.leaveContext()
      const name = layer.querySelector(':scope > title')?.textContent
      if (name) c.setCurrentLayer(name)
    }
    const parent = el.parentNode as Element
    if (parent === layer) {
      if (c.getCurrentGroup()) c.leaveContext()
    } else if (c.getCurrentGroup() !== parent) {
      c.setContext(parent)
    }
    if (c.getMode() !== 'select') c.setMode('select')
  }

  selectObjects (els: Element[]): void {
    const ok = els.filter((e) => !isObjectLocked(e) && !isObjectHidden(e))
    if (!ok.length) return
    this.enter(ok[0])
    this.canvas.selectOnly(ok, true)
  }

  /** Siblings from `a` to `b` (document order, either way), selectable ones only. */
  rangeBetween (a: Element, b: Element): Element[] {
    const kids = Array.from((a.parentNode as Element).children).filter(isPanelObject)
    const i = kids.indexOf(a)
    const j = kids.indexOf(b)
    if (i < 0 || j < 0) return [b]
    return kids.slice(Math.min(i, j), Math.max(i, j) + 1)
  }

  // ── Events ───────────────────────────────────────────────────────────────

  onClick (evt: MouseEvent): void {
    const target = evt.target as Element
    const layerToggle = target.closest('td.layertoggle')
    if (layerToggle) {
      const layer = this.layerOf(layerToggle.parentElement)
      if (layer) this.setOpen(layer, !this.isOpen(layer))
      return
    }
    const more = target.closest('tr.objmore') as MoreTr | null
    if (more) {
      this.limits.set(more._more, (this.limits.get(more._more) ?? ROW_LIMIT) + ROW_LIMIT)
      this.invalidate()
      return
    }
    const tr = target.closest('tr.object') as ObjectTr | null
    if (!tr || target.closest('input')) return
    const el = tr._el
    const c = this.canvas
    if (target.closest('td.objvis')) {
      c.setObjectsHidden([el], !isObjectHidden(el))
      this.invalidate()
      return
    }
    if (target.closest('td.objlock')) {
      c.setObjectsLocked([el], !hasLockMark(el))
      this.invalidate()
      return
    }
    if (target.closest('.disclosure.open, .disclosure.closed')) {
      this.setOpen(el, !this.expanded.get(el))
      return
    }
    // The second click of a double-click (rename) must not re-select: that churn steals the new field's focus.
    if (evt.detail > 1) return
    if (evt.shiftKey && this.anchor && this.anchor.parentNode === el.parentNode) {
      this.selectObjects(this.rangeBetween(this.anchor, el))
    } else if (evt.metaKey || evt.ctrlKey) {
      const current = c.getSelectedElements().filter(Boolean)
      const same = current.every((s) => s.parentNode === el.parentNode)
      const next = !same ? [el] : current.includes(el) ? current.filter((s) => s !== el) : [...current, el]
      if (next.length) this.selectObjects(next)
      else c.clearSelection()
      this.anchor = el
    } else {
      this.selectObjects([el])
      this.anchor = el
    }
    this.markSelection()
  }

  setOpen (el: Element, open: boolean) {
    this.expanded.set(el, open)
    this.invalidate()
  }

  onDblClick (evt: Event) {
    const label = (evt.target as Element).closest('tr.object .objlabel')
    if (!label) return
    const tr = label.closest('tr.object') as ObjectTr
    const el = tr._el
    const input = document.createElement('input')
    input.type = 'text'
    input.className = 'objrename'
    input.value = el.getAttribute('data-name') ?? ''
    input.placeholder = this.label(el)
    let done = false
    const finish = (commit: boolean) => {
      if (done) return
      done = true
      if (commit) this.canvas.setObjectName(el, input.value)
      input.remove()
      this.invalidate()
    }
    input.addEventListener('keydown', (e) => {
      e.stopPropagation()
      if (e.key === 'Enter') finish(true)
      else if (e.key === 'Escape') finish(false)
    })
    input.addEventListener('blur', () => finish(true))
    label.replaceWith(input)
    input.focus()
    input.select()
  }

  /**
   * Open the layer and the groups above `el`, and widen a "N more…" cut that hides it.
 * @returns whether anything changed; null when `el` is in no layer
   */
  expandTo (el: Element): boolean | null {
    let changed = false
    const open = (node: Element) => {
      if (this.expanded.get(node) !== true) { this.expanded.set(node, true); changed = true }
    }
    let p = el.parentNode as Element | null
    while (p && !this.canvas.isLayer(p)) {
      open(p)
      p = (p.parentNode as Element | null)
    }
    if (!p) return null
    if (!this.isOpen(p)) open(p) // a layer is open unless it was closed
    // A deep object may sit past a "N more…" cut.
    const parent = el.parentNode as Element
    const kids = Array.from(parent.children).filter(isPanelObject)
    const fromTop = kids.length - kids.indexOf(el)
    if (fromTop > (this.limits.get(parent) ?? ROW_LIMIT)) { this.limits.set(parent, fromTop); changed = true }
    return changed
  }

  /** @returns the row listing `el` */
  rowOf (el: Element): ObjectTr | undefined {
    return (Array.from(this.requireTable().querySelectorAll('tr.object')) as ObjectTr[]).find((r) => r._el === el)
  }

  /**
   * An object was selected on the canvas: open the rows above it and scroll its row into view.
   * Does nothing while the Layers tab is hidden (Locate Object switches to it on request).
   */
  reveal (elems: Element[]): void {
    const el = (elems ?? []).filter(Boolean)[0]
    if (!el || !isPanelObject(el) || this.requireTable().offsetParent === null) return
    if (this.expandTo(el)) this.invalidate()
    else this.markSelection()
    const tr = this.rowOf(el)
    tr?.scrollIntoView?.({ block: 'nearest' })
  }

  /**
   * Show the row of `el`: open the layer and groups above it, switch to the
   * Layers tab, scroll the row into view and flash it.
 * @returns false when it has no row
   */
  locate (el: Element): boolean {
    if (!el || !isPanelObject(el)) return false
    if (this.expandTo(el) === null) return false
    this.editor.rightPanel.activateTab('layers')
    this.dirty = true
    this.refresh()
    const tr = this.rowOf(el)
    if (!tr) return false
    tr.scrollIntoView?.({ block: 'nearest' })
    tr.classList.add('objflash')
    setTimeout(() => tr.classList.remove('objflash'), 900)
    return true
  }

  // ── Drag to reorder / re-parent ──────────────────────────────────────────

  onPointerDown (evt: PointerEvent): void {
    if (evt.button !== 0) return
    const target = evt.target as Element
    const tr = target.closest('tr.object') as ObjectTr | null
    if (!tr || target.closest('td.objvis, td.objlock, .disclosure, input')) return
    const start = { x: evt.clientX, y: evt.clientY }
    const move = (e: PointerEvent) => {
      if (!this.drag) {
        if (Math.hypot(e.clientX - start.x, e.clientY - start.y) < DRAG_THRESHOLD) return
        this.beginDrag(tr)
      }
      this.dragOver(e)
    }
    const end = (e: { type: string }) => {
      document.removeEventListener('pointermove', move)
      document.removeEventListener('pointerup', end)
      document.removeEventListener('keydown', key, true)
      if (this.drag) this.finishDrag(e.type === 'pointerup')
    }
    const key = (e: KeyboardEvent) => { if (e.key === 'Escape') { e.stopPropagation(); end({ type: 'cancel' }) } }
    document.addEventListener('pointermove', move)
    document.addEventListener('pointerup', end)
    document.addEventListener('keydown', key, true)
  }

  beginDrag (tr: ObjectTr) {
    const el = tr._el
    const selected = this.canvas.getSelectedElements().filter(Boolean)
    this.drag = { tr, movers: selected.includes(el) ? selected : [el], drop: null }
    tr.classList.add('objdragging')
    this.requireTable().classList.add('tree-dragging')
  }

  /** Where a drop at `y` over row `tr` would put the dragged objects. */
  dropAt (tr: Element, y: number): DropTarget | null {
    const { drag } = this
    if (!drag) return null
    let found: DropTarget | null = null
    if (tr.classList.contains('layer')) {
      const layer = this.layerOf(tr)
      if (layer) found = { parent: layer, before: null, mode: 'into', tr }
    } else if (tr.classList.contains('object')) {
      const el = (tr as ObjectTr)._el
      const box = tr.getBoundingClientRect()
      const f = (y - box.top) / (box.height || 1)
      const canEnter = isExpandableGroup(el)
      if (canEnter && f > 0.25 && f < 0.75) found = { parent: el, before: null, mode: 'into', tr }
      // Rows run front to back, so the row above is later in the document.
      else if (f < 0.5) found = { parent: (el.parentNode as Element), before: el.nextSibling, mode: 'above', tr }
      else found = { parent: (el.parentNode as Element), before: el, mode: 'below', tr }
    }
    if (!found) return null
    return this.canvas.objectMoveIssue(drag.movers, found.parent, found.before) ? null : found
  }

  dragOver (evt: { clientX: number; clientY: number; }) {
    const { drag } = this
    if (!drag) return
    const under = document.elementFromPoint(evt.clientX, evt.clientY)
    const tr = under?.closest?.('#layerlist tr.layer, #layerlist tr.object')
    this.requireTable().querySelectorAll('.drop-above, .drop-below, .drop-into').forEach((r) =>
      r.classList.remove('drop-above', 'drop-below', 'drop-into'))
    drag.drop = tr ? this.dropAt(tr, evt.clientY) : null
    if (drag.drop) drag.drop.tr.classList.add(`drop-${drag.drop.mode}`)
  }

  finishDrag (commit: boolean) {
    if (!this.drag) return
    const { drop, movers, tr } = this.drag
    this.drag = null
    tr.classList.remove('objdragging')
    const table = this.requireTable()
    table.classList.remove('tree-dragging')
    table.querySelectorAll('.drop-above, .drop-below, .drop-into').forEach((r) =>
      r.classList.remove('drop-above', 'drop-below', 'drop-into'))
    if (commit && drop && this.canvas.moveObjects(movers, drop.parent, drop.before)) {
      this.expanded.set(drop.parent, true)
      this.selectObjects(movers)
    }
    this.invalidate()
  }
}
