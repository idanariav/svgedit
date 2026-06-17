import tabletShellHTML from './TabletShell.html'
import { fetchSvgEl } from '../components/svgIconLoader.js'

// Preset palette for the lightweight swatch popovers (custom colors go through
// the existing seColorPicker via the "More…" entry).
const PRESET_COLORS = [
  '#000000', '#FFFFFF', '#E11D48', '#F59E0B',
  '#FACC15', '#22C55E', '#2563EB', '#7C3AED', 'none'
]

// Command-bar tools, in order. `null` is a tray separator. Each entry is
// [mode, iconFile, label]; every mode already exists on the canvas (built-in or
// provided by a default extension). The Shapes flyout is inserted between
// `line` and `text`.
const TOOLS = [
  ['select', 'select.svg', 'Select'],
  null,
  ['fhpath', 'pencil.svg', 'Draw'],
  ['path', 'pen.svg', 'Pen'],
  ['curvature', 'curvature.svg', 'Curvature'],
  null,
  ['line', 'line_tool.svg', 'Line']
]

const SHAPES = [
  ['rect', 'rect.svg', 'Rectangle'],
  ['square', 'square.svg', 'Square'],
  ['ellipse', 'ellipse.svg', 'Ellipse'],
  ['circle', 'circle.svg', 'Circle'],
  ['star', 'star.svg', 'Star'],
  ['polygon', 'polygon.svg', 'Polygon']
]
const SHAPE_MODES = new Set(SHAPES.map((s) => s[0]))

/**
 * The touch-first tablet shell: a slim command bar + a contextual bottom sheet
 * layered over the same `#workarea`. Every control resolves to an existing
 * `svgCanvas.*` / `editor.*` call — no engine changes. Shown only while
 * `.svg_editor` carries the `ui-tablet` class (see uiMode.js).
 */
class TabletShell {
  /** @param {PlainObject} editor svgedit handler */
  constructor (editor) {
    this.editor = editor
    this.currentShape = 'rect'
    this.toolBtns = {}
    this.selectedElems = []
    this._pop = null
    this._onDoc = null
  }

  get svgCanvas () { return this.editor.svgCanvas }
  get imgPath () { return this.editor.configObj.curConfig.imgPath }

  /** @returns {void} */
  init () {
    const { $id } = this.editor // container-scoped lookups (see EditorStartup constructor)
    const tpl = document.createElement('template')
    tpl.innerHTML = tabletShellHTML
    this.editor.$svgEditor.append(tpl.content.cloneNode(true))

    this.shell = this.editor.$svgEditor.querySelector('.tablet-shell')
    this.sheet = $id('ts_sheet')
    this.sheetRow = $id('ts_sheet_row')

    this.buildToolgroup()
    this.buildRightControls()

    // Sheet close
    const close = this.makeBtn('cancel.svg', { cls: 'sm', tap: () => this.svgCanvas.clearSelection() })
    $id('ts_sheet_close').append(close)

    this.bindEvents()
    this.paintStyleDot()
    this.syncTools(this.svgCanvas.getMode())
  }

  /* ─────────────────── small DOM helpers ─────────────────── */

  async setIcon (elem, iconFile) {
    const svg = await fetchSvgEl(`${this.imgPath}/${iconFile}`)
    if (svg) { elem.replaceChildren(svg) }
  }

  el (tag, cls, html) {
    const e = document.createElement(tag)
    if (cls) e.className = cls
    if (html != null) e.innerHTML = html
    return e
  }

  makeBtn (iconFile, { cls, title, tap } = {}) {
    const b = this.el('button', 'tbtn' + (cls ? ' ' + cls : ''))
    b.type = 'button'
    if (title) b.title = title
    if (iconFile) this.setIcon(b, iconFile)
    if (tap) b.addEventListener('click', (e) => { e.stopPropagation(); tap(b, e) })
    return b
  }

  /* ─────────────────── command bar ─────────────────── */

  buildToolgroup () {
    const { $id } = this.editor // container-scoped lookups (see EditorStartup constructor)
    const tg = $id('ts_toolgroup')
    const sep = () => tg.append(this.el('div', 'ts-sep'))

    TOOLS.forEach((t) => {
      if (!t) { sep(); return }
      const [mode, icon, label] = t
      const b = this.makeBtn(icon, { title: label, tap: () => this.selectTool(mode) })
      b.classList.add('ts-tool-' + mode)
      this.toolBtns[mode] = b
      tg.append(b)
    })

    // Combined shape selector (rect / square / ellipse / circle / star / polygon)
    this.shapesBtn = this.makeBtn(this.shapeIcon(), { title: 'Shapes' })
    this.shapesBtn.classList.add('has-caret')
    this.shapesBtn.addEventListener('click', (e) => {
      e.stopPropagation()
      const row = this.el('div', 'ts-row gap8')
      SHAPES.forEach(([mode, icon, label]) => {
        const b = this.makeBtn(icon, {
          title: label,
          tap: () => {
            this.currentShape = mode
            this.setIcon(this.shapesBtn, icon)
            this.svgCanvas.setMode(mode)
            this.closePop()
          }
        })
        if (this.svgCanvas.getMode() === mode) b.classList.add('is-active')
        row.append(b)
      })
      this.popover(this.shapesBtn, row, { title: 'Shapes', place: 'bottom' })
    })
    tg.append(this.shapesBtn)

    tg.append(this.makeBtn('text.svg', {
      title: 'Text', tap: () => this.svgCanvas.setMode('text')
    }))
    this.toolBtns.text = tg.lastChild
    sep()
    const cut = this.makeBtn('cutter.svg', { title: 'Cutter', tap: () => this.svgCanvas.setMode('cutter') })
    this.toolBtns.cutter = cut
    tg.append(cut)

    // Shape library — reuse the real <se-shape-library> component. ext-shapes
    // handles its `shape-insert` event via a document-level listener (decoupled
    // from the desktop #tool_shapelib element), so this instance drives the same
    // insertion flow. Picking arms the 'shapelib' mode; the user then drags to
    // place the shape on the canvas, exactly like desktop.
    const extPath = this.editor.configObj.curConfig.extPath
    this.shapeLib = document.createElement('se-shape-library')
    this.shapeLib.setAttribute('title', 'Shape library')
    this.shapeLib.setAttribute('lib', `${extPath}/ext-shapes/shapelib/`)
    this.shapeLib.setAttribute('src', 'shapelib.svg')
    tg.append(this.shapeLib)
  }

  // Activate a command-bar tool. Tablet has no curve-mode selector, so the
  // curvature tool defaults to Spiro (smoothest for touch) — driven through the
  // existing #curvature_mode select so ext-curvature updates its live mode and
  // persists the choice.
  selectTool (mode) {
    const { $id } = this.editor // container-scoped lookups (see EditorStartup constructor)
    this.svgCanvas.setMode(mode)
    if (mode === 'curvature') {
      const sel = $id('curvature_mode')
      if (sel && sel.value !== 'spiro') {
        sel.value = 'spiro'
        sel.dispatchEvent(new CustomEvent('change', { detail: { value: 'spiro' } }))
      }
    }
  }

  shapeIcon () {
    return (SHAPES.find((s) => s[0] === this.currentShape) || SHAPES[0])[1]
  }

  buildRightControls () {
    const { $id } = this.editor // container-scoped lookups (see EditorStartup constructor)
    // Default-style chip — pick stroke/fill/width before drawing
    $id('ts_stylechip').addEventListener('click', (e) => {
      e.stopPropagation()
      const box = this.el('div')
      box.append(this.el('div', 'sec-label', 'Stroke'),
        this.swatchRow(this.svgCanvas.getColor('stroke'), (c) => { this.svgCanvas.setColor('stroke', c); this.paintStyleDot() }))
      const fill = this.el('div'); fill.style.marginTop = '14px'
      fill.append(this.el('div', 'sec-label', 'Fill'),
        this.swatchRow(this.svgCanvas.getColor('fill'), (c) => this.svgCanvas.setColor('fill', c)))
      const wd = this.el('div'); wd.style.marginTop = '16px'
      wd.append(this.slider('Width', 0, 24, this.svgCanvas.getStrokeWidth() || 0, (n) => this.svgCanvas.setStrokeWidth(n)))
      box.append(fill, wd)
      this.popover($id('ts_stylechip'), box, { place: 'bottom' })
    })

    // Zoom − % +
    this.zLabel = this.el('span', 'ts-zlabel', '100%')
    $id('ts_zoom').append(
      this.makeBtn('', { cls: 'sm', title: 'Zoom out', tap: () => this.stepZoom(-25) }),
      this.zLabel,
      this.makeBtn('', { cls: 'sm', title: 'Zoom in', tap: () => this.stepZoom(25) })
    )
    $id('ts_zoom').firstChild.textContent = '−'
    $id('ts_zoom').lastChild.textContent = '+'
    this.syncZoom()

    // Undo / redo
    this.bUndo = this.makeBtn('undo.svg', { cls: 'sm', title: 'Undo', tap: () => this.undo() })
    this.bRedo = this.makeBtn('redo.svg', { cls: 'sm', title: 'Redo', tap: () => this.redo() })
    $id('ts_hist').append(this.bUndo, this.bRedo)
    this.syncHistory()

    // Done — clear selection (collapses sheet)
    $id('ts_done').addEventListener('click', () => this.svgCanvas.clearSelection())
  }

  stepZoom (delta) {
    const cur = Math.round(this.svgCanvas.getZoom() * 100)
    const next = Math.max(10, Math.min(1000, cur + delta))
    this.editor.bottomPanel.changeZoom(next)
  }

  undo () {
    const { undoMgr } = this.svgCanvas
    if (undoMgr.getUndoStackSize() > 0) { undoMgr.undo(); this.syncHistory() }
  }

  redo () {
    const { undoMgr } = this.svgCanvas
    if (undoMgr.getRedoStackSize() > 0) { undoMgr.redo(); this.syncHistory() }
  }

  /* ─────────────────── color popovers ─────────────────── */

  swatchEl (color) {
    const s = this.el('div', 'swatch' + (color === 'none' ? ' none' : ''))
    if (color !== 'none') s.style.background = color
    return s
  }

  // A row of preset swatches + a "More…" entry that opens the full seColorPicker.
  swatchRow (current, onPick, type) {
    const { $id } = this.editor // container-scoped lookups (see EditorStartup constructor)
    const row = this.el('div', 'swrow')
    PRESET_COLORS.forEach((c) => {
      const s = this.swatchEl(c)
      if (c === current) s.classList.add('is-on')
      s.addEventListener('click', () => {
        row.querySelectorAll('.swatch').forEach((x) => x.classList.remove('is-on'))
        s.classList.add('is-on')
        onPick(c)
      })
      row.append(s)
    })
    if (type) {
      const more = this.el('button', 'menu-item')
      more.type = 'button'
      more.style.cssText = 'width:100%;justify-content:center;margin-top:8px'
      more.textContent = 'More…'
      more.addEventListener('click', (e) => {
        e.stopPropagation()
        // Reuse the existing (hidden) desktop picker — its `change` listener in
        // BottomPanel applies the paint to the selection. Dialog appends to body.
        $id(type === 'fill' ? 'fill_color' : 'stroke_color').openColorDialog()
        this.closePop()
      })
      const wrap = this.el('div')
      wrap.append(row, more)
      return wrap
    }
    return row
  }

  /* ─────────────────── slider ─────────────────── */

  slider (label, min, max, val, onInput, unit = '') {
    const wrap = this.el('div', 'slider-row')
    const input = this.el('input', 'te-range')
    input.type = 'range'; input.min = min; input.max = max; input.value = val
    const v = this.el('span', 'val', val + unit)
    input.addEventListener('input', () => { v.textContent = input.value + unit; onInput(+input.value) })
    wrap.append(this.el('span', 'lab', label), input, v)
    return wrap
  }

  /* ─────────────────── bottom sheet ─────────────────── */

  col (label, body) {
    const c = this.el('div', 'sheet-col')
    c.append(this.el('div', 'sec-label', label), body)
    return c
  }

  colorCol (label, current, type) {
    const sw = this.swatchEl(current)
    sw.style.cursor = 'pointer'
    sw.addEventListener('click', (e) => {
      e.stopPropagation()
      this.popover(sw, this.swatchRow(current, (c) => {
        this.svgCanvas.setColor(type, c)
        if (c === 'none') { sw.classList.add('none'); sw.style.background = '' } else { sw.classList.remove('none'); sw.style.background = c }
        this.closePop()
      }, type), { title: label, place: 'top' })
    })
    return this.col(label, sw)
  }

  buildSheet () {
    const { $id } = this.editor // container-scoped lookups (see EditorStartup constructor)
    const row = this.sheetRow
    row.replaceChildren()
    const elem = this.selectedElems[0]
    if (!elem) return
    $id('ts_sheet_kind').textContent = (elem.tagName || 'shape').toLowerCase()

    const fill = this.svgCanvas.getColor('fill')
    const stroke = this.svgCanvas.getColor('stroke')
    const sw = this.svgCanvas.getStrokeWidth() || 0
    const op = Math.round((this.svgCanvas.getOpacity() ?? 1) * 100)

    row.append(this.colorCol('Fill', fill, 'fill'))
    row.append(this.colorCol('Stroke', stroke, 'stroke'))
    row.append(this.el('div', 'sheet-sep'))

    const sliders = this.el('div')
    sliders.style.cssText = 'display:flex;flex-direction:column;gap:12px'
    const swS = this.slider('Width', 0, 24, sw, (n) => this.svgCanvas.setStrokeWidth(n)); swS.classList.add('slider-mini')
    const opS = this.slider('Opacity', 0, 100, op, (n) => this.svgCanvas.setOpacity(n / 100), '%'); opS.classList.add('slider-mini')
    this._swSlider = swS; this._opSlider = opS
    sliders.append(swS, opS)
    row.append(this.col('Stroke & opacity', sliders))
    row.append(this.el('div', 'sheet-sep'))

    // Arrange: Align ▾ · Layer ▾ · Flip H/V
    const alignBtn = this.makeBtn('align_center.svg', { cls: 'sm', title: 'Align to page' })
    alignBtn.classList.add('has-caret')
    alignBtn.addEventListener('click', (e) => {
      e.stopPropagation()
      const g = this.el('div')
      g.style.cssText = 'display:grid;grid-template-columns:repeat(3,46px);gap:4px'
      ;[['align_left.svg', 'l'], ['align_center.svg', 'c'], ['align_right.svg', 'r'],
        ['align_top.svg', 't'], ['align_middle.svg', 'm'], ['align_bottom.svg', 'b']]
        .forEach(([icon, pos]) => g.append(this.makeBtn(icon, {
          cls: 'sm', tap: () => { this.svgCanvas.alignSelectedElements(pos, 'page'); this.closePop() }
        })))
      this.popover(alignBtn, g, { title: 'Align to page', place: 'top' })
    })

    const layerBtn = this.makeBtn('move_top.svg', { cls: 'sm', title: 'Layer order' })
    layerBtn.classList.add('has-caret')
    layerBtn.addEventListener('click', (e) => {
      e.stopPropagation()
      this.popover(layerBtn, this.menuList([
        ['move_top.svg', 'Bring to Front', () => this.svgCanvas.moveToTopSelectedElement()],
        ['move_forward.svg', 'Bring Forward', () => this.editor.moveUpDownSelected('Up')],
        ['move_backwards.svg', 'Send Backward', () => this.editor.moveUpDownSelected('Down')],
        ['move_bottom.svg', 'Send to Back', () => this.svgCanvas.moveToBottomSelectedElement()]
      ]), { title: 'Layer order', place: 'top' })
    })

    const arrange = this.el('div', 'ts-actions')
    arrange.append(alignBtn, layerBtn,
      this.makeBtn('flip_horizontal.svg', { cls: 'sm', title: 'Flip horizontal', tap: () => this.svgCanvas.flipSelectedElements(-1, 1) }),
      this.makeBtn('flip_vertical.svg', { cls: 'sm', title: 'Flip vertical', tap: () => this.svgCanvas.flipSelectedElements(1, -1) }))
    row.append(this.col('Arrange', arrange))
    row.append(this.el('div', 'sheet-sep'))

    // Object: Duplicate · Delete
    const acts = this.el('div', 'ts-actions')
    acts.append(
      this.makeBtn('clone.svg', { cls: 'sm', title: 'Duplicate', tap: () => this.svgCanvas.cloneSelectedElements(20, 20) }),
      this.makeBtn('delete.svg', { cls: 'sm', title: 'Delete', tap: () => this.svgCanvas.deleteSelectedElements() }))
    row.append(this.col('Object', acts))
  }

  syncSheetValues () {
    if (!this.sheet.classList.contains('show')) return
    if (this._swSlider) {
      const sw = this.svgCanvas.getStrokeWidth() || 0
      this._swSlider.querySelector('input').value = sw
      this._swSlider.querySelector('.val').textContent = sw
    }
    if (this._opSlider) {
      const op = Math.round((this.svgCanvas.getOpacity() ?? 1) * 100)
      this._opSlider.querySelector('input').value = op
      this._opSlider.querySelector('.val').textContent = op + '%'
    }
  }

  /* ─────────────────── popover ─────────────────── */

  closePop () {
    if (this._pop) { this._pop.remove(); this._pop = null }
    if (this._onDoc) { document.removeEventListener('pointerdown', this._onDoc, true); this._onDoc = null }
  }

  popover (anchor, content, opts = {}) {
    if (this._pop && this._pop._anchor === anchor) { this.closePop(); return }
    this.closePop()
    const p = this.el('div', 'ts-pop')
    p._anchor = anchor
    if (opts.title) p.append(this.el('div', 'sec-label', opts.title))
    p.append(content)
    this.shell.append(p)

    const shellRect = this.shell.getBoundingClientRect()
    const a = anchor.getBoundingClientRect()
    const pw = p.offsetWidth; const ph = p.offsetHeight
    const place = opts.place || 'top'
    let left = a.left - shellRect.left + a.width / 2 - pw / 2
    let top = place === 'bottom'
      ? a.bottom - shellRect.top + 12
      : a.top - shellRect.top - ph - 12
    left = Math.max(12, Math.min(left, shellRect.width - pw - 12))
    top = Math.max(12, Math.min(top, shellRect.height - ph - 12))
    p.style.left = left + 'px'; p.style.top = top + 'px'

    this._pop = p
    this._onDoc = (e) => {
      if (!p.contains(e.target) && e.target !== anchor && !anchor.contains(e.target)) this.closePop()
    }
    setTimeout(() => document.addEventListener('pointerdown', this._onDoc, true), 0)
    return p
  }

  menuList (items) {
    const m = this.el('div', 'menu')
    items.forEach(([icon, label, tap]) => {
      const row = this.el('button', 'menu-item')
      row.type = 'button'
      const ic = this.el('span', 'mi-ic')
      this.setIcon(ic, icon)
      row.append(ic, this.el('span', null, label))
      row.addEventListener('click', (e) => { e.stopPropagation(); tap(); this.closePop() })
      m.append(row)
    })
    return m
  }

  /* ─────────────────── canvas event wiring ─────────────────── */

  bindEvents () {
    // `svgCanvas.bind` keeps only ONE handler per event, and EditorStartup binds
    // its own `selected`/`changed`/`zoomed` handlers AFTER this runs — so binding
    // here would be overwritten. Instead wrap the Editor's handler methods (which
    // get bound just after init); our logic runs right after the desktop one.
    const ed = this.editor
    const wrap = (name, after) => {
      const orig = ed[name].bind(ed)
      ed[name] = (...args) => { const r = orig(...args); after(...args); return r }
    }
    wrap('selectedChanged', (_win, elems) => {
      this.selectedElems = (elems || []).filter(Boolean)
      if (this.selectedElems.length) {
        this.buildSheet()
        this.sheet.classList.add('show')
      } else {
        this.sheet.classList.remove('show')
      }
      this.syncHistory()
    })
    wrap('elementChanged', () => { this.syncSheetValues(); this.syncHistory() })
    wrap('zoomChanged', () => this.syncZoom())
    document.addEventListener('modeChange', () => {
      const mode = this.svgCanvas.getMode()
      this.syncTools(mode)
      this.paintStyleDot()
      // The shape-library button presses itself when armed; clear it once the
      // user switches away from the 'shapelib' mode.
      if (this.shapeLib && mode !== 'shapelib') this.shapeLib.removeAttribute('pressed')
    }, { signal: this.editor.listenerAbort.signal })
  }

  syncTools (mode) {
    Object.entries(this.toolBtns).forEach(([k, b]) => b.classList.toggle('is-active', k === mode))
    const inShapes = SHAPE_MODES.has(mode)
    if (this.shapesBtn) {
      this.shapesBtn.classList.toggle('is-active', inShapes)
      if (inShapes && mode !== this.currentShape) {
        this.currentShape = mode
        this.setIcon(this.shapesBtn, this.shapeIcon())
      }
    }
  }

  syncZoom () {
    if (this.zLabel) this.zLabel.textContent = Math.round(this.svgCanvas.getZoom() * 100) + '%'
  }

  syncHistory () {
    if (!this.bUndo) return
    this.bUndo.disabled = this.svgCanvas.undoMgr.getUndoStackSize() === 0
    this.bRedo.disabled = this.svgCanvas.undoMgr.getRedoStackSize() === 0
  }

  paintStyleDot () {
    const { $id } = this.editor // container-scoped lookups (see EditorStartup constructor)
    const dot = $id('ts_styledot')
    if (!dot) return
    const stroke = this.svgCanvas.getColor('stroke')
    dot.style.background = (!stroke || stroke === 'none') ? '#fff' : stroke
  }
}

export default TabletShell
