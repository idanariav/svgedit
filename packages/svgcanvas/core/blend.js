// @ts-check
/**
 * Blends: the geometry and paint of the steps between two key shapes. DOM-free; `blend-canvas.js` has the elements.
 *
 * - **Paths** are matched anchor by anchor: subpaths are paired in order (a missing one grows out of a point at the
 *   centre of the other path), resampled to equal anchor counts by splitting the longest segments, closed ones turned
 *   to the same winding and to the start anchor that twists least.
 * - **Paint** (`fill`, `stroke`) interpolates in OKLab, so mid-colours are perceptually even; opacities, stroke width,
 *   miter limit, dashes and dash offset interpolate as numbers; everything that cannot (caps, joins, fill rule,
 *   gradients, `none` against a colour) switches halfway.
 * - **Step counts**: a fixed number, a distance between steps, or "smooth colour" (enough steps that neighbours differ
 *   by about two levels of the largest colour channel).
 *
 * Ported from VectorCraft (https://github.com/storytold/vectorcraft), `crates/doc/src/blend.rs`
 * (`PathPair`, `lerp_paint`, `lerp_dash`, `blend_step_count`), MIT OR Apache-2.0. Colours go through OKLab (VectorCraft
 * interpolates in the document's colour model); spines, groups, text and gradient stop resampling are not ported.
 *
 * @module blend
 * @license MIT
 */

import { useMode, useParser, parse, modeRgb, modeOklab, parseHex, parseNamed, parseRgb, parseHsl, modeHsl, parseTransparent, formatHex } from 'culori/fn'
import { segCubic, splitCubic, evalCubic, isLineSegment, anchorBBox } from './anchor-path.js'

/** @typedef {import('./anchor-path.js').Anchor} Anchor */
/** @typedef {import('./anchor-path.js').SubPath} SubPath */
/** @typedef {import('./anchor-path.js').Pt} Pt */

const toRgb = useMode(modeRgb)
const toOklab = useMode(modeOklab)
useMode(modeHsl)
for (const parser of /** @type {any[]} */ ([parseHex, parseNamed, parseRgb, parseHsl, parseTransparent])) useParser(parser)

const lerp = (/** @type {number} */ a, /** @type {number} */ b, /** @type {number} */ t) => a + (b - a) * t
const lerpPt = (/** @type {Pt} */ a, /** @type {Pt} */ b, /** @type {number} */ t) => ({ x: lerp(a.x, b.x, t), y: lerp(a.y, b.y, t) })
const dist = (/** @type {Pt} */ a, /** @type {Pt} */ b) => Math.hypot(b.x - a.x, b.y - a.y)

// ---------------------------------------------------------------------------
// Paths
// ---------------------------------------------------------------------------

/** @param {Anchor} a @returns {Anchor} */
const cloneAnchor = (a) => ({ p: { ...a.p }, hIn: { ...a.hIn }, hOut: { ...a.hOut } })
/** @param {SubPath} sp @returns {SubPath} */
const cloneSub = (sp) => ({ closed: sp.closed, anchors: sp.anchors.map(cloneAnchor) })

/**
 * Split segment `i` of `sp` at its middle, adding an anchor.
 * @param {SubPath} sp edited in place
 * @param {number} i
 */
const splitSegment = (sp, i) => {
  const n = sp.anchors.length
  const a = sp.anchors[i]
  const j = (i + 1) % n
  const b = sp.anchors[j]
  const straight = isLineSegment(a, b)
  const c = segCubic(sp, i)
  const left = splitCubic(c, 0, 0.5)
  const right = splitCubic(c, 0.5, 1)
  const mid = left.p3
  if (!straight) {
    a.hOut = left.p1
    b.hIn = right.p2
  }
  const anchor = straight
    ? { p: mid, hIn: { ...mid }, hOut: { ...mid } }
    : { p: mid, hIn: left.p2, hOut: right.p1 }
  sp.anchors.splice(i + 1, 0, anchor)
}

/**
 * Add anchors to `sp` until it has `n`, splitting the longest segment each time.
 * @param {SubPath} sp edited in place
 * @param {number} n
 */
const grow = (sp, n) => {
  let guard = 0
  while (sp.anchors.length < n && guard++ < 20000) {
    const segs = sp.closed ? sp.anchors.length : sp.anchors.length - 1
    if (segs < 1) {
      const last = sp.anchors[sp.anchors.length - 1]
      sp.anchors.push(cloneAnchor(last))
      continue
    }
    let best = 0
    let bestLen = -1
    for (let i = 0; i < segs; i++) {
      const len = dist(sp.anchors[i].p, sp.anchors[(i + 1) % sp.anchors.length].p)
      if (len > bestLen) {
        bestLen = len
        best = i
      }
    }
    splitSegment(sp, best)
  }
}

/**
 * Signed area of a subpath (positive: clockwise on screen), from points along its segments.
 * @param {SubPath} sp
 * @returns {number}
 */
const signedArea = (sp) => {
  /** @type {Pt[]} */
  const pts = []
  const segs = sp.anchors.length
  for (let i = 0; i < segs; i++) {
    const c = segCubic(sp, i)
    for (let k = 0; k < 4; k++) pts.push(evalCubic(c, k / 4))
  }
  let area = 0
  pts.forEach((p, i) => {
    const q = pts[(i + 1) % pts.length]
    area += p.x * q.y - q.x * p.y
  })
  return area / 2
}

/**
 * Reverse a closed subpath, keeping its first anchor first.
 * @param {SubPath} sp edited in place
 */
const reverseClosed = (sp) => {
  const flipped = sp.anchors.map((a) => ({ p: a.p, hIn: a.hOut, hOut: a.hIn })).reverse()
  flipped.unshift(/** @type {Anchor} */ (flipped.pop())) // the old first anchor stays first
  sp.anchors = flipped
}

/**
 * Anchor positions relative to their box centre, scaled to unit size.
 * @param {SubPath} sp
 * @returns {Pt[]}
 */
const normalised = (sp) => {
  const xs = sp.anchors.map((a) => a.p.x)
  const ys = sp.anchors.map((a) => a.p.y)
  const [x0, x1, y0, y1] = [Math.min(...xs), Math.max(...xs), Math.min(...ys), Math.max(...ys)]
  const cx = (x0 + x1) / 2
  const cy = (y0 + y1) / 2
  const s = Math.max(x1 - x0, y1 - y0, 1e-9)
  return sp.anchors.map((a) => ({ x: (a.p.x - cx) / s, y: (a.p.y - cy) / s }))
}

/**
 * The rotation of `b`'s anchors that best matches `a`'s: the start point that keeps a closed blend from twisting.
 * @param {SubPath} a
 * @param {SubPath} b
 * @returns {number}
 */
const bestRotation = (a, b) => {
  const qa = normalised(a)
  const qb = normalised(b)
  const m = Math.min(qa.length, qb.length)
  if (m < 2) return 0
  const cost = (/** @type {number} */ s) => {
    let sum = 0
    for (let j = 0; j < m; j++) sum += Math.hypot(qa[j].x - qb[(j + s) % m].x, qa[j].y - qb[(j + s) % m].y) ** 2
    return sum
  }
  const stride = Math.ceil(m / 512)
  let best = 0
  let bestCost = Infinity
  for (let s = 0; s < m; s += stride) {
    const c = cost(s)
    if (c < bestCost) {
      bestCost = c
      best = s
    }
  }
  if (stride > 1) {
    for (let s = best - stride; s <= best + stride; s++) {
      const r = (s + m) % m
      const c = cost(r)
      if (c < bestCost) {
        bestCost = c
        best = r
      }
    }
  }
  return best
}

/**
 * @param {SubPath[]} subs
 * @returns {Pt}
 */
const centreOf = (subs) => {
  const box = anchorBBox(subs)
  return box ? { x: box.x + box.width / 2, y: box.y + box.height / 2 } : { x: 0, y: 0 }
}

/**
 * @typedef {object} PathPair
 * @property {SubPath[]} a
 * @property {SubPath[]} b
 */

/**
 * Two paths prepared for interpolation: subpaths paired in order, with equal anchor counts, the same winding and
 * matching start points.
 * @param {SubPath[]} a
 * @param {SubPath[]} b
 * @returns {PathPair}
 */
export const pairPaths = (a, b) => {
  const n = Math.max(a.length, b.length)
  const ca = centreOf(a)
  const cb = centreOf(b)
  /** @param {SubPath} like @param {Pt} c @returns {SubPath} */
  const point = (like, c) => ({
    closed: like.closed,
    anchors: like.anchors.map(() => ({ p: { ...c }, hIn: { ...c }, hOut: { ...c } }))
  })
  /** @type {SubPath[]} */
  const outA = []
  /** @type {SubPath[]} */
  const outB = []
  for (let i = 0; i < n; i++) {
    const sa = a[i] ? cloneSub(a[i]) : point(b[i], ca)
    const sb = b[i] ? cloneSub(b[i]) : point(a[i], cb)
    const closed = sa.closed && sb.closed && sa.anchors.length > 2 && sb.anchors.length > 2
    if (closed && signedArea(sa) * signedArea(sb) < 0) reverseClosed(sb)
    const m = Math.max(sa.anchors.length, sb.anchors.length)
    grow(sa, m)
    grow(sb, m)
    if (closed) {
      const r = bestRotation(sa, sb)
      sb.anchors = [...sb.anchors.slice(r), ...sb.anchors.slice(0, r)]
    }
    outA.push(sa)
    outB.push(sb)
  }
  return { a: outA, b: outB }
}

/**
 * The paired paths at `t` (0 = the first, 1 = the second).
 * @param {PathPair} pair
 * @param {number} t
 * @returns {SubPath[]}
 */
export const pathAt = (pair, t) => pair.a.map((sa, i) => {
  const sb = pair.b[i]
  return {
    closed: t < 0.5 ? sa.closed : sb.closed,
    anchors: sa.anchors.map((x, j) => {
      const y = sb.anchors[j]
      return { p: lerpPt(x.p, y.p, t), hIn: lerpPt(x.hIn, y.hIn, t), hOut: lerpPt(x.hOut, y.hOut, t) }
    })
  }
})

// ---------------------------------------------------------------------------
// Paint
// ---------------------------------------------------------------------------

/**
 * The red, green and blue (0..1) of a plain CSS colour.
 * @param {?string} str
 * @returns {?[number, number, number]} null for `none`, `url(#…)`, `currentColor`, …
 */
export const rgbOf = (str) => {
  const c = str ? parse(str.trim()) : undefined
  if (!c) return null
  const { r, g, b } = toRgb(c)
  return [r, g, b]
}

/**
 * Interpolate two paints: two plain colours in OKLab (as `#rrggbb`), anything else switches halfway.
 * @param {string} a
 * @param {string} b
 * @param {number} t
 * @returns {string}
 */
export const lerpPaint = (a, b, t) => {
  const ca = a.trim() === 'none' ? undefined : parse(a.trim())
  const cb = b.trim() === 'none' ? undefined : parse(b.trim())
  if (!ca || !cb) return t < 0.5 ? a : b
  if (t <= 0) return formatHex(toRgb(ca))
  if (t >= 1) return formatHex(toRgb(cb))
  const x = toOklab(ca)
  const y = toOklab(cb)
  return formatHex(toRgb({ mode: 'oklab', l: lerp(x.l, y.l, t), a: lerp(x.a, y.a, t), b: lerp(x.b, y.b, t) }))
}

const round = (/** @type {number} */ n, places = 4) => {
  const k = 10 ** places
  return Math.round(n * k) / k
}

/** @type {(a: number, b: number) => number} */
const gcd = (a, b) => (b ? gcd(b, a % b) : a)

/**
 * Interpolate dash patterns; patterns of different lengths repeat to a common one. A solid stroke against a dashed
 * one switches halfway.
 * @param {string} a `stroke-dasharray` value
 * @param {string} b
 * @param {number} t
 * @returns {string}
 */
const lerpDashes = (a, b, t) => {
  const list = (/** @type {string} */ s) => {
    const nums = s.split(/[\s,]+/).filter(Boolean).map(Number)
    return nums.length && nums.every(Number.isFinite) ? (nums.length % 2 ? [...nums, ...nums] : nums) : null
  }
  const pa = list(a)
  const pb = list(b)
  if (!pa || !pb) return t < 0.5 ? a : b
  const n = Math.min(12, (pa.length * pb.length) / gcd(pa.length, pb.length))
  return Array.from({ length: n }, (_, i) => round(lerp(pa[i % pa.length], pb[i % pb.length], t))).join(' ')
}

/** Presentation attributes a blend interpolates (`NUMBERS`, `PAINTS`) or switches halfway (`SWITCHED`). */
const PAINTS = ['fill', 'stroke']
const NUMBERS = ['fill-opacity', 'stroke-opacity', 'opacity', 'stroke-width', 'stroke-miterlimit', 'stroke-dashoffset']
const SWITCHED = ['fill-rule', 'stroke-linecap', 'stroke-linejoin']
export const BLEND_STYLE_ATTRS = [...PAINTS, ...NUMBERS, ...SWITCHED, 'stroke-dasharray']

/** What an attribute is when a shape does not say. */
/** @type {Object<string, string>} */
const DEFAULTS = {
  fill: 'black',
  stroke: 'none',
  'fill-opacity': '1',
  'stroke-opacity': '1',
  opacity: '1',
  'stroke-width': '1',
  'stroke-miterlimit': '4',
  'stroke-dashoffset': '0',
  'fill-rule': 'nonzero',
  'stroke-linecap': 'butt',
  'stroke-linejoin': 'miter',
  'stroke-dasharray': 'none'
}

/**
 * The style of a step between two keys at `t`.
 * @param {Object<string, string>} a presentation attributes of the first key (those it does not set take the SVG default)
 * @param {Object<string, string>} b
 * @param {number} t
 * @returns {Object<string, string>} only attributes at least one key sets
 */
export const lerpStyle = (a, b, t) => {
  /** @type {Object<string, string>} */
  const out = {}
  for (const name of BLEND_STYLE_ATTRS) {
    if (!(name in a) && !(name in b)) continue
    const x = a[name] ?? DEFAULTS[name]
    const y = b[name] ?? DEFAULTS[name]
    if (PAINTS.includes(name)) out[name] = lerpPaint(x, y, t)
    else if (NUMBERS.includes(name)) {
      const nx = parseFloat(x)
      const ny = parseFloat(y)
      out[name] = Number.isFinite(nx) && Number.isFinite(ny) ? String(round(lerp(nx, ny, t))) : (t < 0.5 ? x : y)
    } else if (name === 'stroke-dasharray') {
      out[name] = x.trim() === 'none' && y.trim() === 'none' ? 'none' : lerpDashes(x, y, t)
    } else out[name] = t < 0.5 ? x : y
  }
  return out
}

// ---------------------------------------------------------------------------
// Step counts
// ---------------------------------------------------------------------------

/**
 * @typedef {object} BlendSpacing
 * @property {'steps'|'distance'|'smooth'} mode
 * @property {number} steps steps between each pair of keys (mode `steps`)
 * @property {number} distance distance between steps (mode `distance`)
 */

export const MAX_STEPS = 200

/**
 * @typedef {object} KeyLook what the step count of `smooth` spacing looks at
 * @property {?string} fill
 * @property {?string} stroke
 * @property {{x: number, y: number, width: number, height: number}} box
 */

/**
 * Largest difference (0..1) between the same channel of the fills, and of the strokes, of two keys.
 * @param {KeyLook} a
 * @param {KeyLook} b
 * @returns {number}
 */
const colourDistance = (a, b) => {
  let d = 0
  for (const name of /** @type {const} */ (['fill', 'stroke'])) {
    const x = rgbOf(a[name])
    const y = rgbOf(b[name])
    if (x && y) for (let k = 0; k < 3; k++) d = Math.max(d, Math.abs(x[k] - y[k]))
  }
  return d
}

/**
 * The number of steps between two keys.
 * @param {BlendSpacing} spacing
 * @param {KeyLook} a
 * @param {KeyLook} b
 * @param {number} length distance between the keys (their centres)
 * @returns {number}
 */
export const stepCount = (spacing, a, b, length) => {
  if (spacing.mode === 'steps') return Math.min(MAX_STEPS, Math.max(1, Math.round(spacing.steps)))
  if (spacing.mode === 'distance') {
    const d = Math.max(spacing.distance, 0.01)
    return Math.min(MAX_STEPS, Math.max(0, Math.round(length / d) - 1))
  }
  const cd = colourDistance(a, b)
  if (cd > 1 / 255) return Math.min(256, Math.max(1, Math.ceil((cd * 255) / 2)), MAX_STEPS)
  // Same colours: base the count on how far apart the objects are.
  const far = Math.max(
    Math.abs(a.box.x - b.box.x), Math.abs(a.box.x + a.box.width - (b.box.x + b.box.width)),
    Math.abs(a.box.y - b.box.y), Math.abs(a.box.y + a.box.height - (b.box.y + b.box.height))
  )
  return Math.min(MAX_STEPS, Math.max(1, Math.ceil(far / 2)))
}
