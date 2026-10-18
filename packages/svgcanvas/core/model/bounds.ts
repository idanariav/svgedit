/**
 * Shape geometry for the document model: the box a shape covers (what `getBBox` answers) and the box its stroke paints, worked
 * out from the element's attributes with no browser, in the element's own coordinate system (a `transform` is the caller's).
 *
 * `geometricBounds` covers rect, circle, ellipse, line, polyline, polygon, path (curves by their extrema, arcs as the curves
 * `svgpath` makes of them), image and foreignObject; anything else (a group, text, a `use`) has no box here (undefined) and is
 * asked of the renderer. `strokedBounds` grows it by what the stroke paints: half the width all round, with the tips of the
 * miter spikes the miter limit keeps and the corners of projecting caps, which is what the plain `width / 2` margin of the
 * DOM-side `getStrokedBBox` misses. Markers are not included.
 *
 * Stroke reach after VectorCraft (https://github.com/storytold/vectorcraft),
 * `crates/doc/src/reach.rs` (`StrokeLayer::bounds_on`, `miter`, `needs_shape`), MIT OR Apache-2.0.
 *
 * No DOM and no `window` here: this runs in Node (the headless engine) as well as in the browser.
 * @module model/bounds
 * @license MIT
 */
import SvgPath from 'svgpath'
import { inheritedProperty, userLength } from './style.ts'
import type { ModelElement } from './node.ts'

export interface Bounds { x: number, y: number, width: number, height: number }

type Pt = readonly [number, number]
/** A drawn piece of a path, absolute: a line, a quadratic or a cubic (arcs and shorthand are already expanded). */
type Seg = readonly [Pt, Pt] | readonly [Pt, Pt, Pt] | readonly [Pt, Pt, Pt, Pt]
interface Sub { segs: Seg[], closed: boolean }

/** Tangents meeting at more than about 1 degree (this cosine) make a corner (VectorCraft `CORNER_COS`). */
const CORNER_COS = 0.9998

const attrNumber = (el: ModelElement, name: string, fallback = 0): number | undefined => {
  const raw = el.attrs.find((a) => a.name === name)?.value
  return raw === undefined ? fallback : userLength(raw)
}

const fromBox = (x0: number, y0: number, x1: number, y1: number): Bounds => ({ x: x0, y: y0, width: x1 - x0, height: y1 - y0 })

/** Parsed paths by their `d`: the same path is asked about again on every selection change and gesture step, and parsing is the cost. */
const PARSED = new Map<string, Sub[] | null>()
const PARSED_MAX = 256

/** The subpaths of a path's `d`, absolute and with arcs, shorthand, `H` and `V` expanded; null when `d` does not parse. Do not modify the result. */
export const subpathsOf = (d: string): Sub[] | null => {
  if (PARSED.has(d)) return PARSED.get(d) as Sub[] | null
  const parsed = parseSubpaths(d)
  if (PARSED.size >= PARSED_MAX) PARSED.clear()
  PARSED.set(d, parsed)
  return parsed
}

const parseSubpaths = (d: string): Sub[] | null => {
  const subs: Sub[] = []
  let cur: Sub | null = null
  let start: Pt = [0, 0]
  try {
    new SvgPath(d).abs().unarc().unshort().iterate((seg, _i, x, y) => {
      const at: Pt = [x, y]
      const n = (k: number): number => seg[k] as number
      switch (seg[0]) {
        case 'M': start = [n(1), n(2)]; cur = { segs: [], closed: false }; subs.push(cur); break
        case 'L': cur?.segs.push([at, [n(1), n(2)]]); break
        case 'H': cur?.segs.push([at, [n(1), y]]); break
        case 'V': cur?.segs.push([at, [x, n(1)]]); break
        case 'Q': cur?.segs.push([at, [n(1), n(2)], [n(3), n(4)]]); break
        case 'C': cur?.segs.push([at, [n(1), n(2)], [n(3), n(4)], [n(5), n(6)]]); break
        case 'Z':
          if (cur) {
            if (at[0] !== start[0] || at[1] !== start[1]) cur.segs.push([at, start])
            cur.closed = true
          }
          break
        default: break
      }
    })
  } catch {
    return null
  }
  return subs
}

/** The values of a quadratic or cubic Bezier coordinate where its derivative is zero, within (0, 1). */
const extrema = (c: readonly number[]): number[] => {
  const out: number[] = []
  if (c.length === 3) {
    const den = c[0] - 2 * c[1] + c[2]
    if (den !== 0) out.push((c[0] - c[1]) / den)
  } else if (c.length === 4) {
    // derivative / 3: a t^2 + b t + c0
    const a = -c[0] + 3 * c[1] - 3 * c[2] + c[3]
    const b = 2 * (c[0] - 2 * c[1] + c[2])
    const c0 = c[1] - c[0]
    if (Math.abs(a) < 1e-12) {
      if (b !== 0) out.push(-c0 / b)
    } else {
      const disc = b * b - 4 * a * c0
      if (disc >= 0) {
        const root = Math.sqrt(disc)
        out.push((-b + root) / (2 * a), (-b - root) / (2 * a))
      }
    }
  }
  return out.filter((t) => t > 0 && t < 1)
}

const evalAt = (c: readonly number[], t: number): number => {
  const u = 1 - t
  return c.length === 2
    ? u * c[0] + t * c[1]
    : c.length === 3
      ? u * u * c[0] + 2 * u * t * c[1] + t * t * c[2]
      : u * u * u * c[0] + 3 * u * u * t * c[1] + 3 * u * t * t * c[2] + t * t * t * c[3]
}

const segBox = (seg: Seg): [number, number, number, number] => {
  let x0 = Infinity; let y0 = Infinity; let x1 = -Infinity; let y1 = -Infinity
  const add = (x: number, y: number): void => { x0 = Math.min(x0, x); y0 = Math.min(y0, y); x1 = Math.max(x1, x); y1 = Math.max(y1, y) }
  // the ends only: a curve does not reach its control points
  add(seg[0][0], seg[0][1])
  add(seg[seg.length - 1][0], seg[seg.length - 1][1])
  if (seg.length > 2) {
    const xs = seg.map((p) => p[0])
    const ys = seg.map((p) => p[1])
    for (const t of extrema(xs)) add(evalAt(xs, t), evalAt(ys, t))
    for (const t of extrema(ys)) add(evalAt(xs, t), evalAt(ys, t))
  }
  return [x0, y0, x1, y1]
}

/** The box of a set of subpaths (curves by their extrema), or undefined for none. */
const boxOfSubs = (subs: readonly Sub[]): Bounds | undefined => {
  let x0 = Infinity; let y0 = Infinity; let x1 = -Infinity; let y1 = -Infinity
  for (const sub of subs) {
    for (const seg of sub.segs) {
      const b = segBox(seg)
      x0 = Math.min(x0, b[0]); y0 = Math.min(y0, b[1]); x1 = Math.max(x1, b[2]); y1 = Math.max(y1, b[3])
    }
  }
  return Number.isFinite(x0) ? fromBox(x0, y0, x1, y1) : undefined
}

const pointsOf = (el: ModelElement): Sub | undefined => {
  const nums = (el.attrs.find((a) => a.name === 'points')?.value ?? '').trim().split(/[\s,]+/).filter(Boolean).map(Number)
  if (nums.length < 4 || nums.length % 2 || !nums.every(Number.isFinite)) return undefined
  const pts: Pt[] = []
  for (let i = 0; i < nums.length; i += 2) pts.push([nums[i], nums[i + 1]])
  const segs: Seg[] = []
  for (let i = 1; i < pts.length; i++) segs.push([pts[i - 1], pts[i]])
  const closed = el.name === 'polygon'
  if (closed) segs.push([pts[pts.length - 1], pts[0]])
  return { segs, closed }
}

/** The subpaths a shape draws, for the tags that are made of straight or curved segments (a rect with square corners is four lines). */
const subpathsOfShape = (el: ModelElement): Sub[] | undefined => {
  switch (el.name) {
    case 'path': return subpathsOf(el.attrs.find((a) => a.name === 'd')?.value ?? '') ?? undefined
    case 'line': {
      const [x1, y1, x2, y2] = ['x1', 'y1', 'x2', 'y2'].map((n) => attrNumber(el, n))
      return [x1, y1, x2, y2].every((v) => v !== undefined) ? [{ segs: [[[x1 as number, y1 as number], [x2 as number, y2 as number]]], closed: false }] : undefined
    }
    case 'polyline': case 'polygon': {
      const sub = pointsOf(el)
      return sub && [sub]
    }
    case 'rect': {
      const [x, y, w, h, rx, ry] = ['x', 'y', 'width', 'height', 'rx', 'ry'].map((n) => attrNumber(el, n))
      if ([x, y, w, h].some((v) => v === undefined) || rx || ry) return undefined
      const [x0, y0, x1, y1] = [x as number, y as number, (x as number) + (w as number), (y as number) + (h as number)]
      return [{ segs: [[[x0, y0], [x1, y0]], [[x1, y0], [x1, y1]], [[x1, y1], [x0, y1]], [[x0, y1], [x0, y0]]], closed: true }]
    }
    default: return undefined
  }
}

/** The box `getBBox` gives `el` (its geometry, without the stroke), or undefined for a tag without one here or a value that does not parse. */
export const geometricBounds = (el: ModelElement): Bounds | undefined => {
  switch (el.name) {
    case 'circle': {
      const [cx, cy, r] = ['cx', 'cy', 'r'].map((n) => attrNumber(el, n))
      return cx === undefined || cy === undefined || r === undefined ? undefined : { x: cx - r, y: cy - r, width: 2 * r, height: 2 * r }
    }
    case 'ellipse': {
      const [cx, cy, rx, ry] = ['cx', 'cy', 'rx', 'ry'].map((n) => attrNumber(el, n))
      return [cx, cy, rx, ry].some((v) => v === undefined) ? undefined : { x: (cx as number) - (rx as number), y: (cy as number) - (ry as number), width: 2 * (rx as number), height: 2 * (ry as number) }
    }
    case 'image': case 'foreignObject': case 'rect': {
      if (el.name === 'rect') {
        const subs = subpathsOfShape(el)
        if (subs) return boxOfSubs(subs)
      }
      const [x, y, w, h] = ['x', 'y', 'width', 'height'].map((n) => attrNumber(el, n))
      return [x, y, w, h].some((v) => v === undefined) ? undefined : { x: x as number, y: y as number, width: w as number, height: h as number }
    }
    default: {
      const subs = subpathsOfShape(el)
      return subs && boxOfSubs(subs)
    }
  }
}

const unit = (v: Pt): Pt | undefined => {
  const len = Math.hypot(v[0], v[1])
  return len > 1e-12 ? [v[0] / len, v[1] / len] : undefined
}
const sub = (a: Pt, b: Pt): Pt => [a[0] - b[0], a[1] - b[1]]

/** The unit direction a segment leaves its start (`end` false) or arrives at its end, skipping coincident control points. */
const tangent = (seg: Seg, end: boolean): Pt | undefined => {
  const pts = end ? [...seg].reverse() : [...seg]
  for (let i = 1; i < pts.length; i++) {
    const v = unit(end ? sub(pts[0], pts[i]) : sub(pts[i], pts[0]))
    if (v) return v
  }
  return undefined
}

/** The corners of a subpath: the joint point and the unit tangents in and out (a closed subpath also joins its last segment to its first). */
const joints = (sub: Sub): Array<{ at: Pt, tIn: Pt, tOut: Pt }> => {
  const segs = sub.segs
  const out: Array<{ at: Pt, tIn: Pt, tOut: Pt }> = []
  const pairs = sub.closed && segs.length > 1 ? segs.length : segs.length - 1
  for (let i = 0; i < pairs; i++) {
    const a = segs[i]
    const b = segs[(i + 1) % segs.length]
    const tIn = tangent(a, true)
    const tOut = tangent(b, false)
    if (tIn && tOut) out.push({ at: a[a.length - 1], tIn, tOut })
  }
  return out
}

/** The miter tip at a corner with tangents `tIn`, `tOut` for a stroke reaching `side`, or undefined when the path does not turn there or the limit bevels it. */
const miterTip = (at: Pt, tIn: Pt, tOut: Pt, side: number, limit: number): Pt | undefined => {
  const cos = tIn[0] * tOut[0] + tIn[1] * tOut[1]
  // cos(half the turn) is sin(half the angle between the segments): the miter is side / it
  const half = Math.sqrt(Math.max(0, (1 + cos) / 2))
  if (cos >= CORNER_COS || half * limit < 1) return undefined
  const out = unit(sub(tIn, tOut))
  return out ? [at[0] + out[0] * (side / half), at[1] + out[1] * (side / half)] : undefined
}

/** The stroke a shape paints, resolved from the element and what it inherits (`chain`: ancestors first, `el` last); undefined for none. */
const strokeOf = (chain: readonly ModelElement[]): { width: number, join: string, cap: string, limit: number, dashed: boolean } | undefined => {
  const stroke = inheritedProperty(chain, 'stroke')
  if (stroke === undefined || stroke === 'none') return undefined
  const width = userLength(inheritedProperty(chain, 'stroke-width')) ?? 1
  if (!(width > 0)) return undefined
  const dash = inheritedProperty(chain, 'stroke-dasharray')
  return {
    width,
    join: inheritedProperty(chain, 'stroke-linejoin') ?? 'miter',
    cap: inheritedProperty(chain, 'stroke-linecap') ?? 'butt',
    limit: Math.max(1, Number(inheritedProperty(chain, 'stroke-miterlimit') ?? 4) || 4),
    dashed: dash !== undefined && dash !== 'none' && /[1-9]/.test(dash)
  }
}

/**
 * The box `el` paints: its geometry grown by half its stroke width all round, plus the miter tips the limit keeps at its corners
 * and the corners of projecting (square) caps on open subpaths. A stroke with round or bevelled joins and butt or round caps
 * needs only the margin, and the path is not looked at (VectorCraft's `needs_shape`). `chain` is the element's ancestors, root
 * first, `el` last. Undefined when the element has no box here.
 */
export const strokedBounds = (chain: readonly ModelElement[]): Bounds | undefined => {
  const el = chain[chain.length - 1]
  const box = geometricBounds(el)
  if (!box) return undefined
  const stroke = strokeOf(chain)
  if (!stroke) return box
  const side = stroke.width / 2
  let x0 = box.x; let y0 = box.y; let x1 = box.x + box.width; let y1 = box.y + box.height
  const grow = (p: Pt): void => { x0 = Math.min(x0, p[0]); y0 = Math.min(y0, p[1]); x1 = Math.max(x1, p[0]); y1 = Math.max(y1, p[1]) }
  const needsShape = stroke.join === 'miter' || stroke.cap === 'square'
  // a rounded rect has no corners to spike; a circle or ellipse has none either
  const subs = needsShape ? subpathsOfShape(el) : undefined
  for (const s of subs ?? []) {
    if (stroke.join === 'miter') {
      for (const { at, tIn, tOut } of joints(s)) {
        const tip = miterTip(at, tIn, tOut, side, stroke.limit)
        if (tip) grow(tip)
      }
    }
    if (stroke.cap === 'square' && !s.closed && s.segs.length) {
      const first = s.segs[0]
      const last = s.segs[s.segs.length - 1]
      const back = tangent(first, false)
      const ends: Array<[Pt, Pt | undefined]> = [[first[0], back && [-back[0], -back[1]]], [last[last.length - 1], tangent(last, true)]]
      for (const [at, dir] of ends) {
        if (!dir) continue
        const n: Pt = [-dir[1] * side, dir[0] * side]
        grow([at[0] + dir[0] * side + n[0], at[1] + dir[1] * side + n[1]])
        grow([at[0] + dir[0] * side - n[0], at[1] + dir[1] * side - n[1]])
      }
    }
  }
  // dashes put a cap on every dash: projecting ones reach a corner's diagonal anywhere
  const reach = stroke.cap === 'square' && stroke.dashed ? side * Math.SQRT2 : side
  return fromBox(Math.min(x0, box.x - reach), Math.min(y0, box.y - reach), Math.max(x1, box.x + box.width + reach), Math.max(y1, box.y + box.height + reach))
}
