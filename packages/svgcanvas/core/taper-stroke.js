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
 * A width profile (`se:width-profile`, see width-profile.js) generalises the taper: width points anywhere along
 * the path, each side apart. The element is the same kind of thing — `se:taper-d` is its centerline and
 * `se:taper-style` its width and paint — only the outline comes from `width-outline.js` (which also takes
 * closed paths and the stroke's caps and joins) instead of the three-point curve above. When a profile is
 * present it wins; `se:taper` is kept alongside it (the profile's two end widths) because code that only asks
 * "is this stroke tapered" reads that.
 *
 * `remapTaperSource(elem, remap, scalew, scaleh, svgCanvas)` is registered with
 * `geometry-remap-registry.js` (from this module's own `init`) and run by
 * `coords.js` `remapElement` when a transform is baked into a tapered path:
 * it applies the affine map to the stored centerline, scales the stored
 * width, and regenerates the outline — without it the next taper edit would
 * teleport the shape back to its pre-move geometry.
 *
 * @module taper-stroke
 * @license MIT
 */

import { NS } from './namespaces.js'
import { warn } from '../common/logger.js'
import { getPaperScope, toAbsolutePathData } from './paper-utils.js'
import { registerGeometryRemap } from './geometry-remap-registry.js'
import { registerLiveStage, canAddStage } from './live-stack.js'
import { registerAttrValidator, pathDataValidator } from './drawing-invariants.js'
import { widthOutline } from './width-outline.js'
import { WIDTH_PROFILE_ATTR, parseProfile, formatProfile, validateProfile, endPercents, isProfile } from './width-profile.js'

export const TAPER_ATTR = 'se:taper'
export const TAPER_SOURCE_ATTR = 'se:taper-d'
export const TAPER_STYLE_ATTR = 'se:taper-style'

/**
 * Quadratic-Bézier width profile through (0,s), (0.5,1), (1,e): full width
 * mid-stroke, the given fractions at the tips. Shared with `brush-stroke.js`,
 * which applies the same tip-taper shape to its nib-based outline.
 * @param {number} t - Position along the stroke, 0–1.
 * @param {number} s - Start-tip width fraction, 0–1.
 * @param {number} e - End-tip width fraction, 0–1.
 * @returns {number}
 */
export const profile = (t, s, e) => (1 - t) * (1 - t) * s + 2 * t * (1 - t) + t * t * e

const CAP_ANGLES = [30, 60, 90, 120, 150]

/**
 * Build the filled-outline `d` for a centerline with a tapered width.
 * @param {string} d - Centerline path data (single open subpath).
 * @param {number} width - Full stroke width.
 * @param {number} startPct - Tip width at the start, % of full (0–100).
 * @param {number} endPct - Tip width at the end, % of full (0–100).
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
 * The caps and joins a width outline takes from the element's stroke attributes.
 * @param {Element} elem
 * @returns {import('./width-outline.js').OutlineOptions}
 */
const outlineOptions = (elem) => ({
  cap: ['round', 'square'].includes(elem.getAttribute('stroke-linecap')) ? elem.getAttribute('stroke-linecap') : 'butt',
  join: ['round', 'bevel'].includes(elem.getAttribute('stroke-linejoin')) ? elem.getAttribute('stroke-linejoin') : 'miter',
  miterLimit: parseFloat(elem.getAttribute('stroke-miterlimit')) || 4
})

/**
 * The outline of `elem`'s stored centerline: from its width profile when it has one, else from its taper.
 * @param {Element} elem
 * @param {string} srcD the centerline
 * @param {number} width the full stroke width
 * @returns {?string}
 */
const outlineOf = (elem, srcD, width) => {
  const profile = parseProfile(elem.getAttribute(WIDTH_PROFILE_ATTR))
  if (profile) return widthOutline(srcD, width, profile, outlineOptions(elem))
  const [start = 100, end = 0] = (elem.getAttribute(TAPER_ATTR) || '').split(',').map(Number)
  return buildTaperOutline(srcD, width, start, end)
}

/**
 * Called from `remapElement` (coords.js) when a transform is baked into a
 * tapered path: apply the affine map to the stored centerline, scale the
 * stored width, regenerate the outline `d`.
 * @param {Element} elem
 * @param {Function} remap - `(x, y) → {x, y}` from remapElement.
 * @param {Function} scalew
 * @param {Function} scaleh
 * @param {module:svgcanvas.SvgCanvas} svgCanvas
 * @returns {void}
 */
export const remapTaperSource = (elem, remap, scalew, scaleh, svgCanvas) => {
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
  // Normalize before storing: this source is also restored verbatim onto
  // `d` by removeTaperStroke, so it needs to be node-edit-safe too, not
  // just the outline below (see toAbsolutePathData's doc comment).
  const absSrc = toAbsolutePathData(newSrc, svgCanvas)
  elem.setAttribute(TAPER_SOURCE_ATTR, absSrc)
  elem.setAttribute(TAPER_STYLE_ATTR, `${Math.round(width * 1e4) / 1e4}|${paint}`)
  const outline = outlineOf(elem, absSrc, width)
  if (outline) elem.setAttribute('d', elem.hasAttribute(WIDTH_PROFILE_ATTR) ? outline : toAbsolutePathData(outline, svgCanvas))
}

/**
 * The width stage of the live stack (live-stack.js): the outline of the stage's input as a centerline. The width and
 * paint are the ones `se:taper-style` recorded. A legacy taper's outline is made absolute when a canvas is given.
 */
registerLiveStage({
  id: 'width',
  order: 30,
  srcAttr: TAPER_SOURCE_ATTR,
  attrs: [TAPER_SOURCE_ATTR, TAPER_ATTR, TAPER_STYLE_ATTR, WIDTH_PROFILE_ATTR],
  run: (view, inputD, canvas) => {
    const style = view.getAttribute(TAPER_STYLE_ATTR)
    if (!style) return null
    const outline = outlineOf(view, inputD, parseFloat(style) || 1)
    if (!outline) return null
    return view.hasAttribute(WIDTH_PROFILE_ATTR) || !canvas ? outline : toAbsolutePathData(outline, canvas)
  }
})

export const init = (canvas) => {
  const svgCanvas = canvas

  registerGeometryRemap(TAPER_SOURCE_ATTR, remapTaperSource)
  registerAttrValidator(TAPER_SOURCE_ATTR, pathDataValidator)
  registerAttrValidator(TAPER_ATTR, (value) => {
    const parts = value.split(',').map(Number)
    return parts.length === 2 && parts.every(Number.isFinite) ? true : 'is not "start,end"'
  })
  registerAttrValidator(WIDTH_PROFILE_ATTR, validateProfile)
  registerAttrValidator(TAPER_STYLE_ATTR, (value) => (/^[\d.]+\|.+$/.test(value) ? true : 'is not "width|paint"'))

  /**
   * Whether the taper tool applies to this element right now: an already
   * tapered path, or an open stroked line/polyline/path without a fill.
   * @param {Element} elem
   * @returns {boolean}
   */
  const canTaperStroke = (elem) => {
    if (!elem) return false
    if (!canAddStage(elem, 'width')) return false // live-stack.js: a width stroke shares an element with effects or corners only
    if (elem.hasAttribute(TAPER_SOURCE_ATTR)) return true
    if (!['line', 'polyline', 'path'].includes(elem.tagName)) return false
    if ((elem.getAttribute('stroke') || 'none') === 'none') return false
    if (elem.tagName !== 'line' && (elem.getAttribute('fill') || 'none') !== 'none') return false
    if (elem.tagName === 'path' && /[zZ]\s*$/.test(elem.getAttribute('d') || '')) return false
    return true
  }

  /**
   * Read the current taper profile off the selection for popover seeding.
   * @returns {?{start: number, end: number}}
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
   * @param {{start: number, end: number}} params - Tip widths, % of full.
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
      // Arrowhead alignment belongs to the line: the tapered path starts from the real, untrimmed ends.
      const dropAttrs = ['x1', 'y1', 'x2', 'y2', 'points', 'se:arrow-align', 'se:arrow-pts', 'se:arrow-trim']
      const real = svgCanvas.getArrowSourcePoints(elem)
      if (real) {
        d = real.map((p, i) => `${i === 0 ? 'M' : 'L'}${p.x},${p.y}`).join(' ')
      } else if (elem.tagName === 'line') {
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
    const srcD = elem.getAttribute(TAPER_SOURCE_ATTR) || elem.getAttribute('se:arrow-d') || elem.getAttribute('d')
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
      [TAPER_STYLE_ATTR]: elem.getAttribute(TAPER_STYLE_ATTR),
      [WIDTH_PROFILE_ATTR]: elem.getAttribute(WIDTH_PROFILE_ATTR)
    }
    elem.removeAttribute(WIDTH_PROFILE_ATTR) // the sliders replace a width profile
    elem.setAttribute('d', toAbsolutePathData(outline, svgCanvas))
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
      [TAPER_STYLE_ATTR]: style,
      [WIDTH_PROFILE_ATTR]: elem.getAttribute(WIDTH_PROFILE_ATTR)
    }
    elem.removeAttribute(WIDTH_PROFILE_ATTR)
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

  // ---- width profiles ------------------------------------------------------

  /**
   * Whether a width profile can be put on this element now: an already profiled or tapered stroke, or a stroked
   * line, polyline or path without a fill. Unlike the taper, a closed path is fine.
   * @param {?Element} elem
   * @returns {boolean}
   */
  const canWidthStroke = (elem) => {
    if (!elem) return false
    if (!canAddStage(elem, 'width')) return false // live-stack.js
    if (elem.hasAttribute(TAPER_SOURCE_ATTR)) return true
    if (!['line', 'polyline', 'path'].includes(elem.tagName)) return false
    if ((elem.getAttribute('stroke') || 'none') === 'none') return false
    return elem.tagName === 'line' || (elem.getAttribute('fill') || 'none') === 'none'
  }

  /**
   * The width profile of an element (the selection's by default), or null for a plain or only-tapered stroke.
   * @param {Element} [elem]
   * @returns {?import('./width-profile.js').WidthPoint[]}
   */
  const getWidthProfile = (elem = svgCanvas.getSelectedElements().filter(Boolean)[0]) =>
    parseProfile(elem?.getAttribute(WIDTH_PROFILE_ATTR))

  /**
   * A line or polyline as the equivalent `<path>` (keeping its id and attributes), in place and without
   * history: for use inside an open transaction. Any path is returned as it is.
   * @param {Element} elem
   * @returns {Element}
   */
  const asPath = (elem) => {
    if (elem.tagName === 'path') return elem
    let pts = svgCanvas.getArrowSourcePoints(elem)
    if (!pts && elem.tagName === 'line') {
      pts = [{ x: +elem.getAttribute('x1'), y: +elem.getAttribute('y1') }, { x: +elem.getAttribute('x2'), y: +elem.getAttribute('y2') }]
    } else if (!pts) {
      const c = (elem.getAttribute('points') || '').trim().split(/[\s,]+/).map(Number)
      pts = []
      for (let i = 0; i + 1 < c.length; i += 2) pts.push({ x: c[i], y: c[i + 1] })
    }
    const path = elem.ownerDocument.createElementNS(NS.SVG, 'path')
    const drop = ['x1', 'y1', 'x2', 'y2', 'points', 'se:arrow-align', 'se:arrow-pts', 'se:arrow-trim']
    for (const attr of elem.attributes) if (!drop.includes(attr.name)) path.setAttribute(attr.name, attr.value)
    path.setAttribute('d', pts.map((p, i) => `${i === 0 ? 'M' : 'L'}${p.x},${p.y}`).join(' '))
    elem.before(path)
    elem.remove()
    return path
  }

  /**
   * Draw `elem` (a path that can take a width profile) with the profile, regenerating the outline from its stored
   * centerline. Records no history: use it inside `transact` or a tool gesture.
   * @param {Element} elem
   * @param {import('./width-profile.js').WidthPoint[]} points
   * @returns {boolean} false when nothing could be drawn (no width, no centerline).
   */
  const drawWidthProfile = (elem, points) => {
    if (!isProfile(points)) return false
    if (svgCanvas.getArrowAlign(elem)) svgCanvas.setArrowAlign(elem, null) // the centerline is the real, untrimmed one
    const style = elem.getAttribute(TAPER_STYLE_ATTR)
    let width
    let paint
    if (style) {
      const sep = style.indexOf('|')
      width = parseFloat(style.slice(0, sep)) || 1
      paint = style.slice(sep + 1)
    } else {
      width = parseFloat(elem.getAttribute('stroke-width')) || 1
      paint = elem.getAttribute('stroke')
    }
    const srcD = elem.getAttribute(TAPER_SOURCE_ATTR) || elem.getAttribute('d')
    const outline = widthOutline(srcD, width, points, outlineOptions(elem))
    if (!outline) return false
    elem.setAttribute('d', outline)
    elem.setAttribute('fill', paint)
    elem.setAttribute('stroke', 'none')
    elem.setAttribute(WIDTH_PROFILE_ATTR, formatProfile(points))
    elem.setAttribute(TAPER_ATTR, endPercents(points).join(','))
    elem.setAttribute(TAPER_SOURCE_ATTR, srcD)
    elem.setAttribute(TAPER_STYLE_ATTR, `${width}|${paint}`)
    return true
  }

  /**
   * Give the selected strokes a width profile as one undo step (lines and polylines become paths).
   * @param {import('./width-profile.js').WidthPoint[]} points
   * @returns {Element[]} the elements that took it.
   */
  const applyWidthProfile = (points) => {
    const targets = svgCanvas.getSelectedElements().filter(canWidthStroke)
    if (!targets.length || !isProfile(points)) return []
    const done = []
    svgCanvas.transact('Width profile', () => {
      for (const t of targets) {
        const el = asPath(t)
        if (drawWidthProfile(el, points)) done.push(el)
      }
    })
    if (done.length) {
      svgCanvas.selectOnly(done, true)
      svgCanvas.call('changed', done)
    }
    return done
  }

  svgCanvas.canWidthStroke = canWidthStroke
  svgCanvas.getWidthProfile = getWidthProfile
  svgCanvas.widthStrokeAsPath = asPath
  svgCanvas.drawWidthProfile = drawWidthProfile
  svgCanvas.applyWidthProfile = applyWidthProfile
  svgCanvas.applyTaperStroke = applyTaperStroke
  svgCanvas.removeTaperStroke = removeTaperStroke
  svgCanvas.getTaperParams = getTaperParams
  svgCanvas.canTaperStroke = canTaperStroke
}
