// @ts-check
/**
 * Text on path — attach a `<text>` element's content to a path so the text
 * flows along it, and detach it back to plain text.
 *
 * The attach rebuilds the text as `<text><textPath …>content</textPath></text>`
 * referencing the rail by id (both `href` and `xlink:href` are written for
 * cross-browser support; the sanitize whitelist already allows `textPath`).
 * A non-`<path>` rail (rect/ellipse/polygon/…) is swapped for its path
 * equivalent in the same batch, since `textPath` can only follow a real
 * `<path>`. Structural rebuilds use Remove+Insert command pairs
 * (boolean-ops precedent) so undo/redo restores the exact original nodes.
 *
 * Caveats (v1): multi-line text is flattened to one line (SVG text-on-path is
 * single-line by nature); glyphs past the end of an open rail are clipped by
 * the renderer. Deleting or replacing (Stroke to Path, Offset) the rail turns
 * its text back into plain text in the same undo step (`releaseTextOnPath`).
 *
 * @module text-path
 * @license MIT
 */

import { NS } from './namespaces.js'
import { getPathDFromElement } from './path-utils.js'
import { warn } from '../common/logger.js'

// Geometry attributes dropped when a shape is rebuilt as a different tag.
const SHAPE_GEOM_ATTRS = ['x', 'y', 'width', 'height', 'rx', 'ry', 'cx', 'cy', 'r', 'points', 'x1', 'y1', 'x2', 'y2', 'd']

export const init = (canvas) => {
  const svgCanvas = canvas

  /** The selected text + rail pair, or null. */
  const findPair = () => {
    const elems = svgCanvas.getSelectedElements().filter(Boolean)
    if (elems.length !== 2) return null
    const text = elems.find((el) => el.tagName === 'text')
    const rail = elems.find((el) => el !== text)
    if (!text || !rail || text.querySelector('textPath')) return null
    if (rail.tagName !== 'path' && !getPathDFromElement(rail)) return null
    if (['text', 'image', 'g', 'use'].includes(rail.tagName)) return null
    return { text, rail }
  }

  /** Whether "put text on path" applies to the current selection. */
  const canTextOnPath = () => !!findPair()

  /** The selected element's textPath child, or null. */
  const getTextPath = () => {
    const [elem] = svgCanvas.getSelectedElements().filter(Boolean)
    return elem?.tagName === 'text' ? elem.querySelector('textPath') : null
  }

  /**
   * Attach the selected text to the selected shape as one undo step.
   * @returns {?Element} The new text element.
   */
  const attachTextToPath = () => {
    const pair = findPair()
    if (!pair) {
      warn('Text on path needs one text element and one shape selected', null, 'text-path')
      return null
    }
    let { text, rail } = pair
    const { BatchCommand, InsertElementCommand, RemoveElementCommand } = svgCanvas.history
    const batchCmd = new BatchCommand('Text on path')
    const doc = text.ownerDocument

    // textPath can only follow a real <path> — swap other shapes for one.
    if (rail.tagName !== 'path') {
      const d = getPathDFromElement(rail)
      const path = doc.createElementNS(NS.SVG, 'path')
      for (const attr of rail.attributes) {
        if (SHAPE_GEOM_ATTRS.includes(attr.name)) continue
        path.setAttribute(attr.name, attr.value)
      }
      path.setAttribute('d', d)
      path.id = svgCanvas.getNextId()
      rail.before(path)
      batchCmd.addSubCommand(new InsertElementCommand(path))
      batchCmd.addSubCommand(new RemoveElementCommand(rail, rail.nextSibling, rail.parentNode))
      rail.remove()
      rail = path
    }

    // Rebuild the text with a textPath child. Multi-line rows flatten to one
    // line, joined by spaces.
    const rows = text.querySelectorAll('tspan')
    const content = rows.length
      ? Array.from(rows).map((t) => t.textContent).join(' ')
      : text.textContent
    const newText = doc.createElementNS(NS.SVG, 'text')
    for (const attr of text.attributes) {
      if (['x', 'y'].includes(attr.name)) continue
      newText.setAttribute(attr.name, attr.value)
    }
    newText.id = svgCanvas.getNextId()
    const tp = doc.createElementNS(NS.SVG, 'textPath')
    tp.setAttribute('href', `#${rail.id}`)
    tp.setAttributeNS(NS.XLINK, 'xlink:href', `#${rail.id}`)
    tp.setAttribute('startOffset', '0%')
    tp.textContent = content
    newText.append(tp)
    text.before(newText)
    batchCmd.addSubCommand(new InsertElementCommand(newText))
    batchCmd.addSubCommand(new RemoveElementCommand(text, text.nextSibling, text.parentNode))
    text.remove()

    svgCanvas.addCommandToHistory(batchCmd)
    svgCanvas.selectOnly([newText], true)
    svgCanvas.call('changed', [newText])
    return newText
  }

  /**
   * Replace a text-on-path with plain text at its current rendered position
   * (baseline of the first glyph). Must run while the rail is still in the
   * document (the position is read from the laid-out glyphs). Records the
   * swap in `batchCmd`; does not touch history or the selection.
   * @param {Element} elem the `<text>` holding a `<textPath>`
   * @param {import('./history.js').BatchCommand} batchCmd
   * @returns {Element} The new plain text element.
   */
  const plainifyTextPath = (elem, batchCmd) => {
    const { InsertElementCommand, RemoveElementCommand } = svgCanvas.history
    const tp = /** @type {Element} */ (elem.querySelector('textPath'))
    const doc = elem.ownerDocument

    let x = 0
    let y = 0
    try {
      const pt = /** @type {any} */ (elem).getStartPositionOfChar(0)
      x = pt.x
      y = pt.y
    } catch {
      try {
        const bb = /** @type {any} */ (elem).getBBox()
        x = bb.x
        y = bb.y + bb.height
      } catch { /* keep 0,0 */ }
    }

    const newText = doc.createElementNS(NS.SVG, 'text')
    for (const attr of elem.attributes) {
      newText.setAttribute(attr.name, attr.value)
    }
    newText.id = svgCanvas.getNextId()
    newText.setAttribute('x', String(x))
    newText.setAttribute('y', String(y))
    newText.textContent = tp.textContent
    elem.before(newText)
    batchCmd.addSubCommand(new InsertElementCommand(newText))
    batchCmd.addSubCommand(new RemoveElementCommand(elem, elem.nextSibling, elem.parentNode))
    elem.remove()
    return newText
  }

  /**
   * Detach the selected text from its path, planting it as plain text at its
   * current rendered position (baseline of the first glyph).
   * @returns {?Element} The new plain text element.
   */
  const detachTextFromPath = () => {
    const [elem] = svgCanvas.getSelectedElements().filter(Boolean)
    if (!elem?.querySelector?.('textPath')) return null
    const batchCmd = new svgCanvas.history.BatchCommand('Detach text from path')
    const newText = plainifyTextPath(elem, batchCmd)
    svgCanvas.addCommandToHistory(batchCmd)
    svgCanvas.selectOnly([newText], true)
    svgCanvas.call('changed', [newText])
    return newText
  }

  /**
   * Called before elements are deleted or replaced: every text that follows one
   * of them (or a descendant of one) becomes plain text in the same undo step,
   * instead of being left on a rail that no longer exists (it would stop
   * rendering and could no longer be selected).
   * @param {Element[]} removing the elements about to leave the document
   * @param {import('./history.js').BatchCommand} batchCmd receives the swap commands
   * @returns {Element[]} the new plain texts
   */
  const releaseTextOnPath = (removing, batchCmd) => {
    const ids = new Set()
    for (const el of removing) {
      if (el.id) ids.add(el.id)
      for (const d of el.querySelectorAll('[id]')) ids.add(d.id)
    }
    if (!ids.size) return []
    /** @type {Set<Element>} */
    const texts = new Set()
    for (const tp of svgCanvas.getSvgContent().querySelectorAll('textPath')) {
      const ref = svgCanvas.getHref(tp)
      const owner = tp.closest('text')
      // a text that is itself being removed needs no rescue
      if (ref?.startsWith('#') && ids.has(ref.slice(1)) && owner && !removing.some((r) => r === owner || r.contains(owner))) {
        texts.add(owner)
      }
    }
    return [...texts].map((text) => plainifyTextPath(text, batchCmd))
  }

  /**
   * Read/write the startOffset (%) of the selected text-on-path.
   * @param {number} [pct] - Omit to read.
   * @returns {?number}
   */
  const textPathOffset = (pct) => {
    const tp = getTextPath()
    if (!tp) return null
    if (pct === undefined) {
      return parseFloat(tp.getAttribute('startOffset')) || 0
    }
    const clamped = Math.max(0, Math.min(100, pct))
    const old = tp.getAttribute('startOffset')
    if (clamped === (parseFloat(old) || 0)) return clamped
    tp.setAttribute('startOffset', `${clamped}%`)
    svgCanvas.addCommandToHistory(
      new svgCanvas.history.ChangeElementCommand(tp, { startOffset: old })
    )
    const text = tp.closest('text')
    svgCanvas.gettingSelectorManager().requestSelector(text)?.resize()
    svgCanvas.call('changed', [text])
    return clamped
  }

  svgCanvas.attachTextToPath = attachTextToPath
  svgCanvas.detachTextFromPath = detachTextFromPath
  svgCanvas.releaseTextOnPath = releaseTextOnPath
  svgCanvas.canTextOnPath = canTextOnPath
  svgCanvas.textPathOffset = textPathOffset
}
