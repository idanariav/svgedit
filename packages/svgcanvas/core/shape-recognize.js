// @ts-check
/**
 * Shape recognition for the Shaper tool: a rough freehand stroke becomes a clean shape.
 *
 * The stroke is classified by how closed it is, how many corners survive a coarse polyline
 * simplification independent of where drawing began, its edge/angle fit and how well it fills
 * its bounding box. Samples are spaced by distance so pointer speed does not bias the fit. A
 * zig-zag stroke with several reversals is a scribble (the Shaper deletes what it covers).
 *
 * DOM-free: points in, a description out. Ported from VectorCraft
 * (https://github.com/storytold/vectorcraft), `crates/geom/src/recognize.rs`, MIT OR Apache-2.0.
 * @module shape-recognize
 * @license MIT
 */

/** @typedef {{x: number, y: number}} Point */
/** A rectangle given by its centre and size (rotation, if any, is about the centre).
 * @typedef {{cx: number, cy: number, width: number, height: number}} CenterRect */
/** An axis-aligned box.
 * @typedef {{x: number, y: number, width: number, height: number}} Box */

/**
 * What the Shaper recognised.
 * `rotation` of a rectangle / ellipse is in degrees, a 45° step in [0, 180). A polygon's `rotation`
 * is the angle (degrees) of its first vertex from straight up, snapped (0 / 180 for a triangle,
 * 0 / 90 for a hexagon, 0 otherwise).
 * @typedef {{type: 'line', a: Point, b: Point}
 *   | {type: 'rectangle', rect: CenterRect, rotation: number}
 *   | {type: 'ellipse', rect: CenterRect, rotation: number}
 *   | {type: 'polygon', center: Point, radius: number, sides: number, rotation: number}
 *   | {type: 'scribble', rect: Box}} Recognized
 */

const SAMPLES = 256
const toDegrees = (/** @type {number} */ rad) => rad * 180 / Math.PI
const toRadians = (/** @type {number} */ deg) => deg * Math.PI / 180
const remEuclid = (/** @type {number} */ x, /** @type {number} */ p) => ((x % p) + p) % p
/** Rust's `f64::round` (half away from zero). */
const round = (/** @type {number} */ x) => Math.sign(x) * Math.round(Math.abs(x))
const dist = (/** @type {Point} */ a, /** @type {Point} */ b) => Math.hypot(a.x - b.x, a.y - b.y)

/**
 * @param {Point[]} pts
 * @returns {Box}
 */
const bbox = (pts) => {
  let minX = Infinity
  let minY = Infinity
  let maxX = -Infinity
  let maxY = -Infinity
  for (const p of pts) {
    minX = Math.min(minX, p.x)
    minY = Math.min(minY, p.y)
    maxX = Math.max(maxX, p.x)
    maxY = Math.max(maxY, p.y)
  }
  return { x: minX, y: minY, width: maxX - minX, height: maxY - minY }
}

/** @param {Point[]} pts */
const pathLen = (pts) => {
  let sum = 0
  for (let i = 1; i < pts.length; i++) sum += dist(pts[i - 1], pts[i])
  return sum
}

/**
 * @param {Point} p
 * @param {Point} a
 * @param {Point} b
 * @returns {number} distance from `p` to the segment `ab`
 */
export const distToSegment = (p, a, b) => {
  const abx = b.x - a.x
  const aby = b.y - a.y
  const l2 = abx * abx + aby * aby
  if (l2 < 1e-12) return dist(p, a)
  const t = Math.min(1, Math.max(0, ((p.x - a.x) * abx + (p.y - a.y) * aby) / l2))
  return dist(p, { x: a.x + abx * t, y: a.y + aby * t })
}

/**
 * Douglas–Peucker simplification with bounded stack use, even for noisy strokes.
 * @param {Point[]} pts
 * @param {number} tol
 * @returns {Point[]}
 */
export const simplify = (pts, tol) => {
  if (pts.length < 3) return pts.slice()
  const keep = new Array(pts.length).fill(false)
  keep[0] = true
  keep[pts.length - 1] = true
  /** @type {Array<[number, number]>} */
  const pending = [[0, pts.length - 1]]
  for (let job = pending.pop(); job; job = pending.pop()) {
    const [start, end] = job
    const a = pts[start]
    const b = pts[end]
    let offset = 0
    let deviation = 0
    for (let i = start + 1; i < end; i++) {
      const d = distToSegment(pts[i], a, b)
      if (d > deviation) {
        deviation = d
        offset = i
      }
    }
    if (deviation > tol) {
      keep[offset] = true
      if (offset > start + 1) pending.push([start, offset])
      if (end > offset + 1) pending.push([offset, end])
    }
  }
  return pts.filter((_, i) => keep[i])
}

/**
 * Sample by distance, so pointer speed/density cannot bias the shape fit. Bounds and length still
 * come from the complete stroke, but simplification works on at most 256 samples.
 * @param {Point[]} pts
 * @param {number} length
 * @returns {Point[]}
 */
export const resample = (pts, length) => {
  if (!pts.length) return []
  const first = pts[0]
  const last = pts[pts.length - 1]
  const out = [first]
  let walked = 0
  for (let i = 1; i < pts.length; i++) {
    const a = pts[i - 1]
    const b = pts[i]
    const segment = dist(a, b)
    if (segment <= 0) continue
    while (out.length < SAMPLES - 1) {
      const target = length * (out.length / (SAMPLES - 1))
      if (target > walked + segment) break
      const t = Math.min(1, Math.max(0, (target - walked) / segment))
      out.push({ x: a.x + (b.x - a.x) * t, y: a.y + (b.y - a.y) * t })
    }
    walked += segment
  }
  out.push(last)
  return out
}

/**
 * Index of the point farthest from `from` (the last one on ties, like Rust's `max_by`).
 * @param {Point[]} pts
 * @param {Point} from
 */
const farthest = (pts, from) => {
  let best = 0
  let bestD = -Infinity
  pts.forEach((p, i) => {
    const d = dist(p, from)
    if (d >= bestD) {
      bestD = d
      best = i
    }
  })
  return best
}

/**
 * A closed stroke has no special starting corner. Split at distant points and simplify both
 * halves, then discard collinear seam points instead of counting them as polygon vertices.
 * @param {Point[]} pts
 * @param {number} tol
 * @returns {Point[]}
 */
export const closedCorners = (pts, tol) => {
  if (!pts.length) return []
  const start = farthest(pts, pts[0])
  const ring = [...pts.slice(start), ...pts.slice(0, start)]
  const first = ring[0]
  const split = farthest(ring, first)
  const left = ring.slice(0, split + 1)
  const right = ring.slice(split)
  const corners = simplify(left, tol)
  corners.pop()
  const other = simplify([...right, first], tol)
  other.pop()
  corners.push(...other)
  while (corners.length > 3) {
    const n = corners.length
    const redundant = corners.findIndex((p, i) => distToSegment(p, corners[(i + n - 1) % n], corners[(i + 1) % n]) <= tol)
    if (redundant < 0) break
    corners.splice(redundant, 1)
  }
  return corners
}

/**
 * Area of the polygon through `poly` (closed implicitly by the shoelace sum from the first point).
 * @param {Point[]} poly
 */
const area = (poly) => {
  if (!poly.length) return 0
  const o = poly[0]
  let sum = 0
  for (let i = 1; i < poly.length; i++) {
    const a = poly[i - 1]
    const b = poly[i]
    // Translating to the first point avoids cancellation far from the document origin.
    sum += (a.x - o.x) * (b.y - o.y) - (a.y - o.y) * (b.x - o.x)
  }
  return Math.abs(sum) / 2
}

/**
 * Do the stroke's points hug the straight edges between `corners` (rather than bulging like an ellipse)?
 * @param {Point[]} pts
 * @param {Point[]} corners
 * @param {number} size
 * @param {number} tolerance
 */
const isPolygonal = (pts, corners, size, tolerance) => {
  if (!pts.length || corners.length < 3) return false
  let total = 0
  for (const p of pts) {
    let best = Number.MAX_VALUE
    for (let i = 0; i < corners.length; i++) {
      best = Math.min(best, distToSegment(p, corners[i], corners[(i + 1) % corners.length]))
    }
    total += best
  }
  return total / pts.length < tolerance * size
}

/**
 * @param {Point[]} corners
 * @param {number} size
 */
const rightAngles = (corners, size) => {
  const n = corners.length
  for (let i = 0; i < n; i++) {
    const a = corners[i]
    const b = corners[(i + 1) % n]
    const c = corners[(i + 2) % n]
    const ux = b.x - a.x
    const uy = b.y - a.y
    const vx = c.x - b.x
    const vy = c.y - b.y
    const lu = Math.hypot(ux, uy)
    const lv = Math.hypot(vx, vy)
    if (!(lu > 0.03 * size && lv > 0.03 * size && Math.abs((ux * vx + uy * vy) / (lu * lv)) < 0.45)) return false
  }
  return true
}

/**
 * Four substantial, approximately perpendicular edges, even with uneven sides and corners.
 * @param {Point[]} pts
 * @param {Point[]} corners
 * @param {number} size
 */
const isRectangle = (pts, corners, size) =>
  corners.length === 4 && isPolygonal(pts, corners, size, 0.055) && rightAngles(corners, size)

/** @param {Point[]} pts */
const mean = (pts) => {
  const o = pts[0]
  let x = 0
  let y = 0
  for (const p of pts) {
    x += (p.x - o.x) / pts.length
    y += (p.y - o.y) / pts.length
  }
  return { x: o.x + x, y: o.y + y }
}

/**
 * Fit all vertices, so neither the starting point nor drawing direction picks the orientation.
 * @param {Point[]} corners
 * @param {number} step the candidate rotations are the multiples of `step` in [0, 360)
 * @returns {number} degrees
 */
export const polygonRotation = (corners, step) => {
  if (!corners.length) return 0
  const center = mean(corners)
  const period = 360 / corners.length
  /** @param {number} rotation */
  const error = (rotation) => corners.reduce((sum, p) => {
    const angle = toDegrees(Math.atan2(p.y - center.y, p.x - center.x)) + 90
    const delta = remEuclid(angle - rotation, period)
    return sum + Math.min(delta, period - delta) ** 2
  }, 0)
  // A candidate a whole number of periods from an earlier one is the same polygon (a hexagon at 270°
  // is the one at 90°) and scores the same up to rounding, so it is dropped: otherwise the platform's
  // `atan2` rounding picks between them.
  const candidates = [0, 90, 180, 270].filter((r) => r % step === 0)
  const distinct = candidates.filter((r, i) => !candidates.slice(0, i).some((q) => (r - q) % period === 0))
  let best = 0
  let bestError = Infinity
  for (const r of distinct) {
    const e = error(r)
    if (e < bestError) {
      bestError = e
      best = r
    }
  }
  return best
}

/**
 * @param {Point[]} corners
 * @returns {number} degrees, a multiple of 45 in [0, 180)
 */
export const rectangleRotation = (corners) => {
  let sin = 0
  let cos = 0
  corners.forEach((a, i) => {
    const b = corners[(i + 1) % corners.length]
    const angle = Math.atan2(b.y - a.y, b.x - a.x) * 4
    sin += Math.sin(angle)
    cos += Math.cos(angle)
  })
  return remEuclid(round(toDegrees(Math.atan2(sin, cos)) / 4 / 45) * 45, 180)
}

/**
 * @param {Point[]} pts
 * @returns {number} degrees, a multiple of 45 in [0, 180)
 */
const ellipseRotation = (pts) => {
  const center = mean(pts)
  let xx = 0
  let yy = 0
  let xy = 0
  for (const p of pts) {
    const vx = p.x - center.x
    const vy = p.y - center.y
    xx += vx * vx
    yy += vy * vy
    xy += vx * vy
  }
  // A near-circle has no useful orientation; keep it upright rather than following noise.
  if (Math.hypot(xx - yy, 2 * xy) < 0.1 * (xx + yy)) return 0
  return remEuclid(round(toDegrees(Math.atan2(2 * xy, xx - yy)) / 2 / 45) * 45, 180)
}

/**
 * Dimensions in the fitted frame, but the centre stays in document coordinates.
 * @param {Point[]} pts
 * @param {number} rotation degrees
 * @returns {CenterRect}
 */
const orientedBounds = (pts, rotation) => {
  if (rotation === 0) {
    const b = bbox(pts)
    return { cx: b.x + b.width / 2, cy: b.y + b.height / 2, width: b.width, height: b.height }
  }
  const origin = pts[0]
  const r = toRadians(rotation)
  const cos = Math.cos(r)
  const sin = Math.sin(r)
  // Into the fitted frame: rotate by -r about the stroke's first point.
  const local = pts.map((p) => {
    const x = p.x - origin.x
    const y = p.y - origin.y
    return { x: cos * x + sin * y, y: -sin * x + cos * y }
  })
  const b = bbox(local)
  const lx = b.x + b.width / 2
  const ly = b.y + b.height / 2
  return { cx: origin.x + cos * lx - sin * ly, cy: origin.y + sin * lx + cos * ly, width: b.width, height: b.height }
}

/**
 * Number of sharp direction reversals (turns of more than 120°) along the stroke.
 * @param {Point[]} pts
 * @param {number} minSeg
 */
const reversals = (pts, minSeg) => {
  const s = simplify(pts, minSeg)
  let count = 0
  for (let i = 2; i < s.length; i++) {
    const ux = s[i - 1].x - s[i - 2].x
    const uy = s[i - 1].y - s[i - 2].y
    const vx = s[i].x - s[i - 1].x
    const vy = s[i].y - s[i - 1].y
    const lu = Math.hypot(ux, uy)
    const lv = Math.hypot(vx, vy)
    if (lu > minSeg && lv > minSeg && (ux * vx + uy * vy) / (lu * lv) < -0.5) count++
  }
  return count
}

/**
 * Near-squares and near-circles snap to equal sides.
 * @param {CenterRect} r
 * @returns {CenterRect}
 */
const squared = (r) => {
  const { width: w, height: h } = r
  if (Math.abs(w - h) < 0.1 * Math.max(w, h)) {
    const s = (w + h) / 2
    return { cx: r.cx, cy: r.cy, width: s, height: s }
  }
  return r
}

/**
 * Recognise a freehand stroke.
 * @param {Point[]} stroke document points, in drawing order
 * @returns {Recognized|null} `null` when the stroke is not a shape (the Shaper then does nothing)
 */
export const recognize = (stroke) => {
  if (stroke.length < 2 || stroke.some((p) => !Number.isFinite(p.x) || !Number.isFinite(p.y))) return null
  const b = bbox(stroke)
  const size = Math.max(b.width, b.height)
  if (!(size >= 2) || !Number.isFinite(size)) return null
  const len = pathLen(stroke)
  if (!Number.isFinite(len) || len <= 0) return null
  const pts = resample(stroke, len)
  const first = pts[0]
  const last = pts[pts.length - 1]
  const chord = dist(first, last)

  // Scribble: several sharp reversals packed into a small area relative to the stroke length.
  if (reversals(pts, size * 0.08) >= 2 && len > 1.5 * size) {
    // An equilateral triangle turns 120° at its vertices: drawing noise can make all three turns
    // just exceed the reversal threshold. Its closed, straight edges and substantial area
    // distinguish it from a deletion scribble.
    const corners = closedCorners(pts, size * 0.12)
    const triangle = chord <= 0.25 * size && corners.length === 3 && area(pts) > 0.2 * size * size &&
      isPolygonal(pts, corners, size, 0.055)
    if (!triangle) return { type: 'scribble', rect: b }
  }

  // Line: every point near the chord.
  const maxDev = pts.reduce((m, p) => Math.max(m, distToSegment(p, first, last)), 0)
  if (chord > 0.5 * size && maxDev < 0.08 * Math.max(chord, 1) && len < 1.3 * chord) {
    return { type: 'line', a: first, b: last }
  }

  // Closed shapes: the ends meet (within a quarter of the size).
  if (chord > 0.25 * size) return null
  const corners = closedCorners(pts, size * 0.12)
  const fill = area(pts) / Math.max(b.width * b.height, 1e-9)
  if (!Number.isFinite(fill)) return null
  const center = { x: b.x + b.width / 2, y: b.y + b.height / 2 }
  const meanRadius = () => corners.reduce((sum, p) => sum + dist(p, center), 0) / corners.length

  if (corners.length === 3) {
    return { type: 'polygon', center, radius: meanRadius(), sides: 3, rotation: polygonRotation(corners, 180) }
  }
  if (corners.length === 4 && isRectangle(pts, corners, size)) {
    const rotation = rectangleRotation(corners)
    return { type: 'rectangle', rect: squared(orientedBounds(stroke, rotation)), rotation }
  }
  const n = corners.length
  if (n >= 5 && n <= 8 && fill > 0.6 && fill < 0.85 && isPolygonal(pts, corners, size, 0.02)) {
    return { type: 'polygon', center, radius: meanRadius(), sides: n, rotation: n === 6 ? polygonRotation(corners, 90) : 0 }
  }
  const rotation = ellipseRotation(pts)
  const rect = orientedBounds(stroke, rotation)
  if (area(pts) / Math.max(rect.width * rect.height, 1e-9) > 0.6) return { type: 'ellipse', rect: squared(rect), rotation }
  return null
}
