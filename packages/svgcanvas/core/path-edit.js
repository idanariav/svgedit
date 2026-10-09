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
} from './anchor-path.js'
import {
  fitSingleFrom, sampleCubic, startTangent, endTangent
} from './bezier-fit.js'

const same = (a, b) => Math.abs(a.x - b.x) < 1e-6 && Math.abs(a.y - b.y) < 1e-6
const copyPt = (p) => ({ x: p.x, y: p.y })
const copyAnchor = (a) => ({ p: copyPt(a.p), hIn: copyPt(a.hIn), hOut: copyPt(a.hOut) })
const copySub = (sp) => ({ closed: sp.closed, anchors: sp.anchors.map(copyAnchor) })

/** Samples per segment when refitting across a removed anchor. */
const REFIT_SAMPLES = 16

/**
 * The fit `f` (curve, error, worst point) with the least error for an argument
 * in `[a, b]`, by a golden-section search (a bounded number of steps).
 * @param {Function} f
 * @param {number} a
 * @param {number} b
 * @returns {Array}
 */
const goldenMin = (f, a, b) => {
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
 * @param {import('./anchor-path.js').SubPath} sp
 * @param {number} index
 * @returns {boolean} false (and `sp` untouched) when `index` is out of range.
 */
export const removeAnchor = (sp, index) => {
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
      const pts = []
      sampleCubic(left, REFIT_SAMPLES, pts, true)
      sampleCubic(right, REFIT_SAMPLES, pts, false)
      const t0 = startTangent(left)
      const t1 = endTangent(right)
      const N = REFIT_SAMPLES
      // The new curve passes the removed point at some parameter k: the left
      // samples sit at k·i/N, the right ones at k + (1 − k)·i/N. Search k for
      // the closest fit.
      const fit = (k) => {
        const u = []
        for (let i = 0; i <= N; i++) u.push(k * i / N)
        for (let i = 1; i <= N; i++) u.push(k + (1 - k) * i / N)
        return fitSingleFrom(pts, u, t0, t1)
      }
      const [c] = goldenMin(fit, 0, 1)
      const finite = (p) => Number.isFinite(p.x) && Number.isFinite(p.y)
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
 * @param {import('./anchor-path.js').SubPath} sp
 * @param {number} seg
 * @param {number} t
 * @returns {number} The new anchor's index.
 */
export const insertAnchor = (sp, seg, t) => {
  const n = sp.anchors.length
  const c = segCubic(sp, seg)
  const i0 = seg % n
  const i1 = (seg + 1) % n
  const line = isLineSegment(sp.anchors[i0], sp.anchors[i1])
  const l = splitCubic(c, 0, t)
  const r = splitCubic(c, t, 1)
  let mid
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
 * @param {import('./anchor-path.js').SubPath[]} subpaths
 * @returns {import('./anchor-path.js').SubPath[]} A new array; the input is untouched.
 */
export const addAnchorPoints = (subpaths) => {
  const out = subpaths.map(copySub)
  for (const sp of out) {
    for (let seg = segmentCount(sp) - 1; seg >= 0; seg--) insertAnchor(sp, seg, 0.5)
  }
  return out
}

/**
 * Average: move the selected anchors (with their handles) to their average
 * position along `axis`.
 * @param {import('./anchor-path.js').SubPath[]} subpaths
 * @param {Array<[number, number]>} selection - `[subpath, anchor]` pairs.
 * @param {'h'|'v'|'both'} axis - `h` aligns on a common y (horizontal line),
 *   `v` on a common x, `both` collapses to the centroid.
 * @returns {import('./anchor-path.js').SubPath[]} A new array; the input is untouched.
 */
export const averageAnchors = (subpaths, selection, axis) => {
  const out = subpaths.map(copySub)
  const picked = selection
    .map(([s, a]) => out[s]?.anchors[a])
    .filter(Boolean)
  if (!picked.length) return out
  const cx = picked.reduce((acc, a) => acc + a.p.x, 0) / picked.length
  const cy = picked.reduce((acc, a) => acc + a.p.y, 0) / picked.length
  for (const a of new Set(picked)) {
    const dx = axis === 'h' ? 0 : cx - a.p.x
    const dy = axis === 'v' ? 0 : cy - a.p.y
    for (const key of ['p', 'hIn', 'hOut']) {
      a[key] = { x: a[key].x + dx, y: a[key].y + dy }
    }
  }
  return out
}

const reverseSub = (sp) => {
  sp.anchors.reverse()
  sp.anchors = sp.anchors.map((a) => ({ p: a.p, hIn: a.hOut, hOut: a.hIn }))
}

const endAnchor = (sp, last) => sp.anchors[last ? sp.anchors.length - 1 : 0]

/**
 * Join. Open subpaths are joined nearest-endpoint-first into one open path
 * (endpoints closer than `tolerance` merge into a single anchor, otherwise a
 * straight segment connects them). A single open subpath is closed instead.
 * Closed subpaths pass through unchanged.
 * @param {import('./anchor-path.js').SubPath[]} subpaths
 * @param {number} [tolerance]
 * @returns {import('./anchor-path.js').SubPath[]} A new array; the input is untouched.
 */
export const joinSubpaths = (subpaths, tolerance = 0) => {
  const closed = []
  const open = []
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
    const a = open[i]
    if (!ei) reverseSub(a)
    if (ej) reverseSub(b)
    const tail = endAnchor(a, true)
    if (d <= tolerance && b.anchors.length) {
      const first = b.anchors.shift()
      // A retracted handle sits on its own anchor, so re-seat it on the merged one.
      a.anchors[a.anchors.length - 1] = { p: tail.p, hIn: tail.hIn, hOut: hasOut(first) ? first.hOut : copyPt(tail.p) }
    } else {
      tail.hOut = copyPt(tail.p)
      b.anchors[0].hIn = copyPt(b.anchors[0].p)
    }
    a.anchors.push(...b.anchors)
  }
  return [...closed, ...open]
}

const REL = new Set([3, 5, 7, 9, 11, 13, 15, 17, 19])

/**
 * Build anchor subpaths from the node editor's segment list, remembering which
 * anchor each segment index is the grip of. The editor models a closed subpath
 * as `M start … <segment back to start> Z`: that closing segment (and `M`) both
 * stand for the start anchor, which is folded into one anchor here.
 * @param {Array<{type: number, item: object}>} segs - `Path#segs`.
 * @returns {{subpaths: import('./anchor-path.js').SubPath[], owner: Map<number, [number, number]>}}
 *   `owner` maps a segment index to `[subpath, anchor]`.
 */
export const segsToSubpaths = (segs) => {
  const subpaths = []
  const grips = [] // per subpath: per anchor, the seg indices that grip it
  let cx = 0
  let cy = 0
  let sx = 0
  let sy = 0
  let prevC2 = null // for S/s reflection
  let cur = null
  let curGrips = null
  const pt = (x, y) => ({ x, y })
  const addAnchor = (i, x, y, c1, c2) => {
    if (!cur) return
    const prev = cur.anchors[cur.anchors.length - 1]
    if (c1) prev.hOut = pt(c1[0], c1[1])
    cur.anchors.push({ p: pt(x, y), hIn: c2 ? pt(c2[0], c2[1]) : pt(x, y), hOut: pt(x, y) })
    curGrips.push([i])
    prevC2 = c2
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
      const last = sp.anchors.pop()
      sp.anchors[0].hIn = last.hIn
      g[0].push(...g.pop())
    }
  })
  const owner = new Map()
  grips.forEach((g, s) => g.forEach((ids, k) => ids.forEach((i) => owner.set(i, [s, k]))))
  return { subpaths, owner }
}

const emit = (subpaths) => anchorsToD(subpaths.filter((sp) => sp.anchors.length >= 2))

/**
 * `d` for a path with the nodes at the given segment indices removed, the
 * shape kept (see {@link removeAnchor}). Closed subpaths stay closed and open
 * ones open.
 * @param {Array<{type: number, item: object}>} segs
 * @param {Iterable<number>} deleted - Segment indices.
 * @returns {string} '' when nothing renderable remains.
 */
export const deleteNodesD = (segs, deleted) => {
  const { subpaths, owner } = segsToSubpaths(segs)
  const perSub = subpaths.map(() => new Set())
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
 * @param {Array<{type: number, item: object}>} segs
 * @param {Iterable<number>} selected - Segment indices.
 * @param {'h'|'v'|'both'} axis
 * @returns {string}
 */
export const averageNodesD = (segs, selected, axis) => {
  const { subpaths, owner } = segsToSubpaths(segs)
  const picks = [...selected].map((i) => owner.get(i)).filter(Boolean)
  return emit(averageAnchors(subpaths, picks, axis))
}

/**
 * `d` for a path with a new anchor in the middle of every segment.
 * @param {Array<{type: number, item: object}>} segs
 * @returns {string}
 */
export const addAnchorPointsD = (segs) => emit(addAnchorPoints(segsToSubpaths(segs).subpaths))
