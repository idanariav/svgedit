/**
 * Tapered strokes — turn a stroked open path into a filled outline whose
 * width follows a start/middle/end profile (paper.js-assisted).
 *
 * Attribute-driven and non-destructive, mirroring core/corner-radius.js: the
 * original centerline `d` is kept as `se:taper-d`, the original stroke
 * width + paint as `se:taper-style` ("width|paint"), and the profile as
 * `se:taper="startPct,endPct"`. Re-applying regenerates the outline from the
 * stored centerline; removing restores the original stroked path. `se:`
 * attributes bypass the sanitize whitelist, so everything survives
 * save/load, and the tapered element is a plain filled `<path>` that renders
 * identically anywhere.
 *
 * The width profile is a quadratic Bézier through (0, start), (0.5, 1),
 * (1, end) — full width mid-stroke, the given fractions at the tips — so
 * 100→0 is a classic brush taper and 0→0 a spindle. The outline is built by
 * offsetting dense samples along the flattened centerline by ±width/2 along
 * the normal, closing the tips with round caps, then refitting compact
 * cubics via paper's `simplify()`.
 *
 * `remapTaperSource(elem, remap, scalew, scaleh)` is called from `coords.js`
 * `remapElement` when a transform is baked into a tapered path: it applies
 * the affine map to the stored centerline, scales the stored width, and
 * regenerates the outline — without it the next taper edit would teleport
 * the shape back to its pre-move geometry.
 *
 * @module taper-stroke
 * @license MIT
 */

import { NS } from './namespaces.js'
import { warn } from '../common/logger.js'
import { getPaperScope } from './paper-utils.js'

export const TAPER_ATTR = 'se:taper'
export const TAPER_SOURCE_ATTR = 'se:taper-d'
export const TAPER_STYLE_ATTR = 'se:taper-style'

/** Quadratic-Bézier width profile through (0,s), (0.5,1), (1,e). */
const profile = (t, s, e) => (1 - t) * (1 - t) * s + 2 * t * (1 - t) + t * t * e

const CAP_ANGLES = [30, 60, 90, 120, 150]

/**
 * Build the filled-outline `d` for a centerline with a tapered width.
 * @param {string} d - Centerline path data (single open subpath).
 * @param {Float} width - Full stroke width.
 * @param {Float} startPct - Tip width at the start, % of full (0–100).
 * @param {Float} endPct - Tip width at the end, % of full (0–100).
 * @returns {?string} Outline path data, or null when not taperable.
 */
export const buildTaperOutline = (d, width, startPct, endPct) => {
  const sc = getPaperScope()
  const compound = new sc.CompoundPath(d)
  try {
    const child = compound.children?.length ? compound.children[0] : compound
    if (!child.length || child.closed || !(width > 0)) return null
    const s = Math.max(0, Math.min(1, startPct / 100))
    const e = Math.max(0, Math.min(1, endPct / 100))
    const total = child.length
    const steps = Math.max(48, Math.min(220, Math.round(total / 3)))
    const left = []
    const right = []
    for (let i = 0; i <= steps; i++) {
      const t = i / steps
      const off = Math.min(total, total * t)
      const p = child.getPointAt(off)
      const n = child.getNormalAt(off)
      if (!p || !n) continue
      const hw = Math.max(0.01, width * profile(t, s, e)) / 2
      left.push(p.add(n.multiply(hw)))
      right.push(p.subtract(n.multiply(hw)))
    }
    if (left.length < 2) return null

    // Round caps at tips that still have width. The sweep sign is chosen so
    // rotating the normal passes through the outward tangent direction.
    const n0 = child.getNormalAt(0)
    const t0 = child.getTangentAt(0)
    const nE = child.getNormalAt(total)
    const sign = n0.rotate(90).subtract(t0).length < n0.rotate(-90).subtract(t0).length ? 1 : -1
    const p0 = child.getPointAt(0)
    const pE = child.getPointAt(total)
    const hw0 = Math.max(0.01, width * profile(0, s, e)) / 2
    const hwE = Math.max(0.01, width * profile(1, s, e)) / 2
    const endCap = e > 0.02
      ? CAP_ANGLES.map((a) => pE.add(nE.multiply(hwE).rotate(sign * a)))
      : []
    const startCap = s > 0.02
      ? CAP_ANGLES.map((a) => p0.add(n0.multiply(-hw0).rotate(sign * a)))
      : []

    const outline = new sc.Path({
      segments: [...left, ...endCap, ...right.reverse(), ...startCap],
      closed: true
    })
    outline.simplify(0.4)
    const out = outline.pathData
    outline.remove()
    return out || null
  } catch (err) {
    warn('Taper outline failed', err, 'taper-stroke')
    return null
  } finally {
    compound.remove()
  }
}

/**
 * Called from `remapElement` (coords.js) when a transform is baked into a
 * tapered path: apply the affine map to the stored centerline, scale the
 * stored width, regenerate the outline `d`.
 * @param {Element} elem
 * @param {Function} remap - `(x, y) → {x, y}` from remapElement.
 * @param {Function} scalew
 * @param {Function} scaleh
 * @returns {void}
 */
export const remapTaperSource = (elem, remap, scalew, scaleh) => {
  const src = elem.getAttribute(TAPER_SOURCE_ATTR)
  const style = elem.getAttribute(TAPER_STYLE_ATTR)
  if (!src || !style) return
  const sc = getPaperScope()
  // Probe the affine map to rebuild it as a paper Matrix.
  const o = remap(0, 0)
  const px = remap(1, 0)
  const py = remap(0, 1)
  const matrix = new sc.Matrix(px.x - o.x, px.y - o.y, py.x - o.x, py.y - o.y, o.x, o.y)
  const compound = new sc.CompoundPath(src)
  compound.transform(matrix)
  const newSrc = compound.pathData
  compound.remove()
  if (!newSrc) return

  const sep = style.indexOf('|')
  const width = (parseFloat(style.slice(0, sep)) || 1) *
    Math.sqrt(Math.abs(scalew(1) * scaleh(1)))
  const paint = style.slice(sep + 1)
  const [start = 100, end = 0] = (elem.getAttribute(TAPER_ATTR) || '')
    .split(',').map(Number)
  elem.setAttribute(TAPER_SOURCE_ATTR, newSrc)
  elem.setAttribute(TAPER_STYLE_ATTR, `${Math.round(width * 1e4) / 1e4}|${paint}`)
  const outline = buildTaperOutline(newSrc, width, start, end)
  if (outline) elem.setAttribute('d', outline)
}

export const init = (canvas) => {
  const svgCanvas = canvas

  /**
   * Whether the taper tool applies to this element right now: an already
   * tapered path, or an open stroked line/polyline/path without a fill.
   * @param {Element} elem
   * @returns {boolean}
   */
  const canTaperStroke = (elem) => {
    if (!elem) return false
    if (elem.hasAttribute(TAPER_SOURCE_ATTR)) return true
    if (!['line', 'polyline', 'path'].includes(elem.tagName)) return false
    if ((elem.getAttribute('stroke') || 'none') === 'none') return false
    if (elem.tagName !== 'line' && (elem.getAttribute('fill') || 'none') !== 'none') return false
    if (elem.tagName === 'path' && /[zZ]\s*$/.test(elem.getAttribute('d') || '')) return false
    return true
  }

  /**
   * Read the current taper profile off the selection for popover seeding.
   * @returns {?{start: Float, end: Float}}
   */
  const getTaperParams = () => {
    const [elem] = svgCanvas.getSelectedElements().filter(Boolean)
    const raw = elem?.getAttribute(TAPER_ATTR)
    if (!raw) return null
    const [start, end] = raw.split(',').map(Number)
    return { start: start ?? 100, end: end ?? 0 }
  }

  /**
   * Apply (or re-apply) a taper to the selected stroked path as one undo
   * step. Lines/polylines are swapped for a `<path>` in the same batch.
   * @param {{start: Float, end: Float}} params - Tip widths, % of full.
   * @returns {?Element}
   */
  const applyTaperStroke = ({ start = 100, end = 0 } = {}) => {
    let [elem] = svgCanvas.getSelectedElements().filter(Boolean)
    if (!canTaperStroke(elem)) return null
    const { BatchCommand, ChangeElementCommand, InsertElementCommand, RemoveElementCommand } = svgCanvas.history
    const batchCmd = new BatchCommand('Taper stroke')
    const doc = elem.ownerDocument

    // line / polyline → equivalent <path> (they can't hold an outline `d`).
    if (elem.tagName === 'line' || elem.tagName === 'polyline') {
      let d
      const dropAttrs = ['x1', 'y1', 'x2', 'y2', 'points']
      if (elem.tagName === 'line') {
        d = `M${elem.getAttribute('x1')},${elem.getAttribute('y1')} L${elem.getAttribute('x2')},${elem.getAttribute('y2')}`
      } else {
        const coords = (elem.getAttribute('points') || '').trim().split(/[\s,]+/).map(Number)
        if (coords.length < 4) return null
        d = ''
        for (let i = 0; i + 1 < coords.length; i += 2) {
          d += `${i === 0 ? 'M' : 'L'}${coords[i]},${coords[i + 1]} `
        }
        d = d.trim()
      }
      const path = doc.createElementNS(NS.SVG, 'path')
      for (const attr of elem.attributes) {
        if (dropAttrs.includes(attr.name)) continue
        path.setAttribute(attr.name, attr.value)
      }
      path.setAttribute('d', d)
      path.id = svgCanvas.getNextId()
      elem.before(path)
      batchCmd.addSubCommand(new InsertElementCommand(path))
      batchCmd.addSubCommand(new RemoveElementCommand(elem, elem.nextSibling, elem.parentNode))
      elem.remove()
      elem = path
    }

    let width
    let paint
    const style = elem.getAttribute(TAPER_STYLE_ATTR)
    if (style) {
      const sep = style.indexOf('|')
      width = parseFloat(style.slice(0, sep)) || 1
      paint = style.slice(sep + 1)
    } else {
      width = parseFloat(elem.getAttribute('stroke-width')) || 1
      paint = elem.getAttribute('stroke')
    }
    const srcD = elem.getAttribute(TAPER_SOURCE_ATTR) || elem.getAttribute('d')
    const outline = buildTaperOutline(srcD, width, start, end)
    if (!outline) {
      warn('Selection is not taperable (needs a single open stroked subpath)', null, 'taper-stroke')
      return null
    }

    const oldValues = {
      d: elem.getAttribute('d'),
      fill: elem.getAttribute('fill'),
      stroke: elem.getAttribute('stroke'),
      [TAPER_ATTR]: elem.getAttribute(TAPER_ATTR),
      [TAPER_SOURCE_ATTR]: elem.getAttribute(TAPER_SOURCE_ATTR),
      [TAPER_STYLE_ATTR]: elem.getAttribute(TAPER_STYLE_ATTR)
    }
    elem.setAttribute('d', outline)
    elem.setAttribute('fill', paint)
    elem.setAttribute('stroke', 'none')
    elem.setAttribute(TAPER_ATTR, `${start},${end}`)
    elem.setAttribute(TAPER_SOURCE_ATTR, srcD)
    elem.setAttribute(TAPER_STYLE_ATTR, `${width}|${paint}`)
    batchCmd.addSubCommand(new ChangeElementCommand(elem, oldValues))

    svgCanvas.addCommandToHistory(batchCmd)
    svgCanvas.selectOnly([elem], true)
    svgCanvas.call('changed', [elem])
    return elem
  }

  /**
   * Restore the original stroked centerline, removing the taper.
   * @returns {?Element}
   */
  const removeTaperStroke = () => {
    const [elem] = svgCanvas.getSelectedElements().filter(Boolean)
    const srcD = elem?.getAttribute(TAPER_SOURCE_ATTR)
    const style = elem?.getAttribute(TAPER_STYLE_ATTR)
    if (!srcD || !style) return null
    const { BatchCommand, ChangeElementCommand } = svgCanvas.history
    const batchCmd = new BatchCommand('Remove taper')
    const sep = style.indexOf('|')
    const width = parseFloat(style.slice(0, sep)) || 1
    const paint = style.slice(sep + 1)

    const oldValues = {
      d: elem.getAttribute('d'),
      fill: elem.getAttribute('fill'),
      stroke: elem.getAttribute('stroke'),
      'stroke-width': elem.getAttribute('stroke-width'),
      [TAPER_ATTR]: elem.getAttribute(TAPER_ATTR),
      [TAPER_SOURCE_ATTR]: srcD,
      [TAPER_STYLE_ATTR]: style
    }
    elem.setAttribute('d', srcD)
    elem.setAttribute('fill', 'none')
    elem.setAttribute('stroke', paint)
    elem.setAttribute('stroke-width', width)
    elem.removeAttribute(TAPER_ATTR)
    elem.removeAttribute(TAPER_SOURCE_ATTR)
    elem.removeAttribute(TAPER_STYLE_ATTR)
    batchCmd.addSubCommand(new ChangeElementCommand(elem, oldValues))

    svgCanvas.addCommandToHistory(batchCmd)
    svgCanvas.selectOnly([elem], true)
    svgCanvas.call('changed', [elem])
    return elem
  }

  svgCanvas.applyTaperStroke = applyTaperStroke
  svgCanvas.removeTaperStroke = removeTaperStroke
  svgCanvas.getTaperParams = getTaperParams
  svgCanvas.canTaperStroke = canTaperStroke
}
