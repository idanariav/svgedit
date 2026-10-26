/**
 * Stretch a group (or a multi-selection) without distorting its ends, and set the selection's size by number.
 *
 * **Alt-drag on a resize grip** slices the selection at its middle, per dragged axis: a part wholly on the dragged
 * side moves with the grip, a part wholly on the other side stays put, and a part that crosses the middle stretches
 * from its fixed edge, so the seams stay joined (a pencil gets longer, its tip and eraser keep their shape). A group
 * that crosses the middle is sliced again inside; any other part is moved or stretched as one piece. The parts of a
 * single selected group are its children (the group keeps its own transform); a multi-selection's parts are the
 * selected elements. The drag is shown through the model (`snapshotHistory.preview`, each part's transform); on
 * release each part is baked like a resize (`applyAffines`, so a stroke keeps its width), one undo step.
 *
 * **`setSelectionSize(width, height)`** scales the selection's box (as the X / Y fields read it) about its top-left
 * corner, each element as a whole, the way dragging a grip does.
 *
 * Illustrator's 9-slice symbol scaling is the same idea with user-placed guides; the guides here are the middle lines.
 * @module stretch
 * @license MIT
 */

import type SvgCanvas from '../svgcanvas.ts'
import { getBBox } from './bbox-utils.ts'
import { getTransformList, transformListToTransform } from './math.ts'
import { setAttrsById } from './model/edit.ts'
import { applyAffines, multiply, type Affine } from './transform-each.ts'

/** One dragged axis: the middle line, which side the grip is on and how far it moved (frame units). */
export interface StretchAxis {
  mid: number
  side: 'min' | 'max'
  d: number
}

/** `x' = k·x + t` along one axis; `span` marks a part that crosses the middle (it is stretched). */
export interface AxisMap { k: number, t: number, span: boolean }

/** The narrowest a stretched part gets, in frame units. */
const MIN_SPAN = 1

/** @returns whether the interval `[lo, hi]` crosses the middle line */
export const crossesMiddle = (lo: number, hi: number, mid: number): boolean => lo < mid && hi > mid

/**
 * The map one part gets along one axis: move with the grip, stay, or stretch from its fixed edge.
 * @param lo the part's low edge (frame units)
 * @param hi its high edge
 */
export const axisMap = (lo: number, hi: number, axis: StretchAxis): AxisMap => {
  const { mid, side, d } = axis
  if (crossesMiddle(lo, hi, mid)) {
    const w = hi - lo
    const k = (side === 'max' ? w + d : w - d) / w
    return { k, t: side === 'max' ? lo - k * lo : hi - k * hi, span: true }
  }
  const onGripSide = side === 'max' ? lo >= mid : hi <= mid
  return { k: 1, t: onGripSide ? d : 0, span: false }
}

/**
 * Limit a drag so no stretched part gets narrower than {@link MIN_SPAN} (or than it already is).
 * @param spanWidths the widths of the parts that cross the middle
 * @returns the delta to use
 */
export const clampAxisDelta = (spanWidths: number[], axis: StretchAxis): number => {
  if (!spanWidths.length) return axis.d
  const narrowest = Math.min(...spanWidths)
  const room = narrowest - Math.min(MIN_SPAN, narrowest)
  return axis.side === 'max' ? Math.max(axis.d, -room) : Math.min(axis.d, room)
}

/** What the stretch service reads from its canvas. */
type Host = Pick<SvgCanvas, 'getSelectedElements' | 'getSvgRoot' | 'getSvgContent' | 'transact' | 'snapshotHistory' |
'recalculateDimensions' | 'selectorManager' | 'call' | 'getNextId' | 'setElementsAttributes' |
'getStrokedBBoxDefaultVisible' | 'updateGroupSelector'>

/** The stretch service of one canvas (`svgCanvas.stretch`). */
export interface Stretch {
  /** Whether an Alt-drag on a grip stretches the selection (a single group, or two or more elements). */
  isEligible (selected: Element[]): boolean
  /** Start a stretch of the selection from a grip (`n`, `se`, …). */
  begin (selected: Element[], mode: string): void
  /** Show the stretch for a pointer delta in document coordinates. */
  preview (dx: number, dy: number): void
  /** Bake the stretch and push it as one undo step. */
  commit (): void
  /** Put everything back. */
  cancel (): void
  isActive (): boolean
  /** Scale the selection's box to `width` × `height` about its top-left corner, one undo step. */
  setSelectionSize (width: number, height: number): void
}

const toAffine = (m: DOMMatrixReadOnly | SVGMatrix): Affine => [m.a, m.b, m.c, m.d, m.e, m.f]

const invert = (m: Affine): Affine => {
  const det = m[0] * m[3] - m[1] * m[2]
  return [m[3] / det, -m[1] / det, -m[2] / det, m[0] / det,
    (m[2] * m[5] - m[3] * m[4]) / det, (m[1] * m[4] - m[0] * m[5]) / det]
}

/** @returns the matrix from `from`'s user space to `to`'s (identity when either is not rendered) */
const between = (from: Element, to: Element): Affine => {
  const a = (from as SVGGraphicsElement).getScreenCTM?.()
  const b = (to as SVGGraphicsElement).getScreenCTM?.()
  return a && b ? multiply(invert(toAffine(b)), toAffine(a)) : [1, 0, 0, 1, 0, 0]
}

/** @returns the axis-aligned box of `el`'s geometry in the coordinates `toFrame` maps its parent's into */
const frameBox = (el: Element, toFrame: Affine): { x0: number, y0: number, x1: number, y1: number } | null => {
  const box = getBBox(el)
  const tlist = getTransformList(el)
  if (!box) return null
  const own = tlist ? toAffine(transformListToTransform(tlist).matrix) : [1, 0, 0, 1, 0, 0] as Affine
  const m = multiply(toFrame, own)
  const xs: number[] = []
  const ys: number[] = []
  for (const [x, y] of [[box.x, box.y], [box.x + box.width, box.y], [box.x, box.y + box.height], [box.x + box.width, box.y + box.height]]) {
    xs.push(m[0] * x + m[2] * y + m[4])
    ys.push(m[1] * x + m[3] * y + m[5])
  }
  return { x0: Math.min(...xs), y0: Math.min(...ys), x1: Math.max(...xs), y1: Math.max(...ys) }
}

/** Children that are drawn parts (not titles, defs or editor overlays). */
const partsOf = (group: Element): Element[] => [...group.children].filter((child) =>
  !['title', 'desc', 'defs', 'metadata'].includes(child.localName) && !child.hasAttribute('data-se-ephemeral'))

const isGroup = (el: Element): boolean => el.localName === 'g' || el.localName === 'a'

/** A part of an open stretch. */
interface Part {
  el: Element
  /** its parent's user space → the frame */
  toFrame: Affine
  box: { x0: number, y0: number, x1: number, y1: number }
  /** its own transform at the start */
  own: Affine
  /** its parent-space matrix of the current preview */
  m: Affine
}

export const createStretch = (svgCanvas: Host): Stretch => {
  let session: {
    selected: Element[]
    parts: Part[]
    /** document → frame, linear part only (a pointer delta) */
    docToFrame: Affine
    x: StretchAxis | null
    y: StretchAxis | null
  } | null = null

  const layer = (): Element => svgCanvas.getSvgContent().querySelector('g') ?? svgCanvas.getSvgContent()

  /** Slice `els` (in `parent`'s coordinates) at the middle lines, opening every group that crosses one. */
  const collect = (els: Element[], frame: Element, mids: { x: number | null, y: number | null }, out: Part[]): void => {
    for (const el of els) {
      const parent = el.parentNode as Element
      const toFrame = between(parent, frame)
      const box = frameBox(el, toFrame)
      if (!box) continue
      const crosses = (mids.x !== null && crossesMiddle(box.x0, box.x1, mids.x)) ||
        (mids.y !== null && crossesMiddle(box.y0, box.y1, mids.y))
      if (crosses && isGroup(el) && partsOf(el).length) {
        collect(partsOf(el), frame, mids, out)
        continue
      }
      const tlist = getTransformList(el)
      if (!tlist) continue
      el.id ||= svgCanvas.getNextId() // the preview finds its parts by id
      out.push({ el, toFrame, box, own: toAffine(transformListToTransform(tlist).matrix), m: [1, 0, 0, 1, 0, 0] })
    }
  }

  const refreshSelectors = (selected: Element[]): void => {
    for (const el of selected) svgCanvas.selectorManager.requestSelector(el).resize()
    if (selected.length > 1) svgCanvas.updateGroupSelector()
  }

  const stretch: Stretch = {
    isEligible (selected) {
      const els = selected.filter(Boolean)
      return els.length > 1 || (els.length === 1 && isGroup(els[0]) && partsOf(els[0]).length > 0)
    },

    begin (selected, mode) {
      if (session) stretch.commit()
      const els = selected.filter(Boolean)
      const single = els.length === 1
      const frame = single ? els[0] : els[0].parentNode as Element
      const units = single ? partsOf(els[0]) : els
      // the middle lines of the whole selection, in the frame
      const boxes = units.map((el) => frameBox(el, between(el.parentNode as Element, frame))).filter((b) => b !== null)
      if (!boxes.length) return
      const x0 = Math.min(...boxes.map((b) => b.x0))
      const x1 = Math.max(...boxes.map((b) => b.x1))
      const y0 = Math.min(...boxes.map((b) => b.y0))
      const y1 = Math.max(...boxes.map((b) => b.y1))
      const xSide = mode.includes('e') ? 'max' : mode.includes('w') ? 'min' : null
      const ySide = mode.includes('s') ? 'max' : mode.includes('n') ? 'min' : null
      const x = xSide ? { mid: (x0 + x1) / 2, side: xSide, d: 0 } as StretchAxis : null
      const y = ySide ? { mid: (y0 + y1) / 2, side: ySide, d: 0 } as StretchAxis : null
      const parts: Part[] = []
      collect(units, frame, { x: x?.mid ?? null, y: y?.mid ?? null }, parts)
      const toFrame = between(layer(), frame)
      session = {
        selected: els,
        parts,
        docToFrame: [toFrame[0], toFrame[1], toFrame[2], toFrame[3], 0, 0],
        x,
        y
      }
    },

    preview (dx, dy) {
      if (!session) return
      const { parts, docToFrame: f, x, y } = session
      const fdx = f[0] * dx + f[2] * dy
      const fdy = f[1] * dx + f[3] * dy
      if (x) x.d = clampAxisDelta(parts.filter((p) => crossesMiddle(p.box.x0, p.box.x1, x.mid)).map((p) => p.box.x1 - p.box.x0), { ...x, d: fdx })
      if (y) y.d = clampAxisDelta(parts.filter((p) => crossesMiddle(p.box.y0, p.box.y1, y.mid)).map((p) => p.box.y1 - p.box.y0), { ...y, d: fdy })
      for (const part of parts) {
        const mx = x ? axisMap(part.box.x0, part.box.x1, x) : { k: 1, t: 0 }
        const my = y ? axisMap(part.box.y0, part.box.y1, y) : { k: 1, t: 0 }
        // the frame map, brought into the part's parent space
        part.m = multiply(invert(part.toFrame), multiply([mx.k, 0, 0, my.k, mx.t, my.t], part.toFrame))
      }
      svgCanvas.snapshotHistory.preview((root) => {
        let out = root
        for (const { el, m, own } of parts) {
          const shown = multiply(m, own).map((v) => Number(v.toFixed(6)))
          out = setAttrsById(out, el.id, { transform: `matrix(${shown.join(' ')})` })
        }
        return out
      })
      refreshSelectors(session.selected)
      svgCanvas.call('transition', session.selected)
    },

    commit () {
      if (!session) return
      const { parts, selected } = session
      session = null
      svgCanvas.snapshotHistory.cancelPreview()
      svgCanvas.transact('Stretch', () => applyAffines(svgCanvas, 'Stretch', parts.map(({ el, m }) => ({ el, m }))))
      refreshSelectors(selected)
      svgCanvas.call('changed', selected)
    },

    cancel () {
      if (!session) return
      const { selected } = session
      session = null
      svgCanvas.snapshotHistory.cancelPreview()
      refreshSelectors(selected)
    },

    isActive: () => session !== null,

    setSelectionSize (width, height) {
      const selected = svgCanvas.getSelectedElements().filter(Boolean)
      if (!selected.length) return
      const box = svgCanvas.getStrokedBBoxDefaultVisible(selected)
      if (!box || !(box.width > 0) || !(box.height > 0) || !(width > 0) || !(height > 0)) return
      const sx = width / box.width
      const sy = height / box.height
      if (Math.abs(sx - 1) < 1e-9 && Math.abs(sy - 1) < 1e-9) return
      const scale: Affine = [sx, 0, 0, sy, box.x - sx * box.x, box.y - sy * box.y]
      const doc = layer()
      svgCanvas.transact('Resize', () => {
        applyAffines(svgCanvas, 'Resize', selected.map((el) => {
          const toDoc = between(el.parentNode as Element, doc)
          return { el, m: multiply(invert(toDoc), multiply(scale, toDoc)) }
        }))
      })
      refreshSelectors(selected)
      svgCanvas.call('changed', selected)
    }
  }
  return stretch
}
