/**
 * Path-editing operations on the anchor model (`anchor-path.js`): Remove Anchor
 * (keeps the shape by refitting the neighbours' handles), Add Anchor Points,
 * Average and Join. Pure geometry — the node editor (`path-actions.js`) and
 * the canvas-level Join (`path-join.js`) call into it.
 *
 * Ported from VectorCraft (https://github.com/storytold/vectorcraft),
 * `crates/pathops/src/edit.rs`, MIT OR Apache-2.0.
 *
 * @module path-edit
 * @license MIT
 */

import {
  segCubic, splitCubic, isLineSegment, hasIn, hasOut, segmentCount, anchorsToD
} from './anchor-path.ts'
import {
  fitSingleFrom, sampleCubic, startTangent, endTangent
} from './bezier-fit.ts'
import type { Anchor, Cubic, Pt, SubPath } from './anchor-path.ts'

/** A segment of the node editor's `Path#segs`. */
export interface NodeSeg { type: number, item: Record<string, number> }

const same = (a: Pt, b: Pt): boolean => Math.abs(a.x - b.x) < 1e-6 && Math.abs(a.y - b.y) < 1e-6
const copyPt = (p: Pt): Pt => ({ x: p.x, y: p.y })
const copyAnchor = (a: Anchor): Anchor => ({ p: copyPt(a.p), hIn: copyPt(a.hIn), hOut: copyPt(a.hOut) })
const copySub = (sp: SubPath): SubPath => ({ closed: sp.closed, anchors: sp.anchors.map(copyAnchor) })

/** Samples per segment when refitting across a removed anchor. */
const REFIT_SAMPLES = 16

/**
 * The fit `f` (curve, error, worst point) with the least error for an argument
 * in `[a, b]`, by a golden-section search (a bounded number of steps).
 */
const goldenMin = (f: (k: number) => [Cubic, number, number], a: number, b: number): [Cubic, number, number] => {
  const R = 0.618033988749895
  let x1 = b - R * (b - a)
  let x2 = a + R * (b - a)
  let f1 = f(x1)
  let f2 = f(x2)
  for (let i = 0; i < 40; i++) {
    // A NaN error never wins.
    if (f1[1] < f2[1] || Number.isNaN(f2[1])) {
      b = x2
      x2 = x1
      f2 = f1
      x1 = b - R * (b - a)
      f1 = f(x1)
    } else {
      a = x1
      x1 = x2
      f1 = f2
      x2 = a + R * (b - a)
      f2 = f(x2)
    }
  }
  return f1[1] <= f2[1] ? f1 : f2
}

/**
 * Remove anchor `index` without opening the path. Its neighbours keep their
 * handle directions and their facing handles are refitted so one cubic follows
 * the two segments that met there; two straight segments become one. Removing
 * an end of an open path drops its segment. Mutates `sp`.
 * @returns false (and `sp` untouched) when `index` is out of range.
 */
export const removeAnchor = (sp: SubPath, index: number): boolean => {
  const n = sp.anchors.length
  if (!(index >= 0 && index < n)) return false
  if ((sp.closed || (index > 0 && index + 1 < n)) && n >= 3) {
    const pi = (index + n - 1) % n
    const ni = (index + 1) % n
    const bothLines = isLineSegment(sp.anchors[pi], sp.anchors[index]) &&
      isLineSegment(sp.anchors[index], sp.anchors[ni])
    if (!bothLines) {
      const left = segCubic(sp, pi)
      const right = segCubic(sp, index)
      const pts: Pt[] = []
      sampleCubic(left, REFIT_SAMPLES, pts, true)
      sampleCubic(right, REFIT_SAMPLES, pts, false)
      const t0 = startTangent(left)
      const t1 = endTangent(right)
      const N = REFIT_SAMPLES
      // The new curve passes the removed point at some parameter k: the left
      // samples sit at k·i/N, the right ones at k + (1 − k)·i/N. Search k for
      // the closest fit.
      const fit = (k: number): [Cubic, number, number] => {
        const u: number[] = []
        for (let i = 0; i <= N; i++) u.push(k * i / N)
        for (let i = 1; i <= N; i++) u.push(k + (1 - k) * i / N)
        return fitSingleFrom(pts, u, t0, t1)
      }
      const [c] = goldenMin(fit, 0, 1)
      const finite = (p: Pt): boolean => Number.isFinite(p.x) && Number.isFinite(p.y)
      if (finite(c.p1) && finite(c.p2)) {
        sp.anchors[pi].hOut = copyPt(c.p1)
        sp.anchors[ni].hIn = copyPt(c.p2)
      }
    }
  }
  sp.anchors.splice(index, 1)
  if (!sp.closed && sp.anchors.length) {
    // A new end has nothing beyond it.
    const first = sp.anchors[0]
    const last = sp.anchors[sp.anchors.length - 1]
    first.hIn = copyPt(first.p)
    last.hOut = copyPt(last.p)
  }
  if (sp.anchors.length < 3) {
    sp.closed = sp.closed && sp.anchors.length === 2 && sp.anchors.some((a) => hasIn(a) || hasOut(a))
  }
  return true
}

/**
 * Split segment `seg` of `sp` at parameter `t`, inserting a new anchor.
 * Mutates `sp`.
 * @returns The new anchor's index.
 */
export const insertAnchor = (sp: SubPath, seg: number, t: number): number => {
  const n = sp.anchors.length
  const c = segCubic(sp, seg)
  const i0 = seg % n
  const i1 = (seg + 1) % n
  const line = isLineSegment(sp.anchors[i0], sp.anchors[i1])
  const l = splitCubic(c, 0, t)
  const r = splitCubic(c, t, 1)
  let mid: Anchor
  if (line) {
    mid = { p: copyPt(l.p3), hIn: copyPt(l.p3), hOut: copyPt(l.p3) }
  } else {
    sp.anchors[i0].hOut = copyPt(l.p1)
    sp.anchors[i1].hIn = copyPt(r.p2)
    mid = { p: copyPt(l.p3), hIn: copyPt(l.p2), hOut: copyPt(r.p1) }
  }
  sp.anchors.splice(seg + 1, 0, mid)
  return seg + 1
}

/**
 * Add Anchor Points: one new anchor at the middle (t = 0.5) of every segment.
 * @returns A new array; the input is untouched.
 */
export const addAnchorPoints = (subpaths: SubPath[]): SubPath[] => {
  const out = subpaths.map(copySub)
  for (const sp of out) {
    for (let seg = segmentCount(sp) - 1; seg >= 0; seg--) insertAnchor(sp, seg, 0.5)
  }
  return out
}

/**
 * Average: move the selected anchors (with their handles) to their average
 * position along `axis`.
 * @param selection - `[subpath, anchor]` pairs.
 * @param axis - `h` aligns on a common y (horizontal line),
 *   `v` on a common x, `both` collapses to the centroid.
 * @returns A new array; the input is untouched.
 */
export const averageAnchors = (subpaths: SubPath[], selection: Array<[number, number]>, axis: 'h' | 'v' | 'both'): SubPath[] => {
  const out = subpaths.map(copySub)
  const picked = selection
    .map(([s, a]) => out[s]?.anchors[a])
    .filter((a): a is Anchor => Boolean(a))
  if (!picked.length) return out
  const cx = picked.reduce((acc, a) => acc + a.p.x, 0) / picked.length
  const cy = picked.reduce((acc, a) => acc + a.p.y, 0) / picked.length
  for (const a of new Set(picked)) {
    const dx = axis === 'h' ? 0 : cx - a.p.x
    const dy = axis === 'v' ? 0 : cy - a.p.y
    for (const key of ['p', 'hIn', 'hOut'] as const) {
      a[key] = { x: a[key].x + dx, y: a[key].y + dy }
    }
  }
  return out
}

const reverseSub = (sp: SubPath): void => {
  sp.anchors.reverse()
  sp.anchors = sp.anchors.map((a) => ({ p: a.p, hIn: a.hOut, hOut: a.hIn }))
}

/**
 * The subpath run the other way (its handles swap with it).
 * @returns A new subpath.
 */
export const reversedSubpath = (sp: SubPath): SubPath => {
  const out = copySub(sp)
  reverseSub(out)
  return out
}

const endAnchor = (sp: SubPath, last: boolean): Anchor => sp.anchors[last ? sp.anchors.length - 1 : 0]

/**
 * Join. Open subpaths are joined nearest-endpoint-first into one open path
 * (endpoints closer than `tolerance` merge into a single anchor, otherwise a
 * straight segment connects them). A single open subpath is closed instead.
 * Closed subpaths pass through unchanged.
 * @returns A new array; the input is untouched.
 */
export const joinSubpaths = (subpaths: SubPath[], tolerance = 0): SubPath[] => {
  const closed: SubPath[] = []
  const open: SubPath[] = []
  for (const sp of subpaths.map(copySub)) {
    if (sp.closed || sp.anchors.length < 2) {
      if (sp.anchors.length) closed.push(sp)
    } else {
      open.push(sp)
    }
  }
  if (open.length === 1) {
    const sp = open[0]
    const first = endAnchor(sp, false)
    const last = endAnchor(sp, true)
    const endsMeet = sp.anchors.length > 2 && Math.hypot(first.p.x - last.p.x, first.p.y - last.p.y) <= tolerance
    if (endsMeet) {
      sp.anchors.pop()
      sp.anchors[0] = { p: first.p, hIn: hasIn(last) ? last.hIn : copyPt(first.p), hOut: first.hOut }
    } else {
      first.hIn = copyPt(first.p)
      last.hOut = copyPt(last.p)
    }
    sp.closed = true
    return [...closed, sp]
  }
  while (open.length > 1) {
    // The closest pair of endpoints on different subpaths.
    let best = { d: Infinity, i: 0, j: 0, ei: false, ej: false }
    for (let i = 0; i < open.length; i++) {
      for (let j = i + 1; j < open.length; j++) {
        for (const ei of [false, true]) {
          for (const ej of [false, true]) {
            const pi = endAnchor(open[i], ei).p
            const pj = endAnchor(open[j], ej).p
            const d = Math.hypot(pi.x - pj.x, pi.y - pj.y)
            if (d < best.d) best = { d, i, j, ei, ej }
          }
        }
      }
    }
    const { d, i, j, ei, ej } = best
    const b = open.splice(j, 1)[0]
    attach(open[i], ei, b, ej, d <= tolerance)
  }
  return [...closed, ...open]
}

/**
 * Join end `aAtEnd` of `a` to end `bAtEnd` of `b` (`true` = the last anchor).
 * Either may be a lone anchor. Endpoints closer than `tolerance` merge into one
 * anchor, otherwise a straight segment connects them.
 * @returns A new open subpath; the inputs are untouched.
 */
export const joinEnds = (a: SubPath, aAtEnd: boolean, b: SubPath, bAtEnd: boolean, tolerance = 0): SubPath => {
  const out = copySub(a)
  const rest = copySub(b)
  const gap = Math.hypot(endAnchor(a, aAtEnd).p.x - endAnchor(b, bAtEnd).p.x, endAnchor(a, aAtEnd).p.y - endAnchor(b, bAtEnd).p.y)
  attach(out, aAtEnd, rest, bAtEnd, gap <= tolerance)
  return out
}

/**
 * Append `b` to `a` (both are changed), reversing either so the chosen ends meet; `merge` fuses the two meeting anchors.
 */
const attach = (a: SubPath, aAtEnd: boolean, b: SubPath, bAtEnd: boolean, merge: boolean): void => {
  if (!aAtEnd) reverseSub(a)
  if (bAtEnd) reverseSub(b)
  const tail = endAnchor(a, true)
  if (merge && b.anchors.length) {
    const first = b.anchors.shift() as Anchor
    // A retracted handle sits on its own anchor, so re-seat it on the merged one.
    a.anchors[a.anchors.length - 1] = { p: tail.p, hIn: tail.hIn, hOut: hasOut(first) ? first.hOut : copyPt(tail.p) }
  } else {
    tail.hOut = copyPt(tail.p)
    b.anchors[0].hIn = copyPt(b.anchors[0].p)
  }
  a.anchors.push(...b.anchors)
}

const REL = new Set([3, 5, 7, 9, 11, 13, 15, 17, 19])

/**
 * Build anchor subpaths from the node editor's segment list, remembering which
 * anchor each segment index is the grip of. The editor models a closed subpath
 * as `M start … <segment back to start> Z`: that closing segment (and `M`) both
 * stand for the start anchor, which is folded into one anchor here.
 * @param segs - `Path#segs`.
 * @returns `owner` maps a segment index to `[subpath, anchor]`.
 */
export const segsToSubpaths = (segs: NodeSeg[]): { subpaths: SubPath[], owner: Map<number, [number, number]> } => {
  const subpaths: SubPath[] = []
  const grips: number[][][] = [] // per subpath: per anchor, the seg indices that grip it
  let cx = 0
  let cy = 0
  let sx = 0
  let sy = 0
  let prevC2: number[] | null = null // for S/s reflection
  let cur = null as SubPath | null
  let curGrips = null as number[][] | null
  const pt = (x: number, y: number): Pt => ({ x, y })
  const addAnchor = (i: number, x: number, y: number, c1?: number[], c2?: number[]): void => {
    if (!cur || !curGrips) return
    const prev = cur.anchors[cur.anchors.length - 1]
    if (c1) prev.hOut = pt(c1[0], c1[1])
    cur.anchors.push({ p: pt(x, y), hIn: c2 ? pt(c2[0], c2[1]) : pt(x, y), hOut: pt(x, y) })
    curGrips.push([i])
    prevC2 = c2 ?? null
    cx = x
    cy = y
  }
  segs.forEach((seg, i) => {
    const t = seg.type
    const it = seg.item
    const rel = REL.has(t)
    const ox = rel ? cx : 0
    const oy = rel ? cy : 0
    switch (t) {
      case 2:
      case 3:
        cx = ox + it.x
        cy = oy + it.y
        sx = cx
        sy = cy
        cur = { closed: false, anchors: [{ p: pt(cx, cy), hIn: pt(cx, cy), hOut: pt(cx, cy) }] }
        curGrips = [[i]]
        subpaths.push(cur)
        grips.push(curGrips)
        prevC2 = null
        break
      case 1:
        if (cur) cur.closed = true
        cx = sx
        cy = sy
        prevC2 = null
        break
      case 6:
      case 7:
        addAnchor(i, ox + it.x, oy + it.y, [ox + it.x1, oy + it.y1], [ox + it.x2, oy + it.y2])
        break
      case 16:
      case 17: {
        const c1 = prevC2 ? [2 * cx - prevC2[0], 2 * cy - prevC2[1]] : [cx, cy]
        addAnchor(i, ox + it.x, oy + it.y, c1, [ox + it.x2, oy + it.y2])
        break
      }
      case 8:
      case 9: {
        // quadratic → cubic
        const qx = ox + it.x1
        const qy = oy + it.y1
        const x = ox + it.x
        const y = oy + it.y
        addAnchor(i, x, y,
          [cx + 2 / 3 * (qx - cx), cy + 2 / 3 * (qy - cy)],
          [x + 2 / 3 * (qx - x), y + 2 / 3 * (qy - y)])
        break
      }
      case 12:
      case 13:
        addAnchor(i, ox + it.x, cy)
        break
      case 14:
      case 15:
        addAnchor(i, cx, oy + it.y)
        break
      default: // L and the segments with no cubic form here (arcs, T): a straight line to the end point
        if (typeof it.x === 'number' && typeof it.y === 'number') addAnchor(i, ox + it.x, oy + it.y)
    }
  })
  // Fold a closing segment that lands on the start into the start anchor.
  subpaths.forEach((sp, s) => {
    const g = grips[s]
    const n = sp.anchors.length
    if (sp.closed && n >= 3 && same(sp.anchors[n - 1].p, sp.anchors[0].p)) {
      const last = sp.anchors.pop() as Anchor
      sp.anchors[0].hIn = last.hIn
      const folded = g.pop() as number[]
      g[0].push(...folded)
    }
  })
  const owner = new Map<number, [number, number]>()
  grips.forEach((g, s) => g.forEach((ids, k) => ids.forEach((i) => owner.set(i, [s, k]))))
  return { subpaths, owner }
}

const emit = (subpaths: SubPath[]): string => anchorsToD(subpaths.filter((sp) => sp.anchors.length >= 2))

/**
 * `d` for a path with the nodes at the given segment indices removed, the
 * shape kept (see {@link removeAnchor}). Closed subpaths stay closed and open
 * ones open.
 * @param deleted - Segment indices.
 * @returns '' when nothing renderable remains.
 */
export const deleteNodesD = (segs: NodeSeg[], deleted: Iterable<number>): string => {
  const { subpaths, owner } = segsToSubpaths(segs)
  const perSub = subpaths.map(() => new Set<number>())
  for (const i of deleted) {
    const o = owner.get(i)
    if (o) perSub[o[0]].add(o[1])
  }
  subpaths.forEach((sp, s) => {
    // Highest first, so the remaining indices stay valid; each removal sees
    // the already-refitted neighbours.
    for (const k of [...perSub[s]].sort((a, b) => b - a)) removeAnchor(sp, k)
  })
  return emit(subpaths)
}

/**
 * `d` for a path with the nodes at the given segment indices averaged.
 * @param selected - Segment indices.
 */
export const averageNodesD = (segs: NodeSeg[], selected: Iterable<number>, axis: 'h' | 'v' | 'both'): string => {
  const { subpaths, owner } = segsToSubpaths(segs)
  const picks = [...selected].map((i) => owner.get(i)).filter((o): o is [number, number] => Boolean(o))
  return emit(averageAnchors(subpaths, picks, axis))
}

/** `d` for a path with a new anchor in the middle of every segment. */
export const addAnchorPointsD = (segs: NodeSeg[]): string => emit(addAnchorPoints(segsToSubpaths(segs).subpaths))
