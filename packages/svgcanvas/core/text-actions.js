// @ts-check
// text-actions.js — Text cursor/selection editing (`verticalMove` for area text)
/**
 * @module text-actions Tools for Text edit functions
 * @license MIT
 *
 * @copyright 2010 Alexis Deveria, 2010 Jeff Schiller
 */

import { NS } from './namespaces.ts'
import { transformPoint, matrixMultiply, getTransformList, transformListToTransform } from './math.ts'
import {
  assignAttributes,
  getTextWithNewlines,
  TEXT_LINE_HEIGHT
} from './dom-utils.js'
import { getBBox as utilsGetBBox } from './bbox-utils.js'
import { supportsGoodTextCharPos } from '../common/browser.js'
import { isAreaText, rowsOf, softCount } from './text-rows.js'

/** @typedef {{x: number, y: number, height: number}} CharBox */

/**
 * @function module:text-actions.init
 * @param {import('../svgcanvas.js').default} canvas
 * @returns {void}
 */
export const init = (canvas) => {
  const svgCanvas = canvas // per-instance; the TextActions class below closes over it

  /**
 * Group: Text edit functions
 * Functions relating to editing text elements.
 * @class TextActions
 * @memberof module:svgcanvas.SvgCanvas#
 */
  class TextActions {
    /** @type {?SVGTextElement} */
    #curtext = null
    /** @type {?HTMLTextAreaElement} */
    #textinput = null
    /** @type {?SVGLineElement} */
    #cursor = null
    /** @type {?SVGPathElement} */
    #selblock = null
    /** @type {?ReturnType<typeof setInterval>} */
    #blinker = null
    /** @type {CharBox[]} */
    #chardata = [] // per textarea-caret-position: { x, y(row top), height }
    /** @type {?{x: number, y: number, width: number, height: number}} */
    #textbb = null // , transbb;
    /** @type {?SVGMatrix} */
    #matrix = null
    /** @type {?number} */
    #lastX = null
    /** @type {?number} */
    #lastY = null
    #allowDbl = false

    /**
   * Get the accumulated transformation matrix from the element up to the SVG content element.
   * This includes transforms from all parent groups, fixing the issue where text cursor
   * appears in the wrong position when editing text inside a transformed group.
   * @param {Element} elem - The element to get the accumulated matrix for
   * @returns {SVGMatrix|null} The accumulated transformation matrix, or null if none
   */
    #getAccumulatedMatrix = (elem) => {
      const svgContent = svgCanvas.getSvgContent()
      /** @type {SVGMatrix[]} */
      const matrices = []

      let current = elem
      while (current && current !== svgContent && current.nodeType === 1) {
        const tlist = getTransformList(current)
        if (tlist && tlist.numberOfItems > 0) {
          const matrix = transformListToTransform(tlist).matrix
          matrices.unshift(matrix) // Add to beginning to maintain correct order
        }
        current = /** @type {Element} */ (current.parentNode)
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
   * @param {number} [index]
   * @returns {void}
   */
    #setCursor = (index = undefined) => {
      const input = this.#textinput
      if (!input) return
      const empty = input.value === ''
      input.focus()

      if (index === undefined) {
        if (empty) {
          index = 0
        } else {
          if (input.selectionEnd !== input.selectionStart) {
            return
          }
          index = input.selectionEnd
        }
      }

      const charbb = this.#chardata[index] ?? this.#chardata[this.#chardata.length - 1]
      if (!empty) {
        input.setSelectionRange(index, index)
      }
      let cursor = /** @type {?SVGLineElement} */ (svgCanvas.getElement('text_cursor'))
      if (!cursor) {
        cursor = document.createElementNS(NS.SVG, 'line')
        assignAttributes(cursor, {
          id: 'text_cursor',
          stroke: '#333',
          'stroke-width': 1
        })
        const parentGroup = /** @type {Element} */ (svgCanvas.getElement('selectorParentGroup'))
        parentGroup.append(cursor)
      }
      this.#cursor = cursor

      if (!this.#blinker) {
        this.#blinker = setInterval(() => {
          const line = this.#cursor
          if (!line) return
          const show = line.getAttribute('display') === 'none'
          line.setAttribute('display', show ? 'inline' : 'none')
        }, 600)
      }

      const startPt = this.#ptToScreen(charbb.x, charbb.y)
      const endPt = this.#ptToScreen(charbb.x, charbb.y + charbb.height)

      assignAttributes(cursor, {
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
   * @param {number} start
   * @param {number} end
   * @param {boolean} [skipInput]
   * @returns {void}
   */
    #setSelection = (start, end, skipInput) => {
      if (start === end) {
        this.#setCursor(end)
        return
      }

      if (!skipInput) {
        this.#textinput?.setSelectionRange(start, end)
      }

      let selblock = /** @type {?SVGPathElement} */ (svgCanvas.getElement('text_selectblock'))
      if (!selblock) {
        selblock = document.createElementNS(NS.SVG, 'path')
        assignAttributes(selblock, {
          id: 'text_selectblock',
          fill: 'green',
          opacity: 0.5,
          style: 'pointer-events:none'
        })
        const parentGroup = /** @type {Element} */ (svgCanvas.getElement('selectorParentGroup'))
        parentGroup.append(selblock)
      }
      this.#selblock = selblock

      this.#cursor?.setAttribute('visibility', 'hidden')

      // Highlight the selection as one quad per row it spans. Consecutive caret
      // positions on the same row share a `y`; a change in `y` marks a row break.
      const cd = this.#chardata
      const quad = (/** @type {CharBox} */ e0, /** @type {CharBox} */ e1) => {
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

      assignAttributes(selblock, {
        d: dstr,
        display: 'inline'
      })
    }

    /**
   *
   * @param {number} mouseX
   * @param {number} mouseY
   * @returns {number}
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
   * @param {number} mouseX
   * @param {number} mouseY
   * @returns {void}
   */
    #setCursorFromPoint = (mouseX, mouseY) => {
      this.#setCursor(this.#getIndexFromPoint(mouseX, mouseY))
    }

    /**
   *
   * @param {number} x
   * @param {number} y
   * @param {boolean} [apply]
   * @returns {void}
   */
    #setEndSelectionFromPoint = (x, y, apply) => {
      const i1 = this.#textinput?.selectionStart ?? 0
      const i2 = this.#getIndexFromPoint(x, y)

      const start = Math.min(i1, i2)
      const end = Math.max(i1, i2)
      this.#setSelection(start, end, !apply)
    }

    /**
   *
   * @param {number} xIn
   * @param {number} yIn
   * @returns {module:math.XYObject}
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
   * @param {number} xIn
   * @param {number} yIn
   * @returns {module:math.XYObject}
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
   * @returns {void}
   */
    #selectAll = () => {
      if (!this.#allowDbl || !this.#curtext || !this.#textinput) {
        return
      }
      this.#setSelection(0, this.#textinput.value.length)
    }

    /**
   * @param {SVGTextElement} target
   * @param {number} x
   * @param {number} y
   * @returns {void}
   */
    select (target, x, y) {
      this.#curtext = target
      svgCanvas.textActions.toEditMode(x, y)
    }

    /**
   * @param {SVGTextElement} elem
   * @returns {void}
   */
    start (elem) {
      this.#curtext = elem
      svgCanvas.textActions.toEditMode()
    }

    /**
   * @param {MouseEvent} evt
   * @param {Element} mouseTarget
   * @param {number} startX
   * @param {number} startY
   * @returns {void}
   */
    mouseDown (evt, mouseTarget, startX, startY) {
      const pt = this.#screenToPt(startX, startY)

      this.#textinput?.focus()
      this.#setCursorFromPoint(pt.x, pt.y)
      this.#lastX = startX
      this.#lastY = startY

    // TODO: Find way to block native selection
    }

    /**
   * @param {number} mouseX
   * @param {number} mouseY
   * @returns {void}
   */
    mouseMove (mouseX, mouseY) {
      const pt = this.#screenToPt(mouseX, mouseY)
      this.#setEndSelectionFromPoint(pt.x, pt.y)
    }

    /**
   * @param {MouseEvent} evt
   * @param {number} mouseX
   * @param {number} mouseY
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
      mouseX < (this.#lastX ?? 0) + 2 &&
      mouseX > (this.#lastX ?? 0) - 2 &&
      mouseY < (this.#lastY ?? 0) + 2 &&
      mouseY > (this.#lastY ?? 0) - 2
      ) {
        svgCanvas.textActions.toSelectMode(true)
      }
    }

    /**
   * Move the caret one drawn row up (-1) or down (1). The edit buffer has no idea where an area text wraps, so
   * the textarea's own ArrowUp / ArrowDown would jump a whole paragraph; this picks the caret position nearest
   * the same x in the neighbouring row instead (past the first / last row it goes to the start / end).
   * @param {-1|1} dir
   * @param {boolean} [extend] Shift: grow the selection from its anchor
   * @returns {boolean} Whether the key was handled (only area text is)
   */
    verticalMove (dir, extend = false) {
      const text = this.#curtext
      const input = this.#textinput
      if (!text || !input || !isAreaText(text) || !this.#chardata.length) { return false }
      const cd = this.#chardata
      const backward = input.selectionDirection === 'backward'
      const head = Math.min(backward ? input.selectionStart : input.selectionEnd, cd.length - 1)
      const anchor = backward ? input.selectionEnd : input.selectionStart
      const ys = [...new Set(cd.map((c) => c.y))]
      const row = ys.indexOf(cd[head].y) + dir
      let target
      if (row < 0) {
        target = 0
      } else if (row >= ys.length) {
        target = cd.length - 1
      } else {
        target = cd.findIndex((c) => c.y === ys[row])
        for (let i = target; i < cd.length && cd[i].y === ys[row]; i++) {
          if (Math.abs(cd[i].x - cd[head].x) < Math.abs(cd[target].x - cd[head].x)) { target = i }
        }
      }
      this.#moveCaret(target, anchor, extend)
      return true
    }

    /**
   * Home / End by drawn row: the textarea's own would go to the start / end of the whole paragraph. A row's caret
   * positions are the consecutive ones that share its y (the end of a soft row includes the spaces the break swallowed).
   * @param {'start'|'end'} edge
   * @param {boolean} [extend] Shift: grow the selection from its anchor
   * @returns {boolean} Whether the key was handled (only area text is)
   */
    lineEdge (edge, extend = false) {
      const text = this.#curtext
      const input = this.#textinput
      if (!text || !input || !isAreaText(text) || !this.#chardata.length) { return false }
      const cd = this.#chardata
      const backward = input.selectionDirection === 'backward'
      const head = Math.min(backward ? input.selectionStart : input.selectionEnd, cd.length - 1)
      const anchor = backward ? input.selectionEnd : input.selectionStart
      let target = head
      if (edge === 'start') {
        while (target > 0 && cd[target - 1].y === cd[head].y) { target-- }
      } else {
        while (target < cd.length - 1 && cd[target + 1].y === cd[head].y) { target++ }
      }
      this.#moveCaret(target, anchor, extend)
      return true
    }

    /**
   * @param {number} target caret position to move to
   * @param {number} anchor the selection's fixed end
   * @param {boolean} extend keep the anchor (a selection) instead of collapsing onto `target`
   * @returns {void}
   */
    #moveCaret (target, anchor, extend) {
      const from = extend ? anchor : target
      this.#textinput?.setSelectionRange(Math.min(from, target), Math.max(from, target), target < from ? 'backward' : 'forward')
      this.init()
    }

    /**
   * @param {number} index
   * @returns {void}
   */
    setCursor (index) {
      this.#setCursor(index)
    }

    /**
   * @param {number} x
   * @param {number} y
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

      if (this.#curtext) this.#curtext.style.cursor = 'text'

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
    // Lock mode: a freshly-placed text re-arms the text tool instead of
    // dropping back to select, so the user can place several texts in a row.
    // Use setCurrentMode (not setMode) to avoid re-entering textActions.clear().
      const relock = svgCanvas.getToolLocked() && svgCanvas.getTextFreshCreate()
      svgCanvas.setCurrentMode(relock ? 'text' : 'select')

      // Text-editing a text element inside a group is entered implicitly (the
      // double-click that reaches the text also drills into the group), and
      // this fork hides the layer/group breadcrumb, so the user has no
      // indication they're still "inside" that group once done editing. Left
      // alone, currentGroup (and the siblings dimmed/disabled by setContext())
      // stays stuck that way, and the next new shape drawn silently lands
      // inside that stale group instead of the current layer. Mirrors the
      // identical fix in path-actions.js's toSelectMode().
      if (!relock && svgCanvas.getCurrentGroup()) {
        svgCanvas.leaveContext()
      }

      clearInterval(this.#blinker ?? undefined)
      this.#blinker = null
      if (this.#selblock) {
        this.#selblock.setAttribute('display', 'none')
      }
      if (this.#cursor) {
        this.#cursor.setAttribute('visibility', 'hidden')
      }
      if (this.#curtext) this.#curtext.style.cursor = 'move'

      if (selectElem && !relock) {
        svgCanvas.clearSelection()
        if (this.#curtext) this.#curtext.style.cursor = 'move'

        const curtext = /** @type {Element} */ (this.#curtext)
        svgCanvas.call('selected', [curtext])
        svgCanvas.addToSelection([curtext], true)
      }
      if (this.#curtext && !getTextWithNewlines(this.#curtext).length) {
      // No content (not even blank rows), so delete
        svgCanvas.deleteSelectedElements()
      }

      this.#textinput?.blur()

      this.#curtext = null
      svgCanvas.setTextFreshCreate(false)

    // if (supportsEditableText()) {
    //   curtext.removeAttribute('editable');
    // }
    }

    /**
   * @param {HTMLTextAreaElement} elem
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
   * @param {Element} [_inputElem] Not in use
   * @returns {void}
   */
    init (_inputElem) {
      let text = this.#curtext
      const input = this.#textinput
      if (!text || !input) {
        return
      }

      if (!text.parentNode) {
      // Result of the ffClone, need to get correct element
        const selectedElements = svgCanvas.getSelectedElements()
        text = /** @type {SVGTextElement} */ (selectedElements[0])
        this.#curtext = text
        svgCanvas.selectorManager.requestSelector(text).showGrips(false)
      }

      // The edit buffer (a <textarea>) is the source of truth for line breaks —
      // its value carries the `\n`s that the rendered SVG (one <tspan> per row)
      // does not. `chardata` is therefore indexed by *textarea caret position*.
      const value = input.value
      const len = value.length

      const textbb = this.#textbb = utilsGetBBox(text)

      // Calculate accumulated transform matrix including all parent groups
      // This fixes the issue where text cursor appears in wrong position
      // when editing text inside a group with transforms
      this.#matrix = this.#getAccumulatedMatrix(text)

      input.focus()

      text.removeEventListener('dblclick', this.#selectAll)
      text.addEventListener('dblclick', this.#selectAll)

      // Row geometry. tspans are positioned at absolute `y = textY + row*lineH`
      // (see utilities.setMultilineText) so per-row baselines are exactly
      // computable — no need to read each rendered glyph's y.
      const fontSize = parseFloat(window.getComputedStyle(text).fontSize) ||
      parseFloat(text.getAttribute('font-size') ?? '') || 16
      const lineHeight = fontSize * TEXT_LINE_HEIGHT
      const ascent = fontSize * 0.8
      const cursorHeight = fontSize
      let row0Baseline = parseFloat(text.getAttribute('y') ?? '')
      if (isNaN(row0Baseline)) {
        row0Baseline = (textbb?.y ?? 0) + ascent
      }
      const rowTop = (/** @type {number} */ row) => row0Baseline + row * lineHeight - ascent

      // Anchor x for blank rows / empty text — the row's reference point, which
      // is the (shared) tspan x = text x attribute.
      let anchorX = parseFloat(text.getAttribute('x') ?? '')
      if (isNaN(anchorX)) {
        anchorX = (textbb?.x ?? 0) + (textbb?.width ?? 0) / 2
      }

      // Phase 1: gather rendered glyph x-extents (no newlines in this index space).
      const renderedLen = text.getNumberOfChars
        ? text.getNumberOfChars()
        : (text.textContent ?? '').length
      const goodPos = supportsGoodTextCharPos()
      const zoom = svgCanvas.getZoom()
      const glyph = new Array(renderedLen)
      for (let s = 0; s < renderedLen; s++) {
        const start = text.getStartPositionOfChar(s)
        const end = text.getEndPositionOfChar(s)
        let x0 = start.x
        let x1 = end.x
        if (!goodPos) {
          const offset = svgCanvas.contentW * zoom
          x0 = (x0 - offset) / zoom
          x1 = (x1 - offset) / zoom
        }
        glyph[s] = { x0, x1 }
      }

      if (isAreaText(text)) {
        // Wrapped rows: each row is a tspan with its own baseline; a soft break stands for the spaces it swallowed.
        const chardata = new Array(len + 1)
        const rows = rowsOf(text)
        let k = 0
        let s = 0
        let lastX = anchorX
        rows.forEach((tspan, r) => {
          const text = tspan.textContent ?? ''
          const top = (parseFloat(tspan.getAttribute('y') ?? '') || row0Baseline) - ascent
          const rowX = parseFloat(tspan.getAttribute('x') ?? '')
          const box = (/** @type {number} */ x) => ({ x, y: top, height: cursorHeight })
          for (let j = 0; j < text.length; j++) {
            lastX = glyph[s + j] ? glyph[s + j].x0 : lastX
            chardata[k + j] = box(lastX)
          }
          const endX = text.length && glyph[s + text.length - 1]
            ? glyph[s + text.length - 1].x1
            : (isNaN(rowX) ? anchorX : rowX)
          chardata[k + text.length] = box(endX)
          lastX = endX
          const next = rows[r + 1]
          if (next) {
            const swallowed = softCount(next) ?? 1 // a hard break swallows the newline
            for (let j = 1; j < swallowed; j++) chardata[k + text.length + j] = box(endX)
            k += text.length + swallowed
          }
          s += text.length
        })
        if (!rows.length) chardata[0] = { x: anchorX, y: rowTop(0), height: cursorHeight }
        for (let i = 0; i <= len; i++) {
          if (!chardata[i]) chardata[i] = chardata[i - 1] ?? { x: anchorX, y: rowTop(0), height: cursorHeight }
        }
        this.#chardata = chardata
        this.#setSelection(input.selectionStart, input.selectionEnd, true)
        return
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

      this.#setSelection(input.selectionStart, input.selectionEnd, true)
    }
  }

  // Per-instance TextActions, attached to this canvas.
  svgCanvas.textActions = new TextActions()
}
