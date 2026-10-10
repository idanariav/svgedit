// @ts-check
/**
 * Corner-keeping path simplification, on the anchor model (`anchor-path.js`).
 *
 *  - `simplifyWith(subpaths, { tolerance, cornerAngleDeg })` refits every subpath
 *    with least-squares Béziers (`bezier-fit.js`): anchors where the path turns by
 *    more than `cornerAngleDeg` stay corners, each run between corners is sampled
 *    densely and refit with its end tangents fixed, a fit that is nearly straight
 *    becomes a line, and a subpath is never replaced by one with more anchors.
 *    Unlike paper.js' `simplify()`, sharp turns are not rounded off and
 *    `tolerance` is a distance in user units (paper compares squared distances).
 *  - `fitFreehand(points, tolerance)` turns a pencil stroke into a subpath: drop
 *    jitter, build a spline through the samples that keeps sharp turns as
 *    corners, then `simplifyWith` it. A turn is measured over a short stretch of
 *    the stroke (a few tolerances long) rather than at one sample, so it still
 *    shows in the dense, already smoothed points an editor's stabiliser and curve
 *    capture hand over; with sparse samples that stretch is one step, which is
 *    VectorCraft's rule.
 *
 * Ported from VectorCraft (https://github.com/storytold/vectorcraft),
 * `crates/pathops/src/edit.rs` (`simplify_with`) and `crates/engine/src/cmd/draw2.rs`
 * (`fit_freehand`), MIT OR Apache-2.0.
 *
 * @module path-fit
 * @license MIT
 */

import { segmentCount, segCubic, isLineSegment, cubicLength } from './anchor-path.js'
import { fitCubics, isStraight, sampleCubic, startTangent, endTangent, unit } from './bezier-fit.js'

/** @typedef {import('./anchor-path.js').SubPath} SubPath */
/** @typedef {import('./anchor-path.js').Cubic} Cubic */
/** @typedef {{x: number, y: number}} Pt */
/** @typedef {{c: Cubic, line: boolean}} Seg */

const dot = (/** @type {Pt} */ a, /** @type {Pt} */ b) => a.x * b.x + a.y * b.y
const dist = (/** @type {Pt} */ a, /** @type {Pt} */ b) => Math.hypot(a.x - b.x, a.y - b.y)

/**
 * @param {Pt} p
 * @returns {import('./anchor-path.js').Anchor}
 */
const cornerAnchor = (p) => ({ p: { x: p.x, y: p.y }, hIn: { x: p.x, y: p.y }, hOut: { x: p.x, y: p.y } })

/**
 * @param {SubPath} sp
 * @returns {Seg[]}
 */
const subpathSegs = (sp) => {
  const segs = []
  for (let i = 0; i < segmentCount(sp); i++) {
    segs.push({ c: segCubic(sp, i), line: isLineSegment(sp.anchors[i], sp.anchors[(i + 1) % sp.anchors.length]) })
  }
  return segs
}

/**
 * Anchors joined by `segs` (a line leaves its anchors handle-less). A closed result
 * ends where it began, so the last anchor folds into the first.
 * @param {Seg[]} segs
 * @param {boolean} closed
 * @returns {?SubPath}
 */
const segsToSubpath = (segs, closed) => {
  if (!segs.length) return null
  const anchors = [cornerAnchor(segs[0].c.p0)]
  for (const { c, line } of segs) {
    const from = anchors[anchors.length - 1]
    if (!line) from.hOut = { x: c.p1.x, y: c.p1.y }
    const to = cornerAnchor(c.p3)
    if (!line) to.hIn = { x: c.p2.x, y: c.p2.y }
    anchors.push(to)
  }
  if (closed && anchors.length > 2 && dist(anchors[0].p, anchors[anchors.length - 1].p) < 1e-6) {
    const last = /** @type {import('./anchor-path.js').Anchor} */ (anchors.pop())
    anchors[0].hIn = last.hIn
  }
  return { closed, anchors }
}

/**
 * The angle (degrees) the path turns by where segment `a` meets segment `b`.
 * @param {Seg} a
 * @param {Seg} b
 * @returns {number}
 */
const turnDeg = (a, b) => Math.acos(Math.max(-1, Math.min(1, dot(endTangent(a.c), startTangent(b.c))))) * 180 / Math.PI

/**
 * @param {SubPath} sp
 * @param {number} tol
 * @param {number} cornerAngleDeg
 * @returns {SubPath}
 */
const simplifySubpath = (sp, tol, cornerAngleDeg) => {
  let segs = subpathSegs(sp)
  const n = segs.length
  if (n === 0) return sp
  const cornerAt = (/** @type {number} */ i) =>
    (!sp.closed && i === 0) || turnDeg(segs[(i + n - 1) % n], segs[i % n]) > cornerAngleDeg
  let corners = []
  for (let i = 0; i < n; i++) if (cornerAt(i)) corners.push(i)
  if (sp.closed) {
    if (corners.length) {
      const k = corners[0]
      segs = [...segs.slice(k), ...segs.slice(0, k)]
      corners = corners.map((c) => c - k)
    } else {
      corners = [0]
    }
    corners.push(n)
  } else if (corners[corners.length - 1] !== n) {
    corners.push(n)
  }

  /** @type {Seg[]} */
  const result = []
  for (let w = 0; w + 1 < corners.length; w++) {
    const run = segs.slice(corners[w], corners[w + 1])
    if (!run.length) continue
    /** @type {Pt[]} */
    const pts = []
    run.forEach((s, k) => {
      const m = Math.min(256, Math.max(4, Math.ceil(cubicLength(s.c) / (tol * 0.5))))
      sampleCubic(s.c, m, pts, k === 0)
    })
    for (const c of fitCubics(pts, startTangent(run[0].c), endTangent(run[run.length - 1].c), tol)) {
      result.push({ c, line: isStraight(c, tol * 0.02) })
    }
  }
  const fitted = segsToSubpath(result, sp.closed)
  // Simplifying never adds anchors.
  return fitted && fitted.anchors.length <= sp.anchors.length ? fitted : sp
}

/**
 * Least-squares Bézier refit of every subpath, keeping the corners.
 * @param {SubPath[]} subpaths
 * @param {{tolerance: number, cornerAngleDeg?: number}} opts `tolerance`: largest distance between the original
 *   and the simplified path, in user units; `cornerAngleDeg`: turns sharper than this stay corners (default 30)
 * @returns {SubPath[]}
 */
export const simplifyWith = (subpaths, opts) => {
  const tol = Math.max(opts.tolerance, 1e-6)
  const angle = opts.cornerAngleDeg ?? 30
  return subpaths.map((sp) => simplifySubpath(sp, tol, angle))
}

/** cos of the sharpest turn that is still smooth: a turn of more than about 100° is a corner. */
const CORNER_COS = -0.2
/**
 * How far (in tolerances) each side of a sample the turn is measured. It has to be several times the length a
 * stabilised or captured corner is rounded over, or the chords on both sides lean towards each other and a
 * true 130° turn reads as 70°. The price: a smooth curve tighter than about half of `CORNER_REACH × tolerance`
 * in radius also reads as a corner, which at the pen's scale it is.
 */
const CORNER_REACH = 6

/**
 * Which samples are corners: the sharpest sample of each stretch where the stroke
 * turns by more than about 100°, the turn measured between the chords to the
 * samples `reach` of stroke length before and after (at least the neighbours).
 * @param {Pt[]} pts
 * @param {number} reach arc length each side of a sample the chords span
 * @returns {boolean[]}
 */
const markCorners = (pts, reach) => {
  const n = pts.length
  const s = [0]
  for (let i = 1; i < n; i++) s.push(s[i - 1] + dist(pts[i - 1], pts[i]))
  /** @type {number[]} */
  const cosAt = new Array(n).fill(1)
  let before = 0
  let after = 0
  for (let i = 1; i + 1 < n; i++) {
    while (before + 1 < i && s[i] - s[before + 1] >= reach) before++
    after = Math.max(after, i + 1)
    while (after + 1 < n && s[after] - s[i] < reach) after++
    // Chords that run into either end of the stroke are shorter than `reach`: still the neighbours at least.
    const a = { x: pts[i].x - pts[before].x, y: pts[i].y - pts[before].y }
    const b = { x: pts[after].x - pts[i].x, y: pts[after].y - pts[i].y }
    cosAt[i] = dot(a, b) / Math.max(Math.hypot(a.x, a.y) * Math.hypot(b.x, b.y), 1e-12)
  }
  const corner = new Array(n).fill(false)
  for (let i = 1; i + 1 < n; i++) {
    if (cosAt[i] >= CORNER_COS) continue
    // Only the sharpest sample of a stretch counts, or a rounded corner would flag a run of them.
    let sharpest = true
    for (let j = i - 1; j >= 1 && s[i] - s[j] < reach; j--) if (cosAt[j] < cosAt[i]) sharpest = false
    for (let j = i + 1; j + 1 < n && s[j] - s[i] < reach; j++) if (cosAt[j] <= cosAt[i]) sharpest = false
    corner[i] = sharpest
  }
  return corner
}

/**
 * The point `dist` of stroke length from the start of `pts` (`s` = cumulative lengths), interpolated.
 * @param {Pt[]} pts
 * @param {number[]} s
 * @param {number} target
 * @returns {Pt}
 */
const pointAtArc = (pts, s, target) => {
  if (target <= 0) return pts[0]
  if (target >= s[s.length - 1]) return pts[pts.length - 1]
  let i = 1
  while (s[i] < target) i++
  const t = (target - s[i - 1]) / Math.max(s[i] - s[i - 1], 1e-12)
  return { x: pts[i - 1].x + (pts[i].x - pts[i - 1].x) * t, y: pts[i - 1].y + (pts[i].y - pts[i - 1].y) * t }
}

/**
 * Unit direction of travel along `run` between `from` and `to` stroke length of its start (or, reversed,
 * its end), clipped to the run, so a rounded corner's flat bit can be skipped.
 * @param {Pt[]} run
 * @param {number} from
 * @param {number} to
 * @param {boolean} atEnd measure from the end of the run, travelling towards its end
 * @returns {Pt}
 */
const legDirection = (run, from, to, atEnd) => {
  const s = [0]
  for (let i = 1; i < run.length; i++) s.push(s[i - 1] + dist(run[i - 1], run[i]))
  const len = s[s.length - 1]
  // A short run has no leg to speak of: use all of it.
  const a = Math.min(from, len / 3)
  const b = Math.min(to, len)
  const p = atEnd ? pointAtArc(run, s, len - b) : pointAtArc(run, s, a)
  const q = atEnd ? pointAtArc(run, s, len - a) : pointAtArc(run, s, b)
  return unit({ x: q.x - p.x, y: q.y - p.y }) ?? unit({ x: run[run.length - 1].x - run[0].x, y: run[run.length - 1].y - run[0].y }) ?? { x: 1, y: 0 }
}

/**
 * Where the leg arriving at a corner and the leg leaving it would meet, if that is close to the corner sample
 * (a rounded corner's sample sits inside the true vertex).
 * @param {Pt} corner
 * @param {Pt} arriveFrom a point on the arriving leg, before the corner
 * @param {Pt} arriveDir unit direction of travel along it
 * @param {Pt} leaveTo a point on the leaving leg, after the corner
 * @param {Pt} leaveDir unit direction of travel along it
 * @param {number} reach farthest the vertex may lie from the corner sample
 * @returns {Pt}
 */
const vertexOf = (corner, arriveFrom, arriveDir, leaveTo, leaveDir, reach) => {
  const det = arriveDir.x * leaveDir.y - arriveDir.y * leaveDir.x
  if (Math.abs(det) < 1e-6) return corner // parallel legs: no vertex to find
  const dx = leaveTo.x - arriveFrom.x
  const dy = leaveTo.y - arriveFrom.y
  const t = (dx * leaveDir.y - dy * leaveDir.x) / det // along the arriving leg
  const u = (dx * arriveDir.y - dy * arriveDir.x) / det // along the leaving leg
  // The vertex is ahead of where the arriving leg was measured and behind where the leaving one was.
  if (t < 0 || u > 0) return corner
  const vertex = { x: arriveFrom.x + arriveDir.x * t, y: arriveFrom.y + arriveDir.y * t }
  return dist(vertex, corner) <= reach ? vertex : corner
}

/**
 * Fit a freehand stroke: drop jitter closer than a third of the tolerance, find the corners (a turn of
 * more than about 100°, measured over a few tolerances of stroke), put each corner where the two legs
 * meet, and fit the runs between corners with as few cubics as stay within `tolerance`.
 *
 * VectorCraft builds a Catmull-Rom spline through the samples and then runs `simplifyWith` on it; that
 * suits the sparse samples of a pen, but takes the end tangent at a corner from the local neighbours,
 * which on points an editor has already smoothed is the rounded bit, not the leg. Fitting the runs
 * straight from the points with leg tangents keeps the corner crisp.
 * @param {Pt[]} pts the stroke's points, in order
 * @param {number} tolerance the pencil's fidelity, in user units
 * @returns {SubPath}
 */
export const fitFreehand = (pts, tolerance) => {
  if (!pts.length) return { closed: false, anchors: [] }
  const min = Math.max(tolerance * 0.3, 0.05)
  const last = pts[pts.length - 1]
  const kept = [pts[0]]
  for (let i = 1; i < pts.length; i++) {
    if (dist(kept[kept.length - 1], pts[i]) >= min) kept.push(pts[i])
  }
  // The last sample always ends the stroke.
  if (kept.length > 1) kept[kept.length - 1] = last
  else if (pts.length > 1) kept.push(last)
  if (kept.length < 3) return { closed: false, anchors: kept.map(cornerAnchor) }

  const reach = tolerance * CORNER_REACH
  const flags = markCorners(kept, reach)
  const cuts = [0]
  flags.forEach((f, i) => { if (f) cuts.push(i) })
  cuts.push(kept.length - 1)

  /** @type {Pt[][]} */
  const runs = []
  for (let k = 0; k + 1 < cuts.length; k++) runs.push(kept.slice(cuts[k], cuts[k + 1] + 1))
  // Tangents of every run end, before any corner moves: along the legs, skipping the rounding at a corner.
  const outDir = runs.map((run, k) => legDirection(run, k === 0 ? 0 : reach / 3, reach, false))
  const inDir = runs.map((run, k) => legDirection(run, k === runs.length - 1 ? 0 : reach / 3, reach, true))
  // A corner sits where the leg before it and the leg after it meet.
  for (let k = 0; k + 1 < runs.length; k++) {
    const arrive = runs[k]
    const leave = runs[k + 1]
    const corner = arrive[arrive.length - 1]
    const s = [0]
    for (let i = 1; i < arrive.length; i++) s.push(s[i - 1] + dist(arrive[i - 1], arrive[i]))
    const sl = [0]
    for (let i = 1; i < leave.length; i++) sl.push(sl[i - 1] + dist(leave[i - 1], leave[i]))
    const from = pointAtArc(arrive, s, s[s.length - 1] - Math.min(reach, s[s.length - 1]))
    const to = pointAtArc(leave, sl, Math.min(reach, sl[sl.length - 1]))
    const vertex = vertexOf(corner, from, inDir[k], to, outDir[k + 1], reach)
    arrive[arrive.length - 1] = vertex
    leave[0] = vertex
  }

  /** @type {Seg[]} */
  const segs = []
  runs.forEach((run, k) => {
    for (const c of fitCubics(run, outDir[k], inDir[k], tolerance)) segs.push({ c, line: isStraight(c, tolerance * 0.02) })
  })
  return segsToSubpath(segs, false) ?? { closed: false, anchors: kept.map(cornerAnchor) }
}
