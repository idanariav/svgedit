/**
 * Shape builder — region arithmetic for the interactive paint-to-merge tool
 * (UI/mode in ext-shape-builder; this module owns the paper.js math and the
 * document mutations).
 *
 * A session decomposes the selected shapes into *atomic regions* — the faces
 * of the planar arrangement — by iteratively intersecting/subtracting each
 * shape against the regions accumulated so far (the standard boolean-ops
 * construction). The extension renders the regions as an overlay, collects
 * the ones the user clicks/drags across, and calls `apply`:
 *
 *  - merge: the picked regions are united into one new `<path>` (styled from
 *    the topmost shape under the first pick) and carved out of every source
 *    shape they overlapped.
 *  - delete (Alt): the picked regions are carved out of the sources, no new
 *    shape.
 *
 * Sources whose geometry changes are rebuilt as `<path>` elements
 * (Remove+Insert pairs, boolean-ops precedent); untouched shapes are left
 * alone. Each gesture is one BatchCommand.
 *
 * @module shape-builder
 * @license MIT
 */

import { getPaperScope, getStyleAttrs as getBaseStyleAttrs, svgToPaper, toAbsolutePathData } from './paper-utils.js'
import { warn } from '../common/logger.js'

// Ignore slivers below this absolute area (user units²).
const AREA_EPS = 0.5
// Region decomposition is O(n²) boolean ops — keep sessions sane.
const MAX_SHAPES = 12

const areaOf = (item) => {
  if (!item) return 0
  const kids = item.children?.length ? item.children : [item]
  return kids.reduce((sum, k) => sum + Math.abs(k.area || 0), 0)
}

/** Element → paper item in content space (own transform applied). */
const elemToItem = (elem, scope) => svgToPaper(elem, scope, { asCompoundPath: true })

const getStyleAttrs = (elem) => getBaseStyleAttrs(elem, ['stroke-linejoin', 'stroke-linecap'])

export const init = (canvas) => {
  const svgCanvas = canvas

  let session = null // { entries: [{elem, item}], regions: [{geom, sources}] }

  const disposeSession = () => {
    if (!session) return
    for (const e of session.entries) e.item.remove()
    for (const r of session.regions) r.geom.remove()
    session = null
  }

  /**
   * Start a session from the given elements (defaults to the selection).
   * @param {Element[]} [elems]
   * @returns {?Array<{index: Integer, d: string}>} Region outlines for the
   *   overlay, or null when the selection can't be decomposed.
   */
  const begin = (elems) => {
    disposeSession()
    const scope = getPaperScope()
    const source = (elems || svgCanvas.getSelectedElements()).filter(Boolean)
      .filter((el) => !el.hasAttribute('data-frame'))
    if (source.length < 2) {
      warn('Shape builder needs at least 2 shapes', null, 'shape-builder')
      return null
    }
    if (source.length > MAX_SHAPES) {
      warn(`Shape builder supports up to ${MAX_SHAPES} shapes`, null, 'shape-builder')
      return null
    }
    const entries = []
    for (const elem of source) {
      const item = elemToItem(elem, scope)
      if (!item || areaOf(item) < AREA_EPS) {
        item?.remove()
        continue
      }
      entries.push({ elem, item })
    }
    if (entries.length < 2) {
      warn('Shape builder needs at least 2 path-convertible shapes', null, 'shape-builder')
      return null
    }

    // Planar arrangement: fold each shape into the region set.
    let regions = []
    try {
      for (const entry of entries) {
        const next = []
        let remainder = entry.item.clone({ insert: false })
        for (const r of regions) {
          const inter = r.geom.intersect(entry.item, { insert: false })
          const diff = r.geom.subtract(entry.item, { insert: false })
          if (areaOf(inter) > AREA_EPS) next.push({ geom: inter, sources: [...r.sources, entry.elem] })
          else inter.remove()
          if (areaOf(diff) > AREA_EPS) next.push({ geom: diff, sources: r.sources })
          else diff.remove()
          remainder = remainder.subtract(r.geom, { insert: false })
          r.geom.remove()
        }
        if (areaOf(remainder) > AREA_EPS) next.push({ geom: remainder, sources: [entry.elem] })
        else remainder.remove()
        regions = next
      }
    } catch (err) {
      warn('Shape builder region decomposition failed', err, 'shape-builder')
      for (const r of regions) r.geom.remove()
      for (const e of entries) e.item.remove()
      return null
    }

    session = { entries, regions }
    return regions.map((r, index) => ({ index, d: r.geom.pathData }))
  }

  /**
   * Topmost region containing the point, or -1.
   * @param {Float} x
   * @param {Float} y
   * @returns {Integer}
   */
  const hitTest = (x, y) => {
    if (!session) return -1
    const scope = getPaperScope()
    const pt = new scope.Point(x, y)
    // Later regions come from later (higher z-order) shapes; prefer them.
    for (let i = session.regions.length - 1; i >= 0; i--) {
      if (session.regions[i].geom.contains(pt)) return i
    }
    return -1
  }

  /**
   * Apply a gesture: merge (or delete) the picked regions, as one undo step.
   * @param {Integer[]} indices - Picked region indices.
   * @param {'merge'|'delete'} mode
   * @returns {?Element[]} The elements now making up the arrangement (input
   *   for the next `begin`), or null when nothing changed.
   */
  const apply = (indices, mode = 'merge') => {
    if (!session || !indices.length) return null
    const picked = indices.map((i) => session.regions[i]).filter(Boolean)
    if (!picked.length) return null
    const { BatchCommand, InsertElementCommand, RemoveElementCommand } = svgCanvas.history
    const batchCmd = new BatchCommand(mode === 'merge' ? 'Merge regions' : 'Delete regions')
    const doc = session.entries[0].elem.ownerDocument
    const NSSVG = 'http://www.w3.org/2000/svg'
    const layer = session.entries[0].elem.parentNode

    let union = picked[0].geom.clone({ insert: false })
    for (const r of picked.slice(1)) {
      union = union.unite(r.geom, { insert: false })
    }

    const resultElems = []
    // `place(path)` must put the node in the DOM before the command is
    // recorded — InsertElementCommand snapshots the position on construction.
    const makePath = (d, styleSrc, place) => {
      const path = doc.createElementNS(NSSVG, 'path')
      const style = getStyleAttrs(styleSrc)
      for (const [k, v] of Object.entries(style)) path.setAttribute(k, v)
      path.setAttribute('d', toAbsolutePathData(d, svgCanvas))
      path.id = svgCanvas.getNextId()
      place(path)
      batchCmd.addSubCommand(new InsertElementCommand(path))
      return path
    }

    // Carve the union out of every source shape it overlaps.
    for (const entry of session.entries) {
      const overlap = entry.item.intersect(union, { insert: false })
      const touched = areaOf(overlap) > AREA_EPS
      overlap.remove()
      if (!touched) {
        resultElems.push(entry.elem)
        continue
      }
      const remaining = entry.item.subtract(union, { insert: false })
      if (areaOf(remaining) > AREA_EPS) {
        const replacement = makePath(remaining.pathData, entry.elem, (p) => entry.elem.before(p))
        resultElems.push(replacement)
      }
      remaining.remove()
      batchCmd.addSubCommand(new RemoveElementCommand(entry.elem, entry.elem.nextSibling, entry.elem.parentNode))
      entry.elem.remove()
    }

    // Merge drops the united region back in, styled from the topmost shape
    // under the first pick, above everything it came from.
    if (mode === 'merge') {
      const styleSrc = picked[0].sources[picked[0].sources.length - 1]
      const last = resultElems[resultElems.length - 1]
      const merged = makePath(union.pathData, styleSrc,
        (p) => { if (last) last.after(p); else layer.append(p) })
      resultElems.push(merged)
    }
    union.remove()

    svgCanvas.clearSelection()
    svgCanvas.addCommandToHistory(batchCmd)
    svgCanvas.call('changed', resultElems)
    return resultElems
  }

  const end = () => disposeSession()

  svgCanvas.shapeBuilder = { begin, hitTest, apply, end }
}
