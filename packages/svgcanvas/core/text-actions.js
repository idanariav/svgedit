/**
 * @module text-actions Tools for Text edit functions
 * @license MIT
 *
 * @copyright 2010 Alexis Deveria, 2010 Jeff Schiller
 */

import { NS } from './namespaces.js'
import { transformPoint, matrixMultiply, getTransformList, transformListToTransform } from './math.js'
import {
  assignAttributes,
  getBBox as utilsGetBBox,
  getTextWithNewlines,
  TEXT_LINE_HEIGHT
} from './utilities.js'
import { supportsGoodTextCharPos } from '../common/browser.js'

/**
 * @function module:text-actions.init
 * @param {module:text-actions.svgCanvas} textActionsContext
 * @returns {void}
 */
export const init = canvas => {
  const svgCanvas = canvas // per-instance; the TextActions class below closes over it

/**
 * Group: Text edit functions
 * Functions relating to editing text elements.
 * @class TextActions
 * @memberof module:svgcanvas.SvgCanvas#
 */
class TextActions {
  #curtext = null
  #textinput = null
  #cursor = null
  #selblock = null
  #blinker = null
  #chardata = [] // per textarea-caret-position: { x, y(row top), height }
  #textbb = null // , transbb;
  #matrix = null
  #lastX = null
  #lastY = null
  #allowDbl = false

  /**
   * Get the accumulated transformation matrix from the element up to the SVG content element.
   * This includes transforms from all parent groups, fixing the issue where text cursor
   * appears in the wrong position when editing text inside a transformed group.
   * @param {Element} elem - The element to get the accumulated matrix for
   * @returns {SVGMatrix|null} The accumulated transformation matrix, or null if none
   * @private
   */
  #getAccumulatedMatrix = (elem) => {
    const svgContent = svgCanvas.getSvgContent()
    const matrices = []

    let current = elem
    while (current && current !== svgContent && current.nodeType === 1) {
      const tlist = getTransformList(current)
      if (tlist && tlist.numberOfItems > 0) {
        const matrix = transformListToTransform(tlist).matrix
        matrices.unshift(matrix) // Add to beginning to maintain correct order
      }
      current = current.parentNode
    }

    if (matrices.length === 0) {
      return null
    }

    if (matrices.length === 1) {
      return matrices[0]
    }

    // Multiply all matrices together
    return matrixMultiply(...matrices)
  }

  /**
   *
   * @param {Integer} index
   * @returns {void}
   * @private
   */
  #setCursor = (index = undefined) => {
    const empty = this.#textinput.value === ''
    this.#textinput.focus()

    if (index === undefined) {
      if (empty) {
        index = 0
      } else {
        if (this.#textinput.selectionEnd !== this.#textinput.selectionStart) {
          return
        }
        index = this.#textinput.selectionEnd
      }
    }

    const charbb = this.#chardata[index] ?? this.#chardata[this.#chardata.length - 1]
    if (!empty) {
      this.#textinput.setSelectionRange(index, index)
    }
    this.#cursor = svgCanvas.getElement('text_cursor')
    if (!this.#cursor) {
      this.#cursor = document.createElementNS(NS.SVG, 'line')
      assignAttributes(this.#cursor, {
        id: 'text_cursor',
        stroke: '#333',
        'stroke-width': 1
      })
      svgCanvas.getElement('selectorParentGroup').append(this.#cursor)
    }

    if (!this.#blinker) {
      this.#blinker = setInterval(() => {
        const show = this.#cursor.getAttribute('display') === 'none'
        this.#cursor.setAttribute('display', show ? 'inline' : 'none')
      }, 600)
    }

    const startPt = this.#ptToScreen(charbb.x, charbb.y)
    const endPt = this.#ptToScreen(charbb.x, charbb.y + charbb.height)

    assignAttributes(this.#cursor, {
      x1: startPt.x,
      y1: startPt.y,
      x2: endPt.x,
      y2: endPt.y,
      visibility: 'visible',
      display: 'inline'
    })

    if (this.#selblock) {
      this.#selblock.setAttribute('d', '')
    }
  }

  /**
   *
   * @param {Integer} start
   * @param {Integer} end
   * @param {boolean} skipInput
   * @returns {void}
   * @private
   */
  #setSelection = (start, end, skipInput) => {
    if (start === end) {
      this.#setCursor(end)
      return
    }

    if (!skipInput) {
      this.#textinput.setSelectionRange(start, end)
    }

    this.#selblock = svgCanvas.getElement('text_selectblock')
    if (!this.#selblock) {
      this.#selblock = document.createElementNS(NS.SVG, 'path')
      assignAttributes(this.#selblock, {
        id: 'text_selectblock',
        fill: 'green',
        opacity: 0.5,
        style: 'pointer-events:none'
      })
      svgCanvas.getElement('selectorParentGroup').append(this.#selblock)
    }

    this.#cursor.setAttribute('visibility', 'hidden')

    // Highlight the selection as one quad per row it spans. Consecutive caret
    // positions on the same row share a `y`; a change in `y` marks a row break.
    const cd = this.#chardata
    const quad = (e0, e1) => {
      const tl = this.#ptToScreen(e0.x, e0.y)
      const tr = this.#ptToScreen(e1.x, e1.y)
      const bl = this.#ptToScreen(e0.x, e0.y + e0.height)
      const br = this.#ptToScreen(e1.x, e1.y + e1.height)
      return `M${tl.x},${tl.y} L${tr.x},${tr.y} ${br.x},${br.y} ${bl.x},${bl.y}z `
    }
    let dstr = ''
    let runStart = start
    for (let k = start + 1; k <= end; k++) {
      const rowBreak = (k === end) || (cd[k].y !== cd[k - 1].y)
      if (rowBreak) {
        const runEnd = (k === end) ? end : (k - 1)
        dstr += quad(cd[runStart], cd[runEnd])
        runStart = k
      }
    }

    assignAttributes(this.#selblock, {
      d: dstr,
      display: 'inline'
    })
  }

  /**
   *
   * @param {Float} mouseX
   * @param {Float} mouseY
   * @returns {Integer}
   * @private
   */
  #getIndexFromPoint = (mouseX, mouseY) => {
    const cd = this.#chardata
    // No content, so return 0
    if (!cd || cd.length <= 1) {
      return 0
    }
    // Pick the caret position nearest the point. Vertical (row) distance is
    // weighted strongly over horizontal so a click lands on the clicked row
    // first, then the closest caret within it. This is row-aware, so multiline
    // text resolves clicks to the correct line.
    let best = 0
    let bestScore = Infinity
    for (let k = 0; k < cd.length; k++) {
      const e = cd[k]
      let vdist = 0
      if (mouseY < e.y) { vdist = e.y - mouseY } else if (mouseY > e.y + e.height) { vdist = mouseY - (e.y + e.height) }
      const score = vdist * 1000 + Math.abs(e.x - mouseX)
      if (score < bestScore) {
        bestScore = score
        best = k
      }
    }
    return best
  }

  /**
   *
   * @param {Float} mouseX
   * @param {Float} mouseY
   * @returns {void}
   * @private
   */
  #setCursorFromPoint = (mouseX, mouseY) => {
    this.#setCursor(this.#getIndexFromPoint(mouseX, mouseY))
  }

  /**
   *
   * @param {Float} x
   * @param {Float} y
   * @param {boolean} apply
   * @returns {void}
   * @private
   */
  #setEndSelectionFromPoint = (x, y, apply) => {
    const i1 = this.#textinput.selectionStart
    const i2 = this.#getIndexFromPoint(x, y)

    const start = Math.min(i1, i2)
    const end = Math.max(i1, i2)
    this.#setSelection(start, end, !apply)
  }

  /**
   *
   * @param {Float} xIn
   * @param {Float} yIn
   * @returns {module:math.XYObject}
   * @private
   */
  #screenToPt = (xIn, yIn) => {
    const out = {
      x: xIn,
      y: yIn
    }
    const zoom = svgCanvas.getZoom()
    out.x /= zoom
    out.y /= zoom

    if (this.#matrix) {
      const pt = transformPoint(out.x, out.y, this.#matrix.inverse())
      out.x = pt.x
      out.y = pt.y
    }

    return out
  }

  /**
   *
   * @param {Float} xIn
   * @param {Float} yIn
   * @returns {module:math.XYObject}
   * @private
   */
  #ptToScreen = (xIn, yIn) => {
    const out = {
      x: xIn,
      y: yIn
    }

    if (this.#matrix) {
      const pt = transformPoint(out.x, out.y, this.#matrix)
      out.x = pt.x
      out.y = pt.y
    }
    const zoom = svgCanvas.getZoom()
    out.x *= zoom
    out.y *= zoom

    return out
  }

  /**
   *
   * @param {Event} evt
   * @returns {void}
   * @private
   */
  #selectAll = () => {
    if (!this.#allowDbl || !this.#curtext) {
      return
    }
    this.#setSelection(0, this.#textinput.value.length)
  }

  /**
   * @param {Element} target
   * @param {Float} x
   * @param {Float} y
   * @returns {void}
   */
  select (target, x, y) {
    this.#curtext = target
    svgCanvas.textActions.toEditMode(x, y)
  }

  /**
   * @param {Element} elem
   * @returns {void}
   */
  start (elem) {
    this.#curtext = elem
    svgCanvas.textActions.toEditMode()
  }

  /**
   * @param {external:MouseEvent} evt
   * @param {Element} mouseTarget
   * @param {Float} startX
   * @param {Float} startY
   * @returns {void}
   */
  mouseDown (evt, mouseTarget, startX, startY) {
    const pt = this.#screenToPt(startX, startY)

    this.#textinput.focus()
    this.#setCursorFromPoint(pt.x, pt.y)
    this.#lastX = startX
    this.#lastY = startY

    // TODO: Find way to block native selection
  }

  /**
   * @param {Float} mouseX
   * @param {Float} mouseY
   * @returns {void}
   */
  mouseMove (mouseX, mouseY) {
    const pt = this.#screenToPt(mouseX, mouseY)
    this.#setEndSelectionFromPoint(pt.x, pt.y)
  }

  /**
   * @param {external:MouseEvent} evt
   * @param {Float} mouseX
   * @param {Float} mouseY
   * @returns {void}
   */
  mouseUp (evt, mouseX, mouseY) {
    const pt = this.#screenToPt(mouseX, mouseY)

    this.#setEndSelectionFromPoint(pt.x, pt.y, true)

    // TODO: Find a way to make this work: Use transformed BBox instead of evt.target
    // if (lastX === mouseX && lastY === mouseY
    //   && !rectsIntersect(transbb, {x: pt.x, y: pt.y, width: 0, height: 0})) {
    //   svgCanvas.textActions.toSelectMode(true);
    // }

    if (
      evt.target !== this.#curtext &&
      mouseX < this.#lastX + 2 &&
      mouseX > this.#lastX - 2 &&
      mouseY < this.#lastY + 2 &&
      mouseY > this.#lastY - 2
    ) {
      svgCanvas.textActions.toSelectMode(true)
    }
  }

  /**
   * @param {Integer} index
   * @returns {void}
   */
  setCursor (index) {
    this.#setCursor(index)
  }

  /**
   * @param {Float} x
   * @param {Float} y
   * @returns {void}
   */
  toEditMode (x, y) {
    this.#allowDbl = false
    svgCanvas.setCurrentMode('textedit')
    svgCanvas.selectorManager.requestSelector(this.#curtext).showGrips(false)
    // Make selector group accept clicks
    /* const selector = */ svgCanvas.selectorManager.requestSelector(this.#curtext) // Do we need this? Has side effect of setting lock, so keeping for now, but next line wasn't being used
    // const sel = selector.selectorRect;

    svgCanvas.textActions.init()

    this.#curtext.style.cursor = 'text'

    // if (supportsEditableText()) {
    //   curtext.setAttribute('editable', 'simple');
    //   return;
    // }

    if (arguments.length === 0) {
      this.#setCursor()
    } else {
      const pt = this.#screenToPt(x, y)
      this.#setCursorFromPoint(pt.x, pt.y)
    }

    setTimeout(() => {
      this.#allowDbl = true
    }, 300)
  }

  /**
   * @param {boolean|Element} selectElem
   * @fires module:svgcanvas.SvgCanvas#event:selected
   * @returns {void}
   */
  toSelectMode (selectElem) {
    svgCanvas.setCurrentMode('select')
    clearInterval(this.#blinker)
    this.#blinker = null
    if (this.#selblock) {
      this.#selblock.setAttribute('display', 'none')
    }
    if (this.#cursor) {
      this.#cursor.setAttribute('visibility', 'hidden')
    }
    this.#curtext.style.cursor = 'move'

    if (selectElem) {
      svgCanvas.clearSelection()
      this.#curtext.style.cursor = 'move'

      svgCanvas.call('selected', [this.#curtext])
      svgCanvas.addToSelection([this.#curtext], true)
    }
    if (this.#curtext && !getTextWithNewlines(this.#curtext).length) {
      // No content (not even blank rows), so delete
      svgCanvas.deleteSelectedElements()
    }

    this.#textinput.blur()

    this.#curtext = false

    // if (supportsEditableText()) {
    //   curtext.removeAttribute('editable');
    // }
  }

  /**
   * @param {Element} elem
   * @returns {void}
   */
  setInputElem (elem) {
    this.#textinput = elem
  }

  /**
   * @returns {void}
   */
  clear () {
    if (svgCanvas.getCurrentMode() === 'textedit') {
      svgCanvas.textActions.toSelectMode()
    }
  }

  /**
   * @param {Element} _inputElem Not in use
   * @returns {void}
   */
  init (_inputElem) {
    if (!this.#curtext) {
      return
    }

    if (!this.#curtext.parentNode) {
      // Result of the ffClone, need to get correct element
      const selectedElements = svgCanvas.getSelectedElements()
      this.#curtext = selectedElements[0]
      svgCanvas.selectorManager.requestSelector(this.#curtext).showGrips(false)
    }

    // The edit buffer (a <textarea>) is the source of truth for line breaks —
    // its value carries the `\n`s that the rendered SVG (one <tspan> per row)
    // does not. `chardata` is therefore indexed by *textarea caret position*.
    const value = this.#textinput.value
    const len = value.length

    this.#textbb = utilsGetBBox(this.#curtext)

    // Calculate accumulated transform matrix including all parent groups
    // This fixes the issue where text cursor appears in wrong position
    // when editing text inside a group with transforms
    this.#matrix = this.#getAccumulatedMatrix(this.#curtext)

    this.#textinput.focus()

    this.#curtext.removeEventListener('dblclick', this.#selectAll)
    this.#curtext.addEventListener('dblclick', this.#selectAll)

    // Row geometry. tspans are positioned at absolute `y = textY + row*lineH`
    // (see utilities.setMultilineText) so per-row baselines are exactly
    // computable — no need to read each rendered glyph's y.
    const fontSize = parseFloat(window.getComputedStyle(this.#curtext).fontSize) ||
      parseFloat(this.#curtext.getAttribute('font-size')) || 16
    const lineHeight = fontSize * TEXT_LINE_HEIGHT
    const ascent = fontSize * 0.8
    const cursorHeight = fontSize
    let row0Baseline = parseFloat(this.#curtext.getAttribute('y'))
    if (isNaN(row0Baseline)) {
      row0Baseline = this.#textbb.y + ascent
    }
    const rowTop = (row) => row0Baseline + row * lineHeight - ascent

    // Anchor x for blank rows / empty text — the row's reference point, which
    // is the (shared) tspan x = text x attribute.
    let anchorX = parseFloat(this.#curtext.getAttribute('x'))
    if (isNaN(anchorX)) {
      anchorX = this.#textbb.x + this.#textbb.width / 2
    }

    // Phase 1: gather rendered glyph x-extents (no newlines in this index space).
    const renderedLen = this.#curtext.getNumberOfChars
      ? this.#curtext.getNumberOfChars()
      : this.#curtext.textContent.length
    const goodPos = supportsGoodTextCharPos()
    const zoom = svgCanvas.getZoom()
    const glyph = new Array(renderedLen)
    for (let s = 0; s < renderedLen; s++) {
      const start = this.#curtext.getStartPositionOfChar(s)
      const end = this.#curtext.getEndPositionOfChar(s)
      let x0 = start.x
      let x1 = end.x
      if (!goodPos) {
        const offset = svgCanvas.contentW * zoom
        x0 = (x0 - offset) / zoom
        x1 = (x1 - offset) / zoom
      }
      glyph[s] = { x0, x1 }
    }

    // Phase 2: walk the textarea value, producing a caret box per position.
    const chardata = new Array(len + 1)
    let s = 0 // rendered char index
    let row = 0
    let rowStartS = 0 // value of `s` at the start of the current row
    for (let k = 0; k <= len; k++) {
      const ch = k < len ? value[k] : undefined
      let x
      if (ch !== undefined && ch !== '\n') {
        // caret sits at the left edge of a rendered char
        x = glyph[s] ? glyph[s].x0 : anchorX
      } else if (s > rowStartS && glyph[s - 1]) {
        // caret at the end of a non-empty row (before a `\n` or end of text)
        x = glyph[s - 1].x1
      } else {
        // empty row
        x = anchorX
      }
      chardata[k] = { x, y: rowTop(row), height: cursorHeight }

      if (ch !== undefined && ch !== '\n') {
        s++
      } else if (ch === '\n') {
        row++
        rowStartS = s
      }
    }
    this.#chardata = chardata

    this.#setSelection(this.#textinput.selectionStart, this.#textinput.selectionEnd, true)
  }
}

  // Per-instance TextActions, attached to this canvas.
  svgCanvas.textActions = new TextActions()
}
