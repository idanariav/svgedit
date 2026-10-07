/**
 * Text attribute operations (bold/italic/decoration, anchor and spacing,
 * perspective, font family/size/colour, text content), split out of
 * elem-get-set.js. Created per SvgCanvas instance and attached to the canvas.
 * @module text-attrs
 * @license MIT
 */

import { getTextWithNewlines, setMultilineText } from './dom-utils.js'

export const init = canvas => {
  const svgCanvas = canvas // per-instance; methods below are closed over it

  const getSelectedTextElements = () => {
    return svgCanvas.getSelectedElements().filter(el => el?.tagName === 'text')
  }

  const getChangedTextElements = (textElements, attr, newValue) => {
    const normalizedValue = String(newValue)
    return textElements.filter((elem) => {
      const oldValue = attr === '#text' ? elem.textContent : elem.getAttribute(attr)
      return (oldValue || '') !== normalizedValue
    })
  }

  const notifyTextChange = (textElements) => {
    if (textElements.length > 0) {
      svgCanvas.call('changed', textElements)
    }
  }

  /**
 * Check if all selected text elements are in bold.
 * @function module:svgcanvas.SvgCanvas#getBold
 * @returns {boolean} `true` if all selected elements are bold, `false` otherwise.
 */
  const getBoldMethod = () => {
    const textElements = getSelectedTextElements()
    return textElements.every(el => el.getAttribute('font-weight') === 'bold')
  }

  /**
 * Make the selected element(s) bold or normal.
 * @function module:svgcanvas.SvgCanvas#setBold
 * @param {boolean} b - Indicates bold (`true`) or normal (`false`)
 * @returns {void}
 */
  const setBoldMethod = (b) => {
    const textElements = getSelectedTextElements()
    const value = b ? 'bold' : 'normal'
    const changedTextElements = getChangedTextElements(textElements, 'font-weight', value)
    if (changedTextElements.length > 0) {
      svgCanvas.changeSelectedAttribute('font-weight', value, changedTextElements)
    }
    if (!textElements.some(el => el.textContent)) {
      svgCanvas.textActions.setCursor()
    }
    notifyTextChange(changedTextElements)
  }

  /**
 * Check if all selected text elements have the given text decoration value or not.
 * @returns {boolean} Indicates whether or not elements have the text decoration value
 */
  const hasTextDecorationMethod = (value) => {
    const textElements = getSelectedTextElements()
    return textElements.every(el => (el.getAttribute('text-decoration') || '').includes(value))
  }

  /**
 * Adds the given text decoration value
 * @param value The text decoration value
 * @returns {void}
 */
  const addTextDecorationMethod = (value) => {
    const { ChangeElementCommand, BatchCommand } = svgCanvas.history
    const textElements = getSelectedTextElements()

    const batchCmd = new BatchCommand()
    textElements.forEach(elem => {
      const oldValue = elem.getAttribute('text-decoration') || ''
      // Add the new text decoration value if it did not exist
      if (!oldValue.includes(value)) {
        batchCmd.addSubCommand(new ChangeElementCommand(elem, { 'text-decoration': oldValue }))
        svgCanvas.changeSelectedAttributeNoUndo('text-decoration', `${oldValue} ${value}`.trim(), [elem])
      }
    })
    if (!batchCmd.isEmpty()) {
      svgCanvas.undoMgr.addCommandToHistory(batchCmd)
    }

    if (!textElements.some(el => el.textContent)) {
      svgCanvas.textActions.setCursor()
    }
  }

  /**
 * Removes the given text decoration value
 * @param value The text decoration value
 * @returns {void}
 */
  const removeTextDecorationMethod = (value) => {
    const { ChangeElementCommand, BatchCommand } = svgCanvas.history
    const textElements = getSelectedTextElements()

    const batchCmd = new BatchCommand()
    textElements.forEach(elem => {
      const actualValues = elem.getAttribute('text-decoration') || ''
      batchCmd.addSubCommand(new ChangeElementCommand(elem, { 'text-decoration': actualValues }))
      svgCanvas.changeSelectedAttributeNoUndo('text-decoration', actualValues.replace(value, '').trim(), [elem])
    })
    if (!batchCmd.isEmpty()) {
      svgCanvas.undoMgr.addCommandToHistory(batchCmd)
    }

    if (!textElements.some(el => el.textContent)) {
      svgCanvas.textActions.setCursor()
    }
  }

  /**
 * Check if all selected elements have an italic font style.
 * @function module:svgcanvas.SvgCanvas#getItalic
 * @returns {boolean} `true` if all selected elements are in italics, `false` otherwise.
 */
  const getItalicMethod = () => {
    const textElements = getSelectedTextElements()
    return textElements.every(el => el.getAttribute('font-style') === 'italic')
  }

  /**
 * Make the selected element(s) italic or normal.
 * @function module:svgcanvas.SvgCanvas#setItalic
 * @param {boolean} i - Indicates italic (`true`) or normal (`false`)
 * @returns {void}
 */
  const setItalicMethod = (i) => {
    const textElements = getSelectedTextElements()
    const value = i ? 'italic' : 'normal'
    const changedTextElements = getChangedTextElements(textElements, 'font-style', value)
    if (changedTextElements.length > 0) {
      svgCanvas.changeSelectedAttribute('font-style', value, changedTextElements)
    }
    if (!textElements.some(el => el.textContent)) {
      svgCanvas.textActions.setCursor()
    }
    notifyTextChange(changedTextElements)
  }

  /**
 * @function module:svgcanvas.SvgCanvas#setTextAnchorMethod Set the new text anchor
 * @param {string} value - The text anchor value (start, middle or end)
 * @returns {void}
 */
  const setTextAnchorMethod = (value) => {
    const textElements = getSelectedTextElements()
    const changedTextElements = getChangedTextElements(textElements, 'text-anchor', value)
    if (changedTextElements.length > 0) {
      svgCanvas.changeSelectedAttribute('text-anchor', value, changedTextElements)
    }
    // Alignment shifts every glyph's x, so re-measure the caret while editing.
    if (svgCanvas.getCurrentMode() === 'textedit') {
      svgCanvas.textActions.init()
      svgCanvas.textActions.setCursor()
    }
    notifyTextChange(changedTextElements)
  }

  /**
 * @function module:svgcanvas.SvgCanvas#setLetterSpacingMethod Set the new letter spacing
 * @param {string} value - The letter spacing value
 * @returns {void}
 */
  const setLetterSpacingMethod = (value) => {
    const textElements = getSelectedTextElements()
    const changedTextElements = getChangedTextElements(textElements, 'letter-spacing', value)
    if (changedTextElements.length > 0) {
      svgCanvas.changeSelectedAttribute('letter-spacing', value, changedTextElements)
    }
    if (!textElements.some(el => el.textContent)) {
      svgCanvas.textActions.setCursor()
    }
    notifyTextChange(changedTextElements)
  }

  /**
 * @function module:svgcanvas.SvgCanvas#setWordSpacingMethod Set the new word spacing
 * @param {string} value - The word spacing value
 * @returns {void}
 */
  const setWordSpacingMethod = (value) => {
    const textElements = getSelectedTextElements()
    const changedTextElements = getChangedTextElements(textElements, 'word-spacing', value)
    if (changedTextElements.length > 0) {
      svgCanvas.changeSelectedAttribute('word-spacing', value, changedTextElements)
    }
    if (!textElements.some(el => el.textContent)) {
      svgCanvas.textActions.setCursor()
    }
    notifyTextChange(changedTextElements)
  }

  /**
 * @function module:svgcanvas.SvgCanvas#setTextLengthMethod Set the new text length
 * @param {string} value - The text length value
 * @returns {void}
 */
  const setTextLengthMethod = (value) => {
    const textElements = getSelectedTextElements()
    const changedTextElements = getChangedTextElements(textElements, 'textLength', value)
    if (changedTextElements.length > 0) {
      svgCanvas.changeSelectedAttribute('textLength', value, changedTextElements)
    }
    if (!textElements.some(el => el.textContent)) {
      svgCanvas.textActions.setCursor()
    }
    notifyTextChange(changedTextElements)
  }

  /**
 * @function module:svgcanvas.SvgCanvas#setLengthAdjustMethod Set the new length adjust
 * @param {string} value - The length adjust value
 * @returns {void}
 */
  const setLengthAdjustMethod = (value) => {
    const textElements = getSelectedTextElements()
    const changedTextElements = getChangedTextElements(textElements, 'lengthAdjust', value)
    if (changedTextElements.length > 0) {
      svgCanvas.changeSelectedAttribute('lengthAdjust', value, changedTextElements)
    }
    if (!textElements.some(el => el.textContent)) {
      svgCanvas.textActions.setCursor()
    }
    notifyTextChange(changedTextElements)
  }

  // ─── Text Perspective ────────────────────────────────────────────────────────

  /**
 * Build the CSS 3D transform string from both perspective angles (in degrees).
 *
 * Naming convention:
 *   degX  = "X perspective" = make left/right sides differ in depth
 *           → achieved by rotating around the VERTICAL (Y) axis → rotateY
 *   degY  = "Y perspective" = make top/bottom sides differ in depth
 *           → achieved by rotating around the HORIZONTAL (X) axis → rotateX
 *
 * The rotation axis is always perpendicular to the perspective direction.
 */
  const buildPerspectiveTransform = (degX, degY, bbox) => {
    const x = Number(degX) || 0
    const y = Number(degY) || 0
    if (x === 0 && y === 0) return ''

    // Scale the perspective distance to the element's own dimensions so the
    // visual effect at any slider value is consistent regardless of text size.
    // Using 1.5× the relevant dimension gives ≈2:1 height ratio (close vs far
    // side) at the maximum ±80° slider value, and the formula never approaches
    // singularity within that range.
    //
    //   For X perspective: d relative to width  (rotateY spans the width)
    //   For Y perspective: d relative to height (rotateX spans the height)
    //   For both active:   arithmetic mean of the two
    const dX = Math.max(bbox.width * 1.5, 50)
    const dY = Math.max(bbox.height * 1.5, 50)
    const d = (x !== 0 && y !== 0)
      ? Math.round((dX + dY) / 2)
      : Math.round(x !== 0 ? dX : dY)

    const parts = [`perspective(${d}px)`]
    if (x !== 0) parts.push(`rotateY(${x}deg)`) // X perspective → rotate around Y axis
    if (y !== 0) parts.push(`rotateX(${y}deg)`) // Y perspective → rotate around X axis
    return parts.join(' ')
  }

  /**
 * Set or remove the perspective CSS declarations within a style string.
 * cx/cy are the element's centre in SVG user-space coordinates; using them as
 * an explicit `transform-origin` keeps the element anchored to its current
 * position regardless of browser handling of `transform-box`.
 */
  const setTransformInStyle = (styleStr, transformValue, cx, cy) => {
    const parts = (styleStr || '').split(';')
      .map(s => s.trim())
      .filter(s => s &&
      !s.startsWith('transform:') &&
      !s.startsWith('transform-box:') &&
      !s.startsWith('transform-origin:') &&
      !s.startsWith('backface-visibility:'))
    if (transformValue) {
      parts.push(`transform:${transformValue}`)
      parts.push(`transform-origin:${cx}px ${cy}px`)
      parts.push('backface-visibility:hidden') // prevent back-face at extreme angles
    }
    return parts.join(';')
  }

  /**
 * Apply one axis of CSS perspective to all selected text elements, with undo.
 * @param {'x'|'y'} axis
 * @param {number|string} val - Degrees (-80…80)
 */
  const applyTextPerspective = (axis, val) => {
    const { ChangeElementCommand, BatchCommand } = svgCanvas.history
    const textElements = getSelectedTextElements()
    if (!textElements.length) return

    const batchCmd = new BatchCommand('Change text perspective')
    textElements.forEach(elem => {
      const attrKey = axis === 'x' ? 'data-perspective-x' : 'data-perspective-y'
      const otherKey = axis === 'x' ? 'data-perspective-y' : 'data-perspective-x'

      const oldAttr = elem.getAttribute(attrKey) || '0'
      const oldStyle = elem.getAttribute('style') || ''
      const otherVal = Number(elem.getAttribute(otherKey) || 0)

      const degX = axis === 'x' ? Number(val) : otherVal
      const degY = axis === 'y' ? Number(val) : otherVal

      // getBBox() returns the element's geometry in SVG user-space, unaffected by
      // CSS transforms. Using the resulting centre as an explicit transform-origin
      // keeps the element anchored regardless of browser transform-box behaviour.
      const bbox = elem.getBBox()
      const cx = bbox.x + bbox.width / 2
      const cy = bbox.y + bbox.height / 2

      elem.setAttribute(attrKey, val)
      const newTransform = buildPerspectiveTransform(degX, degY, bbox)
      elem.setAttribute('style', setTransformInStyle(oldStyle, newTransform, cx, cy))

      // ChangeElementCommand stores OLD values so undo can restore them
      batchCmd.addSubCommand(new ChangeElementCommand(elem, { [attrKey]: oldAttr, style: oldStyle }))
    })

    if (!batchCmd.isEmpty()) svgCanvas.addCommandToHistory(batchCmd)
  }

  /**
 * Set horizontal perspective (rotateY) on selected text elements.
 * @function module:svgcanvas.SvgCanvas#setTextPerspectiveX
 * @param {number} val - Degrees; positive = right side closer
 */
  const setTextPerspectiveXMethod = (val) => applyTextPerspective('x', val)

  /**
 * Set vertical perspective (rotateX) on selected text elements.
 * @function module:svgcanvas.SvgCanvas#setTextPerspectiveY
 * @param {number} val - Degrees; positive = bottom closer
 */
  const setTextPerspectiveYMethod = (val) => applyTextPerspective('y', val)

  /**
 * Get current horizontal perspective value from element.
 * @function module:svgcanvas.SvgCanvas#getTextPerspectiveX
 * @param {Element} elem
 * @returns {number}
 */
  const getTextPerspectiveXMethod = (elem) => Number(elem?.getAttribute('data-perspective-x') || 0)

  /**
 * Get current vertical perspective value from element.
 * @function module:svgcanvas.SvgCanvas#getTextPerspectiveY
 * @param {Element} elem
 * @returns {number}
 */
  const getTextPerspectiveYMethod = (elem) => Number(elem?.getAttribute('data-perspective-y') || 0)

  // ─────────────────────────────────────────────────────────────────────────────

  /**
* @function module:svgcanvas.SvgCanvas#getFontFamily
* @returns {string} The current font family
*/
  const getFontFamilyMethod = () => {
    return svgCanvas.getCurText('font_family')
  }

  /**
* Set the new font family.
* @function module:svgcanvas.SvgCanvas#setFontFamily
* @param {string} val - String with the new font family
* @returns {void}
*/
  const setFontFamilyMethod = (val) => {
    const textElements = getSelectedTextElements()
    const changedTextElements = getChangedTextElements(textElements, 'font-family', val)
    svgCanvas.setCurText('font_family', val)
    if (changedTextElements.length > 0) {
      svgCanvas.changeSelectedAttribute('font-family', val, changedTextElements)
    }
    if (!textElements.some(el => el.textContent)) {
      svgCanvas.textActions.setCursor()
    }
    notifyTextChange(changedTextElements)
  }

  /**
* Set the new font color.
* @function module:svgcanvas.SvgCanvas#setFontColor
* @param {string} val - String with the new font color
* @returns {void}
*/
  const setFontColorMethod = (val) => {
    const textElements = getSelectedTextElements()
    const changedTextElements = getChangedTextElements(textElements, 'fill', val)
    svgCanvas.setCurText('fill', val)
    if (changedTextElements.length > 0) {
      svgCanvas.changeSelectedAttribute('fill', val, changedTextElements)
    }
    notifyTextChange(changedTextElements)
  }

  /**
* @function module:svgcanvas.SvgCanvas#getFontColor
* @returns {string} The current font color
*/
  const getFontColorMethod = () => {
    return svgCanvas.getCurText('fill')
  }

  /**
* @function module:svgcanvas.SvgCanvas#getFontSize
* @returns {Float} The current font size
*/
  const getFontSizeMethod = () => {
    return svgCanvas.getCurText('font_size')
  }

  /**
* Applies the given font size to the selected element.
* @function module:svgcanvas.SvgCanvas#setFontSize
* @param {Float} val - Float with the new font size
* @returns {void}
*/
  const setFontSizeMethod = (val) => {
    const textElements = getSelectedTextElements()
    const changedTextElements = getChangedTextElements(textElements, 'font-size', val)
    svgCanvas.setCurText('font_size', val)
    if (changedTextElements.length > 0) {
      svgCanvas.changeSelectedAttribute('font-size', val, changedTextElements)
    }
    // Re-flow multiline rows so line spacing tracks the new font size.
    changedTextElements.forEach((el) => {
      if (Array.from(el.children).some((c) => c.tagName === 'tspan')) {
        setMultilineTextMethod(el, getTextWithNewlinesMethod(el))
      }
    })
    if (!textElements.some(el => el.textContent)) {
      svgCanvas.textActions.setCursor()
    }
    notifyTextChange(changedTextElements)
  }

  /**
* Read a `<text>` element's content as a newline-joined string. Multiline text
* is stored as one `<tspan>` per row (SVG has no newline character), so this
* rebuilds the `\n`-separated value the edit buffer and undo history use. A
* single-line `<text>` (no tspans) falls back to plain `textContent`.
* @function module:svgcanvas.SvgCanvas#getTextWithNewlines
* @param {Element} elem - The `<text>` element
* @returns {string}
*/
  const getTextWithNewlinesMethod = (elem) => getTextWithNewlines(elem)

  /**
* Render a `\n`-separated string onto a `<text>` element. A single line is set
* as plain `textContent` (no tspans, keeping simple text clean); multiple lines
* become one absolutely-positioned `<tspan>` per row sharing the text's `x` (so
* `text-anchor` aligns them) and stepping `y` by the line height. Absolute `y`
* per row (rather than `dy` accumulation) is robust to blank rows and is what
* `recalculate` already bakes during move/scale.
* @function module:svgcanvas.SvgCanvas#setMultilineText
* @param {Element} elem - The `<text>` element
* @param {string} value - The new content, rows separated by `\n`
* @returns {void}
*/
  const setMultilineTextMethod = (elem, value) => {
    setMultilineText(elem, value, parseFloat(svgCanvas.getCurText('font_size')) || 16)
  }

  /**
* @function module:svgcanvas.SvgCanvas#getText
* @returns {string} The current text of the selected element (newline-joined for multiline)
*/
  const getTextMethod = () => {
    const selectedElements = svgCanvas.getSelectedElements()
    const selected = selectedElements[0]
    return (selected) ? getTextWithNewlinesMethod(selected) : ''
  }

  /**
* Updates the text element with the given string.
* @function module:svgcanvas.SvgCanvas#setTextContent
* @param {string} val - String with the new text
* @returns {void}
*/
  const setTextContentMethod = (val) => {
    svgCanvas.changeSelectedAttribute('#text', val)
    svgCanvas.textActions.init(val)
    svgCanvas.textActions.setCursor()
  }

  svgCanvas.getBold = getBoldMethod // Check whether selected element is bold or not.
  svgCanvas.setBold = setBoldMethod // Make the selected element bold or normal.
  svgCanvas.getItalic = getItalicMethod // Check whether selected element is in italics or not.
  svgCanvas.setItalic = setItalicMethod // Make the selected element italic or normal.
  svgCanvas.hasTextDecoration = hasTextDecorationMethod // Check whether the selected element has the given text decoration or not.
  svgCanvas.addTextDecoration = addTextDecorationMethod // Adds the given value to the text decoration
  svgCanvas.removeTextDecoration = removeTextDecorationMethod // Removes the given value from the text decoration
  svgCanvas.setTextAnchor = setTextAnchorMethod // Set the new text anchor.
  svgCanvas.setLetterSpacing = setLetterSpacingMethod // Set the new letter spacing.
  svgCanvas.setWordSpacing = setWordSpacingMethod // Set the new word spacing.
  svgCanvas.setTextLength = setTextLengthMethod // Set the new text length.
  svgCanvas.setLengthAdjust = setLengthAdjustMethod // Set the new length adjust.
  svgCanvas.setTextPerspectiveX = setTextPerspectiveXMethod // Set horizontal perspective on text.
  svgCanvas.setTextPerspectiveY = setTextPerspectiveYMethod // Set vertical perspective on text.
  svgCanvas.getTextPerspectiveX = getTextPerspectiveXMethod // Get current horizontal perspective value.
  svgCanvas.getTextPerspectiveY = getTextPerspectiveYMethod // Get current vertical perspective value.
  svgCanvas.getFontFamily = getFontFamilyMethod // The current font family
  svgCanvas.setFontFamily = setFontFamilyMethod // Set the new font family.
  svgCanvas.setFontColor = setFontColorMethod // Set the new font color.
  svgCanvas.getFontColor = getFontColorMethod // The current font color
  svgCanvas.getFontSize = getFontSizeMethod // The current font size
  svgCanvas.setFontSize = setFontSizeMethod // Applies the given font size to the selected element.
  svgCanvas.getText = getTextMethod // current text (newline-joined for multiline) of the selected element
  svgCanvas.getTextWithNewlines = getTextWithNewlinesMethod // newline-joined content of a `<text>` element
  svgCanvas.setMultilineText = setMultilineTextMethod // renders a `\n`-separated string as tspans
  svgCanvas.setTextContent = setTextContentMethod // Updates the text element with the given string.
}
