/**
 * @file seDebugOverlay.js
 *
 * Dev-mode panel that surfaces internal "visibility" state which is driven
 * by display/opacity attributes rather than the live selection/document
 * model, and has a history of desyncing from it (a selection box left shown
 * for a deselected element, path-node grips left visible from a
 * previously-edited path, group-context sibling dimming not cleared on
 * leaveContext()). Polls `svgCanvas.getDebugSnapshot()` and renders three
 * sections (Selection, Group context, Path editing), highlighting any entry
 * the snapshot flags `stale: true` — visibly rendered but no longer backed
 * by the model.
 *
 * Off by default. A host enables it per editor instance via
 * `svgEditor.setDebugOverlay(true)` (see `Editor.js`), mirroring the
 * `applyTheme(theme, rootEl)` host-toggle pattern in `themeUtil.js`.
 *
 * @license MIT
 */

const POLL_MS = 400

const template = document.createElement('template')
template.innerHTML = `
  <style>
  :host {
    display: none;
    position: fixed;
    right: 12px;
    bottom: 12px;
    z-index: 10000;
    font: 11px/1.4 -apple-system, BlinkMacSystemFont, sans-serif;
  }
  :host([active]) {
    display: block;
  }
  #panel {
    width: 320px;
    max-height: 60vh;
    overflow-y: auto;
    background: var(--chrome-bg, #FFFFFF);
    border: 1px solid var(--chrome-border, #E6E8EC);
    border-radius: 10px;
    box-shadow: 0 4px 16px -2px rgba(0,0,0,0.25);
    color: var(--fg, #1B1F24);
  }
  #header {
    position: sticky;
    top: 0;
    display: flex;
    align-items: center;
    justify-content: space-between;
    padding: 6px 10px;
    background: var(--chrome-bg, #FFFFFF);
    border-bottom: 1px solid var(--chrome-border, #E6E8EC);
    font-weight: 700;
    font-size: 11.5px;
  }
  #close {
    border: none;
    background: transparent;
    color: var(--muted, #6B7280);
    cursor: pointer;
    font-size: 13px;
    line-height: 1;
    padding: 2px 4px;
  }
  #close:hover {
    color: var(--fg, #1B1F24);
  }
  section {
    padding: 8px 10px;
    border-bottom: 1px solid var(--chrome-border, #E6E8EC);
  }
  section:last-child {
    border-bottom: none;
  }
  h3 {
    margin: 0 0 4px;
    font-size: 10.5px;
    font-weight: 700;
    text-transform: uppercase;
    letter-spacing: .04em;
    color: var(--muted, #6B7280);
  }
  table {
    width: 100%;
    border-collapse: collapse;
  }
  td {
    padding: 1px 4px 1px 0;
    font-variant-numeric: tabular-nums;
    white-space: nowrap;
    overflow: hidden;
    text-overflow: ellipsis;
    max-width: 120px;
  }
  .empty {
    color: var(--muted, #6B7280);
  }
  .stale {
    color: var(--danger, #E5484D);
    font-weight: 700;
  }
  </style>
  <div id="panel">
    <div id="header">
      <span>svgedit debug</span>
      <button id="close" type="button" title="Hide debug overlay">×</button>
    </div>
    <section id="selection-section">
      <h3>Selection</h3>
      <table id="selection-table"></table>
    </section>
    <section id="group-section">
      <h3>Group context</h3>
      <table id="group-table"></table>
    </section>
    <section id="path-section">
      <h3>Path editing</h3>
      <table id="path-table"></table>
    </section>
  </div>
`

class SeDebugOverlay extends HTMLElement {
  constructor () {
    super()
    this._shadowRoot = this.attachShadow({ mode: 'open' })
    this._shadowRoot.append(template.content.cloneNode(true))
    this._svgCanvas = null
    this._pollTimer = null
    this._shadowRoot.querySelector('#close').addEventListener('click', () => {
      this.active = false
    })
  }

  /**
   * The SvgCanvas instance to poll. Must be set explicitly (rather than read
   * off a global) so each editor instance's overlay tracks its own canvas
   * when several editors are mounted at once.
   * @param {object} canvas
   */
  set svgCanvas (canvas) {
    this._svgCanvas = canvas
  }

  get svgCanvas () {
    return this._svgCanvas
  }

  get active () {
    return this.hasAttribute('active')
  }

  set active (on) {
    this.toggleAttribute('active', Boolean(on))
    if (on) {
      this._startPolling()
    } else {
      this._stopPolling()
    }
  }

  disconnectedCallback () {
    this._stopPolling()
  }

  _startPolling () {
    if (this._pollTimer) return
    this._render()
    this._pollTimer = setInterval(() => this._render(), POLL_MS)
  }

  _stopPolling () {
    if (!this._pollTimer) return
    clearInterval(this._pollTimer)
    this._pollTimer = null
  }

  _render () {
    if (!this._svgCanvas) return
    let snapshot
    try {
      snapshot = this._svgCanvas.getDebugSnapshot()
    } catch (err) {
      return
    }
    this._renderSelection(snapshot.selection)
    this._renderGroupContext(snapshot.groupContext)
    this._renderPathEditing(snapshot.pathEditing)
  }

  _row (cells, stale) {
    const tr = document.createElement('tr')
    if (stale) tr.className = 'stale'
    cells.forEach((text) => {
      const td = document.createElement('td')
      td.textContent = text
      tr.append(td)
    })
    return tr
  }

  _emptyRow (text) {
    const tr = document.createElement('tr')
    const td = document.createElement('td')
    td.className = 'empty'
    td.textContent = text
    tr.append(td)
    return tr
  }

  _renderSelection (selection) {
    const table = this._shadowRoot.querySelector('#selection-table')
    table.replaceChildren()
    if (!selection.selectors.length) {
      table.append(this._emptyRow('no selection boxes'))
      return
    }
    selection.selectors.forEach((sel) => {
      table.append(this._row(
        [sel.elemId ?? '(none)', sel.display ?? '?', sel.stale ? 'STALE' : ''],
        sel.stale
      ))
    })
  }

  _renderGroupContext (groupContext) {
    const table = this._shadowRoot.querySelector('#group-table')
    table.replaceChildren()
    table.append(this._row(
      ['group', groupContext.currentGroupId ?? '(none)'],
      false
    ))
    if (!groupContext.disabledElems.length) {
      table.append(this._emptyRow('no dimmed siblings'))
    } else {
      groupContext.disabledElems.forEach((el) => {
        table.append(this._row(
          [el.id, `opacity:${el.opacity ?? '(default)'}`, groupContext.stale ? 'STALE' : ''],
          groupContext.stale
        ))
      })
    }
  }

  _renderPathEditing (pathEditing) {
    const table = this._shadowRoot.querySelector('#path-table')
    table.replaceChildren()
    table.append(this._row(
      ['path', pathEditing.pathElemId ?? '(none)', `segs:${pathEditing.segCount}`],
      false
    ))
    const visibleGrips = pathEditing.grips.filter((g) => g.display === 'inline')
    if (!visibleGrips.length) {
      table.append(this._emptyRow('no visible grips'))
      return
    }
    visibleGrips.forEach((grip) => {
      table.append(this._row(
        [grip.kind, String(grip.index), grip.stale ? 'STALE' : ''],
        grip.stale
      ))
    })
  }
}

customElements.define('se-debug-overlay', SeDebugOverlay)
