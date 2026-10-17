// @ts-check
/**
 * layerKeyboard.js — keyboard access to the Layers panel (the layer rows and the object tree under
 * them, see layerTree.js). The table is one tab stop; an "active row" moves with the arrow keys
 * (WAI-ARIA tree-grid style) and Enter / Space act on it like a click would:
 *
 *   ↑ ↓ Home End   move the active row            → expands, ← collapses (or goes to the parent row)
 *   Enter / Space  select the layer or object      (Shift extends a range, Ctrl / Cmd toggles)
 *   F2             rename                          H / L   show-hide / lock-unlock
 *   Alt + ↑ ↓      move the layer or object up / down in the stacking order
 *
 * Handled keys stop at the table, so the editor's own shortcuts (arrows nudge the selection) don't also fire.
 * @module layerKeyboard
 */

import { isPanelObject } from '@svgedit/svgcanvas/core/object-state.ts'

export interface NavRow {
  /** 1 for a layer, deeper for objects */
  level: number
  /** a layer or a group */
  expandable: boolean
  open: boolean
}

/**
 * What a navigation key does, given the visible rows and the active one.
 * @param i the active row
 * @param key a `KeyboardEvent.key`
 */
export const planNav = (rows: NavRow[], i: number, key: string): { focus: number } | { open: number } | { close: number } | null => {
  const row = rows[i]
  if (!row) return rows.length ? { focus: 0 } : null
  switch (key) {
    case 'ArrowDown': return i < rows.length - 1 ? { focus: i + 1 } : null
    case 'ArrowUp': return i > 0 ? { focus: i - 1 } : null
    case 'Home': return i > 0 ? { focus: 0 } : null
    case 'End': return i < rows.length - 1 ? { focus: rows.length - 1 } : null
    case 'ArrowRight':
      if (!row.expandable) return null
      if (!row.open) return { open: i }
      return rows[i + 1] && rows[i + 1].level > row.level ? { focus: i + 1 } : null
    case 'ArrowLeft': {
      if (row.expandable && row.open) return { close: i }
      for (let j = i - 1; j >= 0; j--) if (rows[j].level < row.level) return { focus: j }
      return null
    }
    default: return null
  }
}

const ROW_SELECTOR = 'tbody > tr.layer, tbody > tr.object, tbody > tr.objmore'

export class LayerKeyboard {
  tree: any
  active: any

  /** @param tree the LayerTree this drives */
  constructor (tree: unknown) {
    this.tree = tree
    /** the active row's layer / object element, or `{more: parent}` for a "N more…" row */
    this.active = null
  }

  /** Make the table focusable and wire its events once. */
  attach (): void {
    const table = this.tree.table
    table.setAttribute('tabindex', '0')
    table.setAttribute('role', 'treegrid')
    table.addEventListener('keydown', (evt: KeyboardEvent) => this.onKeyDown(evt))
    table.addEventListener('focus', () => this.onFocus())
    // A click moves the keyboard's place too.
    table.addEventListener('click', (evt: MouseEvent) => {
      const tr = (evt.target as Element).closest?.('tr.layer, tr.object, tr.objmore')
      if (tr) this.active = this.keyOf(tr)
      this.mark()
    }, true)
  }

  /** @returns the rows in display order (with the tree's `_el` / `_more` / `_depth` fields) */
  rows (): any[] { return Array.from(this.tree.table.querySelectorAll(ROW_SELECTOR)) }

  keyOf (tr: any): any {
    if (tr.classList.contains('objmore')) return { more: tr._more }
    return tr.classList.contains('layer') ? this.tree.layerOf(tr) : tr._el
  }

  describe (tr: any): NavRow {
    const tree = this.tree
    if (tr.classList.contains('layer')) {
      const layer = tree.layerOf(tr)
      return { level: 1, expandable: true, open: !!layer && tree.isOpen(layer) }
    }
    const level = 2 + (tr._depth ?? 0)
    if (tr.classList.contains('objmore')) return { level, expandable: false, open: false }
    const group = tr.getAttribute('aria-expanded') !== null
    return { level, expandable: group, open: group && tree.expanded.get(tr._el) === true }
  }

  /** @returns index of the active row, -1 when it has none */
  indexOfActive (rows: unknown[]): number {
    const a = this.active
    if (!a) return -1
    return rows.findIndex((tr) => {
      const k = this.keyOf(tr)
      return a.more ? k?.more === a.more : k === a
    })
  }

  /** Focus arrived: start from the selected object, else the current layer. */
  onFocus (): void {
    const rows = this.rows()
    if (this.indexOfActive(rows) >= 0) { this.mark(); return }
    const selected = this.tree.canvas.getSelectedElements().filter(Boolean)[0]
    const tr = rows.find((r) => r._el && r._el === selected) ?? rows.find((r) => r.classList.contains('layersel')) ?? rows[0]
    this.active = tr ? this.keyOf(tr) : null
    this.mark()
  }

  /** Show the active row (the tree calls this after it rebuilds). */
  mark (): void {
    const rows = this.rows()
    const at = this.indexOfActive(rows)
    rows.forEach((tr, i) => {
      tr.classList.toggle('kbfocus', i === at)
      tr.setAttribute('aria-level', String(this.describe(tr).level))
      if (tr.classList.contains('layer')) tr.setAttribute('aria-selected', String(tr.classList.contains('layersel')))
      else if (tr.classList.contains('object')) tr.setAttribute('aria-selected', String(tr.classList.contains('objsel')))
    })
    if (at >= 0 && this.tree.table.contains(document.activeElement)) rows[at].scrollIntoView?.({ block: 'nearest' })
  }

  onKeyDown (evt: KeyboardEvent): void {
    const tree = this.tree
    if ((evt.target as Element).closest?.('input')) return // a rename field has its own keys
    const rows = this.rows()
    let i = this.indexOfActive(rows)
    if (i < 0) { this.onFocus(); i = this.indexOfActive(rows) }
    const tr = rows[i]
    if (!tr) return
    const handled = () => { evt.preventDefault(); evt.stopPropagation() }

    if (evt.altKey && (evt.key === 'ArrowUp' || evt.key === 'ArrowDown')) {
      handled()
      this.reorder(tr, evt.key === 'ArrowUp')
      return
    }
    if (evt.ctrlKey || evt.metaKey || evt.altKey) {
      // Ctrl / Cmd + Enter or Space still toggles; every other combination belongs to the editor.
      if (!(evt.key === 'Enter' || evt.key === ' ') || evt.altKey) return
    }

    const plan = planNav(rows.map((r) => this.describe(r)), i, evt.key)
    if (plan) {
      handled()
      if ('focus' in plan) {
        this.active = this.keyOf(rows[plan.focus])
        // Shift + arrow extends the range of objects among siblings.
        if (evt.shiftKey && rows[plan.focus]._el && tr._el && rows[plan.focus]._el.parentNode === tr._el.parentNode) {
          tree.selectObjects(tree.rangeBetween(tree.anchor ?? tr._el, rows[plan.focus]._el))
          tree.anchor ??= tr._el
          tree.markSelection()
        }
        this.mark()
      } else {
        const el = this.keyOf(rows['open' in plan ? plan.open : plan.close])
        tree.setOpen(el, 'open' in plan)
      }
      return
    }

    switch (evt.key) {
      case 'Enter':
      case ' ':
        handled()
        this.activate(tr, evt)
        break
      case 'F2':
        handled()
        this.rename(tr)
        break
      case 'h':
      case 'H':
      case 'l':
      case 'L':
        if (evt.shiftKey) return
        handled()
        this.toggle(tr, evt.key.toLowerCase() === 'h' ? 'vis' : 'lock')
        break
      default:
    }
  }

  /** Selecting can move the keyboard focus to the canvas; keep it in the panel. */
  focusTable (): void {
    const table = this.tree.table
    if (!table.contains(document.activeElement)) table.focus({ preventScroll: true })
  }

  /** Select the row's layer or object, as a click would. */
  activate (tr: any, mods: any = {}): void {
    if (tr.classList.contains('layer')) {
      tr.querySelector('td.layername')?.click() // RightPanel makes it the current layer
    } else {
      const target = tr.classList.contains('objmore') ? tr : tr.querySelector('td.objname')
      this.tree.onClick({ target, shiftKey: !!mods.shiftKey, metaKey: !!mods.metaKey, ctrlKey: !!mods.ctrlKey, detail: 1 })
    }
    this.focusTable()
    this.mark()
  }

  toggle (tr: any, what: 'vis' | 'lock'): void {
    if (tr.classList.contains('layer')) {
      tr.querySelector(what === 'vis' ? 'td.layervis' : 'td.layerlock')?.click()
    } else if (tr.classList.contains('object')) {
      this.tree.onClick({ target: tr.querySelector(what === 'vis' ? 'td.objvis' : 'td.objlock'), detail: 1 })
    }
    this.focusTable()
  }

  rename (tr: any): void {
    if (tr.classList.contains('layer')) {
      this.activate(tr)
      this.tree.editor.rightPanel.layerRename()
    } else if (tr.classList.contains('object')) {
      this.tree.onDblClick({ target: tr.querySelector('.objlabel') })
    }
  }

  /** Move a layer or object one place up / down the stacking order. */
  reorder (tr: any, up: boolean): void {
    const tree = this.tree
    if (tr.classList.contains('layer')) {
      this.activate(tr)
      tree.editor.rightPanel.moveLayer(up ? -1 : 1)
    } else if (tr.classList.contains('object')) {
      // The rows run front to back: "up" is later in the document, past the next object.
      const el = tr._el
      const siblings = Array.from(el.parentNode.children as HTMLCollection).filter(isPanelObject)
      const neighbour = siblings[siblings.indexOf(el) + (up ? 1 : -1)]
      if (neighbour && tree.canvas.moveObjects([el], el.parentNode, up ? neighbour.nextSibling : neighbour)) {
        tree.selectObjects([el])
      }
    }
    this.focusTable()
    this.mark()
  }
}
