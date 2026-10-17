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
import { LayerKeyboard } from './layerKeyboard.js'

/**
 * @typedef {{el: Element, depth: number, group: boolean, expanded: boolean}} ObjectRow an object (or group) to list
 * @typedef {{more: Element, hidden: number, depth: number}} MoreRow the "N more…" row of a truncated parent
 * @typedef {HTMLTableRowElement & {_el: Element, _depth: number}} ObjectTr the row `objectRow` builds
 * @typedef {HTMLTableRowElement & {_more: Element, _depth: number}} MoreTr the row `moreRow` builds
 * @typedef {{parent: Element, before: Node|null, mode: string, tr: Element}} DropTarget where a drag would land
 * @typedef {{tr: Element, movers: Element[], drop: DropTarget|null}} Drag a drag in progress
 */

/** Children listed per parent before "N more…". */
export const ROW_LIMIT = 200
const DRAG_THRESHOLD = 4

/**
 * The rows under `parent`, front-most first, depth first through expanded groups.
 * @param {Element} parent a layer or an expanded group
 * @param {number} depth
 * @param {{isExpanded: (el: Element) => boolean, limitOf: (el: Element) => number}} ctx
 * @param {Array<ObjectRow|MoreRow>} [out]
 * @returns {Array<ObjectRow|MoreRow>} `{el, depth, group, expanded}` per object, `{more, hidden, depth}` per truncated parent
 */
export const objectRows = (parent, depth, ctx, out = []) => {
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

const svgIcon = (/** @type {string} */ file) => {
  const span = document.createElement('span')
  span.className = 'tree-icon'
  fetchSvgEl(file).then(svg => { if (svg) span.appendChild(svg) })
  return span
}

/** The Layers panel's object tree. */
export class LayerTree {
  /** @param {EditorInstance} editor */
  constructor (editor) {
    this.editor = editor
    /** @type {Map<Element, boolean>} explicit expand / collapse of layers and groups */
    this.expanded = new Map()
    /** @type {Map<Element, number>} children shown per parent */
    this.limits = new Map()
    /** @type {WeakMap<object, number>} */
    this.ids = new WeakMap()
    this.nextId = 1
    this.sig = ''
    this.dirty = true
    this.raf = 0
    /** @type {Element|null} the last plainly clicked object, the anchor of a Shift range */
    this.anchor = null
    /** @type {Drag|null} */
    this.drag = null
    this.keyboard = new LayerKeyboard(this)
    this.observer = typeof MutationObserver === 'function' ? new MutationObserver(() => this.schedule()) : null
  }

  get canvas () { return this.editor.svgCanvas }
  get table () { return this.editor.$id('layerlist') }
  /** The layers table, which must be there. @returns {HTMLTableElement} */
  requireTable () { return this.editor.$req('layerlist') }
  /**
   * @param {string} key
   * @param {Record<string, unknown>} [opts]
   * @returns {string}
   */
  t (key, opts) { return /** @type {string} */ (this.editor.i18next.t(key, opts)) }

  /** Wire the table's events once. @returns {void} */
  attach () {
    const table = this.requireTable()
    table.addEventListener('click', (evt) => this.onClick(/** @type {MouseEvent} */ (evt)))
    table.addEventListener('dblclick', (evt) => this.onDblClick(evt))
    table.addEventListener('pointerdown', (evt) => this.onPointerDown(/** @type {PointerEvent} */ (evt)))
    this.keyboard.attach()
    this.canvas.bind('selected', (_win, /** @type {Element[]} */ elems) => this.reveal(elems))
    this.observe()
  }

  /** (Re)watch the drawing's content element, which a load replaces. @returns {void} */
  observe () {
    if (!this.observer) return
    this.observer.disconnect()
    const content = this.canvas.getSvgContent()
    if (content) this.observer.observe(content, { childList: true, subtree: true, attributes: true, attributeFilter: ['display', 'data-name'] })
  }

  /** Refresh on the next frame (many events, one refresh). @returns {void} */
  schedule () {
    this.dirty = true
    if (this.raf) return
    const run = () => { this.raf = 0; this.refresh() }
    this.raf = typeof requestAnimationFrame === 'function' ? requestAnimationFrame(run) : (setTimeout(run, 0))
  }

  /** The layer rows were rebuilt: list the objects again. @returns {void} */
  invalidate () {
    this.sig = ''
    this.dirty = true
    this.refresh()
  }

  /**
* @param {object} el
*/
  uid (el) {
    let id = this.ids.get(el)
    if (id === undefined) {
      id = this.nextId++
      this.ids.set(el, id)
    }
    return id
  }

  /**
* Layers start open (at most `ROW_LIMIT` rows each); groups start closed.
* @param {Element} el
*/
  isOpen (el) {
    return this.expanded.get(el) ?? true
  }

  /** @returns {HTMLElement[]} the layer rows, top first */
  layerRows () { return /** @type {HTMLElement[]} */ (Array.from(this.requireTable().querySelectorAll('tbody > tr.layer'))) }

  /**
* @param {Element | null} tr
*/
  layerOf (tr) {
    const name = tr?.querySelector('td.layername')?.textContent
    return name ? this.canvas.getCurrentDrawing().getLayerByName(name) : null
  }

  /** Bring the object rows up to date with the drawing. @returns {void} */
  refresh () {
    // Rebuilding would drop a name being typed; rename's finish() refreshes.
    if (this.drag || this.table?.querySelector('.objrename')) return
    const table = this.table
    if (!table || !this.dirty) return
    // Hidden tab: do it when it is shown (see RightPanel.activateTab).
    if (table.offsetParent === null) return
    this.dirty = false
    const ctx = {
      isExpanded: (/** @type {Element} */ el) => this.expanded.get(el) === true,
      limitOf: (/** @type {Element} */ el) => this.limits.get(el) ?? ROW_LIMIT
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

  /** Highlight the rows of the selected objects. @returns {void} */
  markSelection () {
    const selected = new Set(this.canvas.getSelectedElements().filter(Boolean))
    this.requireTable().querySelectorAll('tr.object').forEach((tr) => {
      tr.classList.toggle('objsel', selected.has(/** @type {ObjectTr} */ (tr)._el))
    })
    this.keyboard.mark()
  }

  /**
   * @param {Element} el
   * @returns {string}
   */
  label (el) {
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

  /**
   * @param {ObjectRow} row
   * @returns {ObjectTr}
   */
  objectRow ({ el, depth, group, expanded }) {
    const tr = /** @type {ObjectTr} */ (document.createElement('tr'))
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

  /**
   * @param {MoreRow} row
   * @returns {MoreTr}
   */
  moreRow ({ more, hidden, depth }) {
    const tr = /** @type {MoreTr} */ (document.createElement('tr'))
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

  /**
   * Make `el`'s layer current and its group the editing context, so it can be selected.
   * @param {Element} el
   * @returns {void}
   */
  enter (el) {
    const c = this.canvas
    let layer = /** @type {Element|null} */ (el.parentNode)
    while (layer && !c.isLayer(layer)) layer = /** @type {Element|null} */ (layer.parentNode)
    if (!layer) return
    const drawing = c.getCurrentDrawing()
    if (drawing.getCurrentLayer() !== layer) {
      c.leaveContext()
      const name = layer.querySelector(':scope > title')?.textContent
      if (name) c.setCurrentLayer(name)
    }
    const parent = /** @type {Element} */ (el.parentNode)
    if (parent === layer) {
      if (c.getCurrentGroup()) c.leaveContext()
    } else if (c.getCurrentGroup() !== parent) {
      c.setContext(parent)
    }
    if (c.getMode() !== 'select') c.setMode('select')
  }

  /**
   * @param {Element[]} els
   * @returns {void}
   */
  selectObjects (els) {
    const ok = els.filter((e) => !isObjectLocked(e) && !isObjectHidden(e))
    if (!ok.length) return
    this.enter(ok[0])
    this.canvas.selectOnly(ok, true)
  }

  /**
   * Siblings from `a` to `b` (document order, either way), selectable ones only.
   * @param {Element} a
   * @param {Element} b
   * @returns {Element[]}
   */
  rangeBetween (a, b) {
    const kids = Array.from(/** @type {Element} */ (a.parentNode).children).filter(isPanelObject)
    const i = kids.indexOf(a)
    const j = kids.indexOf(b)
    if (i < 0 || j < 0) return [b]
    return kids.slice(Math.min(i, j), Math.max(i, j) + 1)
  }

  // ── Events ───────────────────────────────────────────────────────────────

  /**
   * @param {MouseEvent} evt
   * @returns {void}
   */
  onClick (evt) {
    const target = /** @type {Element} */ (evt.target)
    const layerToggle = target.closest('td.layertoggle')
    if (layerToggle) {
      const layer = this.layerOf(layerToggle.parentElement)
      if (layer) this.setOpen(layer, !this.isOpen(layer))
      return
    }
    const more = /** @type {MoreTr|null} */ (target.closest('tr.objmore'))
    if (more) {
      this.limits.set(more._more, (this.limits.get(more._more) ?? ROW_LIMIT) + ROW_LIMIT)
      this.invalidate()
      return
    }
    const tr = /** @type {ObjectTr|null} */ (target.closest('tr.object'))
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

  /**
* @param {Element} el
* @param {boolean} open
*/
  setOpen (el, open) {
    this.expanded.set(el, open)
    this.invalidate()
  }

  /**
* @param {Event} evt
*/
  onDblClick (evt) {
    const label = /** @type {Element} */ (evt.target).closest('tr.object .objlabel')
    if (!label) return
    const tr = /** @type {ObjectTr} */ (label.closest('tr.object'))
    const el = tr._el
    const input = document.createElement('input')
    input.type = 'text'
    input.className = 'objrename'
    input.value = el.getAttribute('data-name') ?? ''
    input.placeholder = this.label(el)
    let done = false
    const finish = (/** @type {boolean} */ commit) => {
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
   * @param {Element} el
   * @returns {boolean|null} whether anything changed; null when `el` is in no layer
   */
  expandTo (el) {
    let changed = false
    const open = (/** @type {Element} */ node) => {
      if (this.expanded.get(node) !== true) { this.expanded.set(node, true); changed = true }
    }
    let p = /** @type {Element|null} */ (el.parentNode)
    while (p && !this.canvas.isLayer(p)) {
      open(p)
      p = /** @type {Element|null} */ (p.parentNode)
    }
    if (!p) return null
    if (!this.isOpen(p)) open(p) // a layer is open unless it was closed
    // A deep object may sit past a "N more…" cut.
    const parent = /** @type {Element} */ (el.parentNode)
    const kids = Array.from(parent.children).filter(isPanelObject)
    const fromTop = kids.length - kids.indexOf(el)
    if (fromTop > (this.limits.get(parent) ?? ROW_LIMIT)) { this.limits.set(parent, fromTop); changed = true }
    return changed
  }

  /**
   * @param {Element} el
   * @returns {ObjectTr|undefined} the row listing `el`
   */
  rowOf (el) {
    return /** @type {ObjectTr[]} */ (Array.from(this.requireTable().querySelectorAll('tr.object'))).find((r) => r._el === el)
  }

  /**
   * An object was selected on the canvas: open the rows above it and scroll its row into view.
   * Does nothing while the Layers tab is hidden (Locate Object switches to it on request).
   * @param {Element[]} elems
   * @returns {void}
   */
  reveal (elems) {
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
   * @param {Element} el
   * @returns {boolean} false when it has no row
   */
  locate (el) {
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

  /**
   * @param {PointerEvent} evt
   * @returns {void}
   */
  onPointerDown (evt) {
    if (evt.button !== 0) return
    const target = /** @type {Element} */ (evt.target)
    const tr = /** @type {ObjectTr|null} */ (target.closest('tr.object'))
    if (!tr || target.closest('td.objvis, td.objlock, .disclosure, input')) return
    const start = { x: evt.clientX, y: evt.clientY }
    const move = (/** @type {PointerEvent} */ e) => {
      if (!this.drag) {
        if (Math.hypot(e.clientX - start.x, e.clientY - start.y) < DRAG_THRESHOLD) return
        this.beginDrag(tr)
      }
      this.dragOver(e)
    }
    const end = (/** @type {{ type: string }} */ e) => {
      document.removeEventListener('pointermove', move)
      document.removeEventListener('pointerup', end)
      document.removeEventListener('keydown', key, true)
      if (this.drag) this.finishDrag(e.type === 'pointerup')
    }
    const key = (/** @type {KeyboardEvent} */ e) => { if (e.key === 'Escape') { e.stopPropagation(); end({ type: 'cancel' }) } }
    document.addEventListener('pointermove', move)
    document.addEventListener('pointerup', end)
    document.addEventListener('keydown', key, true)
  }

  /**
* @param {ObjectTr} tr
*/
  beginDrag (tr) {
    const el = tr._el
    const selected = this.canvas.getSelectedElements().filter(Boolean)
    this.drag = { tr, movers: selected.includes(el) ? selected : [el], drop: null }
    tr.classList.add('objdragging')
    this.requireTable().classList.add('tree-dragging')
  }

  /**
   * Where a drop at `y` over row `tr` would put the dragged objects.
   * @param {Element} tr
   * @param {number} y
   * @returns {DropTarget|null}
   */
  dropAt (tr, y) {
    const { drag } = this
    if (!drag) return null
    /** @type {DropTarget|null} */
    let found = null
    if (tr.classList.contains('layer')) {
      const layer = this.layerOf(tr)
      if (layer) found = { parent: layer, before: null, mode: 'into', tr }
    } else if (tr.classList.contains('object')) {
      const el = /** @type {ObjectTr} */ (tr)._el
      const box = tr.getBoundingClientRect()
      const f = (y - box.top) / (box.height || 1)
      const canEnter = isExpandableGroup(el)
      if (canEnter && f > 0.25 && f < 0.75) found = { parent: el, before: null, mode: 'into', tr }
      // Rows run front to back, so the row above is later in the document.
      else if (f < 0.5) found = { parent: /** @type {Element} */ (el.parentNode), before: el.nextSibling, mode: 'above', tr }
      else found = { parent: /** @type {Element} */ (el.parentNode), before: el, mode: 'below', tr }
    }
    if (!found) return null
    return this.canvas.objectMoveIssue(drag.movers, found.parent, found.before) ? null : found
  }

  /**
* @param {{ clientX: number; clientY: number; }} evt
*/
  dragOver (evt) {
    const { drag } = this
    if (!drag) return
    const under = document.elementFromPoint(evt.clientX, evt.clientY)
    const tr = under?.closest?.('#layerlist tr.layer, #layerlist tr.object')
    this.requireTable().querySelectorAll('.drop-above, .drop-below, .drop-into').forEach((r) =>
      r.classList.remove('drop-above', 'drop-below', 'drop-into'))
    drag.drop = tr ? this.dropAt(tr, evt.clientY) : null
    if (drag.drop) drag.drop.tr.classList.add(`drop-${drag.drop.mode}`)
  }

  /**
* @param {boolean} commit
*/
  finishDrag (commit) {
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
