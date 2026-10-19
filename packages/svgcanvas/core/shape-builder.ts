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

import type SvgCanvas from '../svgcanvas.ts'
import { getOwnTransformScale, getPaperScope, getStyleAttrs as getBaseStyleAttrs, scaleStrokeWidth, svgToPaper, toAbsolutePathData } from './paper-utils.ts'
import { warn } from '../common/logger.ts'

// Ignore slivers below this absolute area (user units²).
const AREA_EPS = 0.5
// Region decomposition is O(n²) boolean ops — keep sessions sane.
const MAX_SHAPES = 12

type Geometry = paper.Path | paper.CompoundPath
/** A face of the arrangement and the elements that cover it. */
interface Region { geom: paper.PathItem, sources: Element[] }

const areaOf = (item: paper.PathItem | null | undefined): number => {
  if (!item) return 0
  const kids = (item.children?.length ? item.children : [item]) as Geometry[]
  return kids.reduce((sum, k) => sum + Math.abs(k.area || 0), 0)
}

/** Element → paper item in content space (own transform applied). */
const elemToItem = (elem: Element, scope: paper.PaperScope): Geometry | null => svgToPaper(elem, scope, { asCompoundPath: true })

const getStyleAttrs = (elem: Element): Record<string, string> => getBaseStyleAttrs(elem, ['stroke-linejoin', 'stroke-linecap'])

/** Interactive region-merge session over the given (or selected) elements (`svgCanvas.shapeBuilder`). */
export interface ShapeBuilder {
  begin(elems?: Element[]): Array<{ index: number, d: string }> | null
  /** Index of the region under (x, y), or -1. */
  hitTest(x: number, y: number): number
  apply(indices: number[], mode?: 'merge' | string): Element[] | null
  end(): void
}

export const createShapeBuilder = (canvas: SvgCanvas): ShapeBuilder => {
  const svgCanvas = canvas

  let session: { entries: Array<{ elem: Element, item: Geometry }>, regions: Region[] } | null = null

  const disposeSession = (): void => {
    if (!session) return
    for (const e of session.entries) e.item.remove()
    for (const r of session.regions) r.geom.remove()
    session = null
  }

  /**
   * Start a session from the given elements (defaults to the selection).
   * @returns Region outlines for the overlay, or null when the selection can't be decomposed.
   */
  const begin = (elems?: Element[]): Array<{ index: number, d: string }> | null => {
    disposeSession()
    const scope = getPaperScope()
    const source = (elems || svgCanvas.getSelectedElements()).filter(Boolean)
      .filter((el: Element) => !el.hasAttribute('data-frame'))
    if (source.length < 2) {
      warn('Shape builder needs at least 2 shapes', null, 'shape-builder')
      return null
    }
    if (source.length > MAX_SHAPES) {
      warn(`Shape builder supports up to ${MAX_SHAPES} shapes`, null, 'shape-builder')
      return null
    }
    const entries: Array<{ elem: Element, item: Geometry }> = []
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
    let regions: Region[] = []
    try {
      for (const entry of entries) {
        const next: Region[] = []
        let remainder: paper.PathItem = entry.item.clone({ insert: false })
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
   */
  const hitTest = (x: number, y: number): number => {
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
   * @param indices - Picked region indices.
   * @returns The elements now making up the arrangement (input
   *   for the next `begin`), or null when nothing changed.
   */
  const apply = (indices: number[], mode: 'merge' | 'delete' = 'merge'): Element[] | null => {
    if (!session || !indices.length) return null
    const live = session
    const picked = indices.map((i) => live.regions[i]).filter(Boolean)
    if (!picked.length) return null
    const { BatchCommand, InsertElementCommand, RemoveElementCommand } = svgCanvas.history
    const batchCmd = new BatchCommand(mode === 'merge' ? 'Merge regions' : 'Delete regions')
    const doc = session.entries[0].elem.ownerDocument
    const NSSVG = 'http://www.w3.org/2000/svg'
    const layer = session.entries[0].elem.parentNode

    let union: paper.PathItem = picked[0].geom.clone({ insert: false })
    for (const r of picked.slice(1)) {
      union = union.unite(r.geom, { insert: false })
    }

    const resultElems: Element[] = []
    // `place(path)` must put the node in the DOM before the command is
    // recorded — InsertElementCommand snapshots the position on construction.
    const makePath = (d: string, styleSrc: Element, place: (p: Element) => void): Element => {
      const path = doc.createElementNS(NSSVG, 'path')
      const style = getStyleAttrs(styleSrc)
      // styleSrc's own transform is baked into the source item's geometry
      // (elemToItem/svgToPaper) with no compensating transform on the
      // result, so stroke-width needs the same correction (see
      // getMatrixScale's doc comment in paper-utils.js).
      scaleStrokeWidth(style, getOwnTransformScale(styleSrc), styleSrc)
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
        (p) => { if (last) last.after(p); else (layer as Element).append(p) })
      resultElems.push(merged)
    }
    union.remove()

    svgCanvas.clearSelection()
    svgCanvas.addCommandToHistory(batchCmd)
    svgCanvas.call('changed', resultElems)
    return resultElems
  }

  const end = () => disposeSession()

  return { begin, hitTest, apply, end }
}
