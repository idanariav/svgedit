/**
 * Text attribute operations (bold/italic/decoration, anchor and spacing,
 * perspective, font family/size/colour, text content), split out of
 * elem-get-set.js. Created per SvgCanvas instance and attached to the canvas.
 * @module text-attrs
 * @license MIT
 */

import { getTextWithNewlines, setMultilineText } from './dom-utils.ts'
import { registerGeometryRemap } from './geometry-remap-registry.ts'
import { registerAttrValidator, registerElementCheck } from './drawing-invariants.ts'
import { getBBox } from './bbox-utils.ts'
import {
  WRAP_WIDTH_ATTR, WRAP_HEIGHT_ATTR, VALIGN_ATTR, TEXT_ASCENT, getWrapWidth, getWrapHeight, writeAreaAttrs,
  reflowAreaText, settleAreaText, isAreaText, getAreaBox, makeAreaText, makePointText, rowsOf, softCount, SOFT_ATTR, getValign
} from './text-rows.ts'
import type SvgCanvas from '../svgcanvas.ts'

/** The members `text-attrs.ts` gives its canvas. */
export interface TextAttrsApi {
  /** Vertical alignment of the selected area texts inside their box (`se:valign`). */
  setTextValign(value: 'top' | 'middle' | 'bottom'): void
  getTextValign(elem: Element): 'top' | 'middle' | 'bottom'
  /** Selected point texts become area texts of their current width (one undo step); false when nothing changed. */
  /** Whether a `<text>` wraps to a box (`se:wrap-width`). */
  isAreaText(elem: Element | null | undefined): boolean
  makeAreaText(): boolean
  /** Selected area texts become point texts, the rows as drawn turning into hard rows (one undo step). */
  makePointText(): boolean
  // Text
  getBold(): boolean
  // Text (continued)
  setBold(b: boolean): void
  getItalic(): boolean
  setItalic(i: boolean): void
  hasTextDecoration(value: string): boolean
  addTextDecoration(value: string): void
  removeTextDecoration(value: string): void
  setTextAnchor(value: string): void
  setLetterSpacing(value: number | string): void
  setWordSpacing(value: number | string): void
  setTextLength(value: number | string): void
  setLengthAdjust(value: string): void
  setTextPerspectiveX(val: number | string): void
  setTextPerspectiveY(val: number | string): void
  getTextPerspectiveX(elem: Element): number
  getTextPerspectiveY(elem: Element): number
  setFontFamily(val: string): void
  setFontColor(val: string): void
  setFontSize(val: number | string): void
  getText(): string
  getTextWithNewlines(elem: Element): string
  setMultilineText(elem: Element, value: string): void
  setTextContent(val: string): void
}

export const createTextAttrs = (canvas: SvgCanvas): TextAttrsApi => {
  const svgCanvas = canvas // per-instance; methods below are closed over it

  // A transform bake that scales the type (a group scale, a rotated resize) scales an area text's box with
  // it. Both attributes are registered so the bake records them for undo; the width hook runs last and
  // lays the rows out again.
  registerGeometryRemap(WRAP_HEIGHT_ATTR, (elem, _remap, _scalew, scaleh) => {
    const h = getWrapHeight(elem)
    if (h) writeAreaAttrs(elem, { [WRAP_HEIGHT_ATTR]: Math.abs(scaleh(h)) })
  })
  // A web font that finishes loading after the first layout changes every measurement: wrap the area texts
  // again (not an undo step; the rows are derived).
  if (typeof document !== 'undefined' && document.fonts?.addEventListener) {
    document.fonts.addEventListener('loadingdone', () => {
      for (const el of svgCanvas.getSvgContent()?.getElementsByTagName('text') ?? []) settleAreaText(el)
    }, { signal: svgCanvas.destroyAbort?.signal })
  }

  const positive = (value: string): true | string => (parseFloat(value) > 0 ? true : 'is not a positive number')
  registerAttrValidator(WRAP_WIDTH_ATTR, positive)
  registerAttrValidator(WRAP_HEIGHT_ATTR, positive)
  registerAttrValidator(VALIGN_ATTR, (value) => (['top', 'middle', 'bottom'].includes(value) ? true : 'is not top, middle or bottom'))
  registerAttrValidator(SOFT_ATTR, (value) => (/^\d+$/.test(value) ? true : 'is not a count of spaces'))
  // Soft rows only make sense inside a box, and never start a text. (The checks run on elements that carry
  // `se:` state: a soft row is the tspan, the box is the text.)
  registerElementCheck('area-text', (elem) => {
    const problems = []
    if (elem.localName === 'tspan' && softCount(elem) !== null) {
      const parent = elem.parentElement
      if (!parent || !isAreaText(parent)) problems.push('is a soft row of a text that has no se:wrap-width')
      else if (rowsOf(parent)[0] === elem) problems.push('is a soft row but starts the text')
    }
    if (elem.localName === 'text' && getWrapWidth(elem) > 0 && elem.getElementsByTagName('textPath').length) {
      problems.push('is area text on a path')
    }
    return problems
  })
  registerGeometryRemap(WRAP_WIDTH_ATTR, (elem, _remap, scalew) => {
    writeAreaAttrs(elem, { [WRAP_WIDTH_ATTR]: Math.abs(scalew(getWrapWidth(elem))) })
    reflowAreaText(elem)
  })

  const getSelectedTextElements = (): SVGTextElement[] => {
    return svgCanvas.getSelectedElements().filter((el) => el?.tagName === 'text') as SVGTextElement[]
  }

  const getChangedTextElements = <T extends Element>(textElements: T[], attr: string, newValue: unknown): T[] => {
    const normalizedValue = String(newValue)
    return textElements.filter((elem) => {
      const oldValue = attr === '#text' ? elem.textContent : elem.getAttribute(attr)
      return (oldValue || '') !== normalizedValue
    })
  }

  const notifyTextChange = (textElements: Element[]): void => {
    if (textElements.length > 0) {
      svgCanvas.call('changed', textElements)
    }
  }

  /**
 * Check if all selected text elements are in bold.
 * @returns {boolean} `true` if all selected elements are bold, `false` otherwise.
 */
  const getBoldMethod = (): boolean => {
    const textElements = getSelectedTextElements()
    return textElements.every(el => el.getAttribute('font-weight') === 'bold')
  }

  /**
 * Make the selected element(s) bold or normal.
 * @param b - Indicates bold (`true`) or normal (`false`)
 */
  const setBoldMethod = (b: boolean): void => {
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
 * @returns Indicates whether or not elements have the text decoration value
 */
  const hasTextDecorationMethod = (value: string): boolean => {
    const textElements = getSelectedTextElements()
    return textElements.every(el => (el.getAttribute('text-decoration') || '').includes(value))
  }

  /**
 * Adds the given text decoration value
 * @param value The text decoration value
 */
  const addTextDecorationMethod = (value: string): void => {
    const textElements = getSelectedTextElements()

    // One transaction instead of a hand-built batch: the old code built each
    // ChangeElementCommand before changing the attribute, and that command reads
    // the new value from the DOM at construction, so redo re-applied the old one.
    svgCanvas.transact('Add text decoration', () => {
      textElements.forEach(elem => {
        const oldValue = elem.getAttribute('text-decoration') || ''
        // Add the new text decoration value if it did not exist
        if (!oldValue.includes(value)) {
          svgCanvas.changeSelectedAttributeNoUndo('text-decoration', `${oldValue} ${value}`.trim(), [elem])
        }
      })
    })

    if (!textElements.some(el => el.textContent)) {
      svgCanvas.textActions.setCursor()
    }
  }

  /**
 * Removes the given text decoration value
 * @param value The text decoration value
 */
  const removeTextDecorationMethod = (value: string): void => {
    const textElements = getSelectedTextElements()

    svgCanvas.transact('Remove text decoration', () => {
      textElements.forEach(elem => {
        const actualValues = elem.getAttribute('text-decoration') || ''
        svgCanvas.changeSelectedAttributeNoUndo('text-decoration', actualValues.replace(value, '').trim(), [elem])
      })
    })

    if (!textElements.some(el => el.textContent)) {
      svgCanvas.textActions.setCursor()
    }
  }

  /**
 * Check if all selected elements have an italic font style.
 * @returns {boolean} `true` if all selected elements are in italics, `false` otherwise.
 */
  const getItalicMethod = (): boolean => {
    const textElements = getSelectedTextElements()
    return textElements.every(el => el.getAttribute('font-style') === 'italic')
  }

  /**
 * Make the selected element(s) italic or normal.
 * @param i - Indicates italic (`true`) or normal (`false`)
 */
  const setItalicMethod = (i: boolean): void => {
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
 * @param value - The text anchor value (start, middle or end)
 */
  const setTextAnchorMethod = (value: string): void => {
    const textElements = getSelectedTextElements()
    const changedTextElements = getChangedTextElements(textElements, 'text-anchor', value)
    if (changedTextElements.length > 0) {
      const areas = changedTextElements.filter(isAreaText)
      if (areas.length) {
        // The box stays where it is: `x` is the anchor, so it moves with the alignment.
        const lefts = areas.map((el) => getAreaBox(el).x)
        const factor = ({ start: 0, middle: 0.5, end: 1 } as Record<string, number>)[value] ?? 0
        svgCanvas.transact('Text alignment', () => {
          areas.forEach((el, i) => {
            svgCanvas.changeSelectedAttributeNoUndo('x', lefts[i] + factor * getWrapWidth(el), [el])
          })
          svgCanvas.changeSelectedAttribute('text-anchor', value, changedTextElements)
        })
      } else {
        svgCanvas.changeSelectedAttribute('text-anchor', value, changedTextElements)
      }
    }
    // Alignment shifts every glyph's x, so re-measure the caret while editing.
    if (svgCanvas.getCurrentMode() === 'textedit') {
      svgCanvas.textActions.init()
      svgCanvas.textActions.setCursor()
    }
    notifyTextChange(changedTextElements)
  }

  /**
 * @param value - The letter spacing value
 */
  const setLetterSpacingMethod = (value: string): void => {
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
 * @param value - The word spacing value
 */
  const setWordSpacingMethod = (value: string): void => {
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
 * @param value - The text length value
 */
  const setTextLengthMethod = (value: string): void => {
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
 * @param value - The length adjust value
 */
  const setLengthAdjustMethod = (value: string): void => {
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
  const buildPerspectiveTransform = (degX: unknown, degY: unknown, bbox: { width: number, height: number }): string => {
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
  const setTransformInStyle = (styleStr: string | null, transformValue: string, cx: number, cy: number): string => {
    const parts = (styleStr || '').split(';')
      .map((s) => s.trim())
      .filter((s) => s &&
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
 * @param val - Degrees (-80…80)
 */
  const applyTextPerspective = (axis: 'x' | 'y', val: number | string): void => {
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

      elem.setAttribute(attrKey, String(val))
      const newTransform = buildPerspectiveTransform(degX, degY, bbox)
      elem.setAttribute('style', setTransformInStyle(oldStyle, newTransform, cx, cy))

      // ChangeElementCommand stores OLD values so undo can restore them
      batchCmd.addSubCommand(new ChangeElementCommand(elem, { [attrKey]: oldAttr, style: oldStyle }))
    })

    if (!batchCmd.isEmpty()) svgCanvas.addCommandToHistory(batchCmd)
  }

  /**
 * Set horizontal perspective (rotateY) on selected text elements.
 * @param val - Degrees; positive = right side closer
 */
  const setTextPerspectiveXMethod = (val: number | string): void => applyTextPerspective('x', val)

  /**
 * Set vertical perspective (rotateX) on selected text elements.
 * @param val - Degrees; positive = bottom closer
 */
  const setTextPerspectiveYMethod = (val: number | string): void => applyTextPerspective('y', val)

  /**
 * Get current horizontal perspective value from element.
 */
  const getTextPerspectiveXMethod = (elem: Element): number => Number(elem?.getAttribute('data-perspective-x') || 0)

  /**
 * Get current vertical perspective value from element.
 */
  const getTextPerspectiveYMethod = (elem: Element): number => Number(elem?.getAttribute('data-perspective-y') || 0)

  // ─────────────────────────────────────────────────────────────────────────────

  /**
* Set the new font family.
* @param val - String with the new font family
*/
  const setFontFamilyMethod = (val: string): void => {
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
* @param val - String with the new font color
*/
  const setFontColorMethod = (val: string): void => {
    const textElements = getSelectedTextElements()
    const changedTextElements = getChangedTextElements(textElements, 'fill', val)
    svgCanvas.setCurText('fill', val)
    if (changedTextElements.length > 0) {
      svgCanvas.changeSelectedAttribute('fill', val, changedTextElements)
    }
    notifyTextChange(changedTextElements)
  }

  /**
* Applies the given font size to the selected element.
* @param val - number with the new font size
*/
  const setFontSizeMethod = (val: number | string): void => {
    const textElements = getSelectedTextElements()
    const changedTextElements = getChangedTextElements(textElements, 'font-size', val)
    svgCanvas.setCurText('font_size', val)
    if (changedTextElements.length > 0) {
      const areas = changedTextElements.filter(isAreaText)
      if (areas.length) {
        // The box stays where it is: the first baseline sits an ascent below its top.
        const tops = areas.map((el) => getAreaBox(el).y)
        svgCanvas.transact('Font size', () => {
          areas.forEach((el, i) => {
            svgCanvas.changeSelectedAttributeNoUndo('y', tops[i] + TEXT_ASCENT * parseFloat(String(val)), [el])
          })
          svgCanvas.changeSelectedAttribute('font-size', val, changedTextElements)
        })
      } else {
        svgCanvas.changeSelectedAttribute('font-size', val, changedTextElements)
      }
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
* @param elem - The `<text>` element
*/
  const getTextWithNewlinesMethod = (elem: Element): string => getTextWithNewlines(elem)

  /**
* Render a `\n`-separated string onto a `<text>` element. A single line is set
* as plain `textContent` (no tspans, keeping simple text clean); multiple lines
* become one absolutely-positioned `<tspan>` per row sharing the text's `x` (so
* `text-anchor` aligns them) and stepping `y` by the line height. Absolute `y`
* per row (rather than `dy` accumulation) is robust to blank rows and is what
* `recalculate` already bakes during move/scale.
* @param elem - The `<text>` element
* @param value - The new content, rows separated by `\n`
*/
  const setMultilineTextMethod = (elem: Element, value: string): void => {
    setMultilineText(elem, value, parseFloat(String(svgCanvas.getCurText('font_size'))) || 16)
  }

  /**
* @returns The current text of the selected element (newline-joined for multiline)
*/
  const getTextMethod = (): string => {
    const selectedElements = svgCanvas.getSelectedElements()
    const selected = selectedElements[0]
    return (selected) ? getTextWithNewlinesMethod(selected) : ''
  }

  /**
* Updates the text element with the given string.
* @param val - String with the new text
*/
  const setTextContentMethod = (val: string): void => {
    svgCanvas.changeSelectedAttribute('#text', val)
    svgCanvas.textActions.init()
    svgCanvas.textActions.setCursor()
  }

  /**
 * Vertical alignment of the selected area texts inside their box.
 */
  const setTextValignMethod = (value: 'top' | 'middle' | 'bottom'): void => {
    const areas = getSelectedTextElements().filter(isAreaText)
    const changed = areas.filter((el) => getValign(el) !== value)
    if (changed.length) {
      svgCanvas.transact('Vertical alignment', () => {
        changed.forEach((el) => {
          writeAreaAttrs(el, { [VALIGN_ATTR]: value === 'top' ? null : value })
          reflowAreaText(el)
        })
      })
      notifyTextChange(changed)
    }
  }

  /**
 * Turn the selected point texts into area texts of the width they have now (nothing moves).
 * @returns Whether anything changed
 */
  const makeAreaTextMethod = (): boolean => {
    const elems = getSelectedTextElements().filter((el) => !isAreaText(el))
    if (!elems.length) { return false }
    let changed = false
    svgCanvas.transact('Area text', () => {
      elems.forEach((el) => { changed = makeAreaText(el, getBBox(el)?.width ?? 0) || changed })
    })
    elems.forEach((el) => svgCanvas.selectorManager.requestSelector(el).resize())
    notifyTextChange(elems)
    return changed
  }

  /**
 * Turn the selected area texts back into point texts; the rows as drawn become hard rows.
 * @returns Whether anything changed
 */
  const makePointTextMethod = (): boolean => {
    const elems = getSelectedTextElements().filter(isAreaText)
    if (!elems.length) { return false }
    svgCanvas.transact('Point text', () => elems.forEach(makePointText))
    elems.forEach((el) => svgCanvas.selectorManager.requestSelector(el).resize())
    notifyTextChange(elems)
    return true
  }

  return {
    setTextValign: setTextValignMethod,
    getTextValign: getValign,
    isAreaText, // whether a `<text>` wraps to a box (`se:wrap-width`)
    makeAreaText: makeAreaTextMethod,
    makePointText: makePointTextMethod,
    getBold: getBoldMethod, // Check whether selected element is bold or not.
    setBold: setBoldMethod, // Make the selected element bold or normal.
    getItalic: getItalicMethod, // Check whether selected element is in italics or not.
    setItalic: setItalicMethod, // Make the selected element italic or normal.
    hasTextDecoration: hasTextDecorationMethod, // Check whether the selected element has the given text decoration or not.
    addTextDecoration: addTextDecorationMethod, // Adds the given value to the text decoration
    removeTextDecoration: removeTextDecorationMethod, // Removes the given value from the text decoration
    setTextAnchor: setTextAnchorMethod, // Set the new text anchor.
    setLetterSpacing: setLetterSpacingMethod, // Set the new letter spacing.
    setWordSpacing: setWordSpacingMethod, // Set the new word spacing.
    setTextLength: setTextLengthMethod, // Set the new text length.
    setLengthAdjust: setLengthAdjustMethod, // Set the new length adjust.
    setTextPerspectiveX: setTextPerspectiveXMethod, // Set horizontal perspective on text.
    setTextPerspectiveY: setTextPerspectiveYMethod, // Set vertical perspective on text.
    getTextPerspectiveX: getTextPerspectiveXMethod, // Get current horizontal perspective value.
    getTextPerspectiveY: getTextPerspectiveYMethod, // Get current vertical perspective value.
    setFontFamily: setFontFamilyMethod, // Set the new font family.
    setFontColor: setFontColorMethod, // Set the new font color.
    setFontSize: setFontSizeMethod, // Applies the given font size to the selected element.
    getText: getTextMethod, // current text (newline-joined for multiline) of the selected element
    getTextWithNewlines: getTextWithNewlinesMethod, // newline-joined content of a `<text>` element
    setMultilineText: setMultilineTextMethod, // renders a `\n`-separated string as tspans
    setTextContent: setTextContentMethod // Updates the text element with the given string.
  }
}
