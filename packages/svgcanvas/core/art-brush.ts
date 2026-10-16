/**
 * Art and pattern brush geometry: artwork bent along a path by arc length.
 *
 * Art coordinates `(x, y)` map to the path point at arc length `s(x)`, offset by `(y - centre) · cross` along the
 * path's left normal. Art outlines are flattened and subdivided first so long straight edges bend with the path
 * instead of cutting chords. An **art brush** stretches one copy of the art over the whole path; a **pattern
 * brush** tiles it along each straight run of the path (a corner starts a new run, so tiles never straddle one).
 *
 * This module is pure geometry (path data in, path data out); `art-brush-canvas.js` owns the elements.
 * Corner / start / end tiles of VectorCraft's pattern brush are not ported yet (see roadmap.md).
 *
 * Ported from VectorCraft (https://github.com/storytold/vectorcraft), `crates/brush/src/warp.rs` and `track.rs`
 * (`Track`, `art`, `pattern`), MIT OR Apache-2.0.
 *
 * @module art-brush
 * @license MIT
 */

import { parseAnchors, anchorBBox } from './anchor-path.ts'
import { flatten } from './width-outline.ts'
import type { Pt } from './anchor-path.ts'

interface Poly { pts: Pt[], closed: boolean }

/** Turn angle (degrees) above which a vertex of the path is a corner: tangents are blended across the rest. */
const CORNER_DEG = 30
/** Longest mapped segment (document units). */
const MAX_SEG = 1.5
/** Hard cap on subdivisions of one art segment. */
const MAX_SUB = 4000
/** Flatness of the path the art follows. */
const TRACK_TOL = 0.05
const EPS = 1e-9

const dist = (a: Pt, b: Pt): number => Math.hypot(a.x - b.x, a.y - b.y)
const unit = (v: Pt): Pt => {
  const l = Math.hypot(v.x, v.y)
  return l < 1e-12 ? { x: 1, y: 0 } : { x: v.x / l, y: v.y / l }
}
const normalOf = (t: Pt): Pt => ({ x: -t.y, y: t.x })

// ---------------------------------------------------------------------------
// Tracks: arc-length parameterised polylines
// ---------------------------------------------------------------------------

export interface Track {
  /** vertices; a closed track repeats its first vertex at the end */
  verts: Pt[]
  /** arc length at each vertex */
  cum: number[]
  closed: boolean
  /** unit direction of each segment */
  dirs: Pt[]
  /** smoothed unit tangent at each vertex */
  tangents: Pt[]
  /** whether each vertex is a corner (open ends never are) */
  corner: boolean[]
  length: number
}

export const makeTrack = (input: Pt[], closedIn: boolean): Track | null => {
  const verts: Pt[] = []
  for (const p of input) if (!verts.length || dist(verts[verts.length - 1], p) >= EPS) verts.push(p)
  if (closedIn && verts.length > 2 && dist(verts[0], verts[verts.length - 1]) < EPS) verts.pop()
  if (verts.length < 2) return null
  const closed = closedIn && verts.length > 2
  if (closed) verts.push(verts[0])
  const nseg = verts.length - 1
  const dirs: Pt[] = []
  const cum = [0]
  for (let i = 0; i < nseg; i++) {
    dirs.push(unit({ x: verts[i + 1].x - verts[i].x, y: verts[i + 1].y - verts[i].y }))
    cum.push(cum[i] + dist(verts[i], verts[i + 1]))
  }
  const tangents: Pt[] = []
  const corner: boolean[] = []
  const cosLimit = Math.cos((CORNER_DEG * Math.PI) / 180)
  for (let i = 0; i <= nseg; i++) {
    const a = i > 0 ? dirs[i - 1] : closed ? dirs[nseg - 1] : null
    const b = i < nseg ? dirs[i] : closed ? dirs[0] : null
    if (a && b) {
      corner.push(a.x * b.x + a.y * b.y < cosLimit)
      tangents.push(unit({ x: a.x + b.x, y: a.y + b.y }))
    } else {
      corner.push(false)
      tangents.push(a ?? b ?? { x: 1, y: 0 })
    }
  }
  return { verts, cum, closed, dirs, tangents, corner, length: cum[cum.length - 1] }
}

/** The tracks (one per subpath) of path data. */
export const tracksOf = (d: string, tol = TRACK_TOL): Track[] => {
  const out: Track[] = []
  for (const sp of parseAnchors(d || '', 0.1)) {
    if (sp.anchors.length < 2) continue
    const t = makeTrack(flatten(sp, tol).pts, sp.closed)
    if (t) out.push(t)
  }
  return out
}

/**
 * Point and unit tangent at arc length `s`. An open track continues past its ends along the end tangents; a closed
 * one wraps. Tangents blend across the gentle vertices of a flattened curve, and stay put at real corners.
 */
export const frameAt = (t: Track, s: number): { p: Pt, t: Pt } => {
  const l = t.length
  const n = t.dirs.length
  const at = t.closed && l > 0 ? ((s % l) + l) % l : s
  if (at <= 0 && !t.closed) {
    const d = t.dirs[0]
    return { p: { x: t.verts[0].x + d.x * at, y: t.verts[0].y + d.y * at }, t: d }
  }
  if (at >= l && !t.closed) {
    const d = t.dirs[n - 1]
    return { p: { x: t.verts[n].x + d.x * (at - l), y: t.verts[n].y + d.y * (at - l) }, t: d }
  }
  let lo = 0
  let hi = n - 1
  while (lo < hi) {
    const mid = (lo + hi + 1) >> 1
    if (t.cum[mid] <= at) lo = mid
    else hi = mid - 1
  }
  const i = lo
  const seg = t.cum[i + 1] - t.cum[i]
  const u = seg > 1e-12 ? Math.min(1, Math.max(0, (at - t.cum[i]) / seg)) : 0
  const a = t.verts[i]
  const b = t.verts[i + 1]
  const t0 = t.corner[i] ? t.dirs[i] : t.tangents[i]
  const t1 = t.corner[i + 1] ? t.dirs[i] : t.tangents[i + 1]
  return {
    p: { x: a.x + (b.x - a.x) * u, y: a.y + (b.y - a.y) * u },
    t: unit({ x: t0.x + (t1.x - t0.x) * u, y: t0.y + (t1.y - t0.y) * u })
  }
}

/** The point at arc length `s`, offset `off` along the left normal. */
export const mapOnTrack = (t: Track, s: number, off: number): Pt => {
  const { p, t: tg } = frameAt(t, s)
  const n = normalOf(tg)
  return { x: p.x + n.x * off, y: p.y + n.y * off }
}

/** Arc-length positions of the corner vertices (a closed track lists vertex 0 once). */
const cornerPositions = (t: Track): number[] => {
  const last = t.closed ? t.dirs.length : t.dirs.length + 1
  const out: number[] = []
  for (let i = 0; i < last; i++) if (t.corner[i]) out.push(t.cum[i])
  return out
}

// ---------------------------------------------------------------------------
// Art
// ---------------------------------------------------------------------------

/** One piece of art, as the paths it is made of: absolute path data plus the presentation attributes to paint it. */
export interface ArtPath {
  d: string
  attrs?: Record<string, string>
}

interface FlatArt { poly: Poly[], attrs: Record<string, string> }

/** @param dir 'ltr' | 'rtl' | 'ttb' | 'btt': the direction the art runs in as drawn */
const orientation = (dir: string, flipAlong: boolean, flipAcross: boolean): ((p: Pt) => Pt) => {
  const turns: Record<string, (p: Pt) => Pt> = {
    rtl: (p) => ({ x: -p.x, y: p.y }),
    ttb: (p) => ({ x: p.y, y: -p.x }),
    btt: (p) => ({ x: -p.y, y: p.x })
  }
  const rot: (p: Pt) => Pt = turns[dir] ?? ((p) => p)
  const fx = flipAlong ? -1 : 1
  const fy = flipAcross ? -1 : 1
  return (p) => {
    const q = rot(p)
    return { x: q.x * fx, y: q.y * fy }
  }
}

/**
/** The art flattened and turned to run left → right (flipped as asked), with its bounds. */
export interface OrientedArt {
  flat: FlatArt[]
  x0: number
  x1: number
  cy: number
  width: number
}

/** The art flattened and turned to run left → right (flipped as asked), with its bounds. Null when it has no width. */
export const orientArt = (art: ArtPath[], dir: string, flipAlong: boolean, flipAcross: boolean): OrientedArt | null => {
  const turn = orientation(dir, flipAlong, flipAcross)
  const flat: FlatArt[] = []
  let minX = Infinity
  let maxX = -Infinity
  let minY = Infinity
  let maxY = -Infinity
  for (const piece of art) {
    const subs = parseAnchors(piece.d || '', 0.1)
    if (!subs.length) continue
    const box = anchorBBox(subs)
    const tol = Math.min(0.25, Math.max(0.01, 0.02 * Math.max(box.width, box.height)))
    const poly: Poly[] = []
    for (const sp of subs) {
      if (!sp.anchors.length) continue
      const pts = flatten(sp, tol).pts.map(turn)
      if (pts.length < 2) continue
      for (const p of pts) {
        minX = Math.min(minX, p.x)
        maxX = Math.max(maxX, p.x)
        minY = Math.min(minY, p.y)
        maxY = Math.max(maxY, p.y)
      }
      poly.push({ pts, closed: sp.closed })
    }
    if (poly.length) flat.push({ poly, attrs: piece.attrs ?? {} })
  }
  if (!flat.length || !(maxX - minX > EPS)) return null
  return { flat, x0: minX, x1: maxX, cy: (minY + maxY) / 2, width: maxX - minX }
}

/** Piecewise-linear map from art x (offset from the art's left edge) to arc length: four breakpoints. */
interface AlongMap { xs: number[], ss: number[] }

const linearAlong = (width: number, s0: number, s1: number): AlongMap => ({ xs: [0, 0, width, width], ss: [s0, s0, s1, s1] })

const slopeOf = (m: AlongMap, i: number): number => {
  const w = m.xs[i + 1] - m.xs[i]
  return w <= 1e-12 ? 1 : (m.ss[i + 1] - m.ss[i]) / w
}

const alongAt = (m: AlongMap, x: number): number => {
  if (x <= m.xs[0]) return m.ss[0] + (x - m.xs[0]) * slopeOf(m, 0)
  for (let i = 0; i < 3; i++) {
    if (x <= m.xs[i + 1]) {
      const w = m.xs[i + 1] - m.xs[i]
      return w <= 1e-12 ? m.ss[i + 1] : m.ss[i] + ((x - m.xs[i]) / w) * (m.ss[i + 1] - m.ss[i])
    }
  }
  return m.ss[3] + (x - m.xs[3]) * slopeOf(m, 2)
}

/** Largest arc length per art unit of the map's pieces. */
const maxAlongScale = (m: AlongMap): number => Math.max(1e-6, ...[0, 1, 2].map((i) => Math.abs(slopeOf(m, i))))

const num = (n: number): string => String(Math.round(n * 100) / 100)

/**
 * Bend the flattened art along a track: every polyline is densified so no mapped segment is longer than
 * `MAX_SEG`, then each point goes through the arc-length map and the cross offset.
 */
const bend = (t: Track, art: OrientedArt, along: AlongMap, cross: number): ArtPath[] => {
  const maxDu = MAX_SEG / maxAlongScale(along)
  const f = (p: Pt): Pt => mapOnTrack(t, alongAt(along, p.x - art.x0), (p.y - art.cy) * cross)
  const out: ArtPath[] = []
  for (const piece of art.flat) {
    const parts: string[] = []
    for (const { pts, closed } of piece.poly) {
      const n = pts.length
      const dense = [pts[0]]
      const segs = closed ? n : n - 1
      for (let i = 0; i < segs; i++) {
        const a = pts[i]
        const b = pts[(i + 1) % n]
        const k = Math.min(MAX_SUB, Math.max(1, Math.ceil(Math.abs(b.x - a.x) / maxDu)))
        for (let j = 1; j <= k; j++) {
          if (closed && i === segs - 1 && j === k) break
          dense.push({ x: a.x + (b.x - a.x) * (j / k), y: a.y + (b.y - a.y) * (j / k) })
        }
      }
      const mapped = thin(dense.map(f), closed)
      parts.push(mapped.map((p, i) => `${i === 0 ? 'M' : 'L'}${num(p.x)},${num(p.y)}`).join(' ') + (closed ? ' Z' : ''))
    }
    if (parts.length) out.push({ d: parts.join(' '), attrs: scaleStroke(piece.attrs, Math.abs(cross)) })
  }
  return out
}

/** How far a point may sit off the line through its neighbours and still be dropped (document units). */
const THIN_TOL = 0.01

/**
 * Drop the points of a mapped polyline that sit on the line between the points kept around them (Douglas-Peucker):
 * a straight spine bends nothing, so its densified art collapses back to its corners. A ring is cut at its start.
 */
const thin = (pts: Pt[], closed: boolean): Pt[] => {
  const line = closed ? [...pts, pts[0]] : pts
  const n = line.length
  if (n < 3) return pts
  const keep: boolean[] = new Array(n).fill(false)
  keep[0] = true
  keep[n - 1] = true
  const stack: Array<[number, number]> = [[0, n - 1]]
  while (stack.length) {
    const [a, b] = stack.pop() as [number, number]
    const pa = line[a]
    const pb = line[b]
    const len = dist(pa, pb)
    let worst = -1
    let at = -1
    for (let i = a + 1; i < b; i++) {
      const p = line[i]
      const d = len < EPS ? dist(p, pa) : Math.abs((pb.x - pa.x) * (pa.y - p.y) - (pa.x - p.x) * (pb.y - pa.y)) / len
      if (d > worst) {
        worst = d
        at = i
      }
    }
    if (worst > THIN_TOL) {
      keep[at] = true
      stack.push([a, at], [at, b])
    }
  }
  const out = line.filter((_, i) => keep[i])
  return closed ? out.slice(0, -1) : out
}

/** Presentation attributes with the stroke width scaled by the cross factor. */
const scaleStroke = (attrs: Record<string, string> | undefined, k: number): Record<string, string> => {
  const out = { ...attrs }
  const w = parseFloat(out['stroke-width'])
  if (Number.isFinite(w)) out['stroke-width'] = num(w * k)
  return out
}

// ---------------------------------------------------------------------------
// Art brush
// ---------------------------------------------------------------------------

export interface ArtOptions {
  /** stretch: the art spans the path; proportional: it keeps its proportions */
  scale: 'stretch' | 'proportional'
  /** percent of the art's own height across the path */
  width: number
  flipAlong: boolean
  flipAcross: boolean
  /** the direction the art runs in as drawn */
  dir: 'ltr' | 'rtl' | 'ttb' | 'btt'
}

export const ART_DEFAULTS: ArtOptions = { scale: 'stretch', width: 100, flipAlong: false, flipAcross: false, dir: 'ltr' }

/**
 * One copy of the art stretched along each subpath of `d`.
 * @param d the path the art follows
 */
export const artAlongPath = (d: string, art: ArtPath[], options: Partial<ArtOptions> = {}): ArtPath[] => {
  const o = { ...ART_DEFAULTS, ...options }
  const oriented = orientArt(art, o.dir, o.flipAlong, o.flipAcross)
  if (!oriented) return []
  const out: ArtPath[] = []
  for (const t of tracksOf(d)) {
    if (t.length <= EPS) continue
    const cross = Math.max(0.01, o.width) / 100
    const along = linearAlong(oriented.width, 0, t.length)
    const k = o.scale === 'proportional' ? (t.length / oriented.width) * cross : cross
    out.push(...bend(t, oriented, along, k))
  }
  return out
}

// ---------------------------------------------------------------------------
// Pattern brush
// ---------------------------------------------------------------------------

export interface PatternOptions {
  /** percent of the tile's own size */
  scale: number
  /** space between tiles, percent of the tile width */
  spacing: number
  /** stretch: tiles stretch so a whole number fits; addSpace: tiles keep their size and the space grows;
   *  approximate: tiles keep their size and the run is centred */
  fit: 'stretch' | 'addSpace' | 'approximate'
  flipAlong: boolean
  flipAcross: boolean
}

export const PATTERN_DEFAULTS: PatternOptions = { scale: 100, spacing: 0, fit: 'stretch', flipAlong: false, flipAcross: false }

/** Hard cap on tiles per run. */
const MAX_TILES = 20000

/**
 * The art repeated along each straight run of `d`.
 * @param d the path the tiles follow
 */
export const patternAlongPath = (d: string, tile: ArtPath[], options: Partial<PatternOptions> = {}): ArtPath[] => {
  const o = { ...PATTERN_DEFAULTS, ...options }
  const side = orientArt(tile, 'ltr', o.flipAlong, o.flipAcross)
  if (!side) return []
  const k = Math.max(1, o.scale) / 100
  const tw = side.width * k
  const gap = (tw * Math.max(0, o.spacing)) / 100
  const unitLen = tw + gap
  const out: ArtPath[] = []
  const place = (t: Track, s0: number, s1: number): void => { out.push(...bend(t, side, linearAlong(side.width, s0, s1), k)) }
  for (const t of tracksOf(d)) {
    const l = t.length
    if (l <= EPS) continue
    // Runs between corners; a closed track wraps past its end.
    const corners = cornerPositions(t)
    let runs: Array<[number, number]>
    if (!corners.length) {
      runs = [[0, l]]
    } else if (t.closed) {
      const b = [...corners, corners[0] + l]
      runs = b.slice(0, -1).map((c, i) => [c, b[i + 1]])
    } else {
      const b = [0, ...corners, l]
      runs = b.slice(0, -1).map((c, i) => [c, b[i + 1]])
    }
    for (const [a, b] of runs) {
      const avail = b - a
      if (avail <= 1e-6) continue
      if (o.fit === 'stretch') {
        const n = Math.max(1, Math.round((avail + gap) / unitLen))
        const f = avail / (n * tw + Math.max(0, n - 1) * gap)
        const w = tw * f
        const g = gap * f
        for (let i = 0; i < Math.min(n, MAX_TILES); i++) place(t, a + i * (w + g), a + i * (w + g) + w)
      } else if (o.fit === 'addSpace') {
        const n = Math.max(1, Math.floor((avail + gap) / unitLen))
        const g = n > 1 ? Math.max(0, (avail - n * tw) / (n - 1)) : 0
        const lead = n === 1 ? (avail - tw) / 2 : 0
        for (let i = 0; i < Math.min(n, MAX_TILES); i++) {
          const s0 = a + lead + i * (tw + g)
          place(t, s0, s0 + tw)
        }
      } else {
        const n = Math.max(1, Math.round((avail + gap) / unitLen))
        const lead = (avail - (n * tw + (n - 1) * gap)) / 2
        for (let i = 0; i < Math.min(n, MAX_TILES); i++) {
          const s0 = a + lead + i * unitLen
          place(t, s0, s0 + tw)
        }
      }
    }
  }
  return out
}
