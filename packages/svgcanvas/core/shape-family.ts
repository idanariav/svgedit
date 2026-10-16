/**
 * Generators for the "Line Segment family" shape tools: Spiral, Arc,
 * Rectangular Grid and Polar Grid, plus the drag geometry (Shift = equal axes,
 * Alt = from the centre) the tools share. DOM-free: everything returns path
 * data strings or `{ element, attr }` descriptions that
 * `svgCanvas.addSVGElementsFromJson` accepts as children.
 *
 * Ported from VectorCraft (https://github.com/storytold/vectorcraft),
 * `crates/geom/src/shapes.rs` (`spiral`, `arc`, `rectangular_grid`,
 * `polar_grid`) and `crates/tools/src/draw2/family.rs`, MIT OR Apache-2.0.
 *
 * Deliberate differences from the original:
 * - `arc` ignores its `slope` upstream (`k = KAPPA * (1 + slope * 0.0)`); here
 *   `slope` in [-1, 1] works: 0 is the quarter ellipse, -1 a straight chord,
 *   +1 pulls the handles all the way to the box corner (a square corner).
 * - A polar grid with 0 radial dividers has none; upstream clamps it to one.
 * - Divider counts are capped at {@link MAX_DIVIDERS} (upstream 999) so a held
 *   arrow key cannot stall the live preview.
 *
 * @module shape-family
 * @license MIT
 */

import { anchorsToD } from './anchor-path.ts'
import type { Anchor } from './anchor-path.ts'

/** Handle length that makes a cubic follow a quarter circle. */
export const KAPPA = 0.5522847498307936

export const MIN_SEGMENTS = 2
export const MAX_SEGMENTS = 1000
export const MAX_DIVIDERS = 200

/** One element of a grid, as `svgCanvas.addSVGElementsFromJson` takes it as a child. */
export interface GridPart {
  element: string
  attr: Record<string, number | string>
}

interface Pt { x: number, y: number }

const clamp = (n: number, lo: number, hi: number): number => Math.min(hi, Math.max(lo, n))
const round3 = (n: number): number => Math.round(n * 1000) / 1000
const pt = (x: number, y: number): Pt => ({ x, y })

/** Whole divider count in [0, MAX_DIVIDERS]. */
export const clampDividers = (n: unknown, fallback = 5): number => {
  const v = Math.floor(Number(n))
  return Number.isFinite(v) ? clamp(v, 0, MAX_DIVIDERS) : fallback
}

/** Whole spiral segment count in [MIN_SEGMENTS, MAX_SEGMENTS]. */
export const clampSegments = (n: unknown, fallback = 10): number => {
  const v = Math.floor(Number(n))
  return Number.isFinite(v) ? clamp(v, MIN_SEGMENTS, MAX_SEGMENTS) : fallback
}

/**
 * Archimedean-style spiral (Illustrator's Spiral tool): `segments` quarter
 * turns, each `decay` percent of the radius of the one before. Built from the
 * outside in, then reversed so the path starts at the centre end — node edits
 * and taper then run centre → outside.
 * @param o.radius - Outer radius.
 * @param o.decay - Percent, 5 to 99.99.
 * @param o.clockwise - On screen (y down).
 * @returns Path data.
 */
export const spiralD = (
  { cx, cy, radius, decay = 80, segments = 10, clockwise = true }:
  { cx: number, cy: number, radius: number, decay?: number, segments?: number, clockwise?: boolean }
): string => {
  const k = clamp(decay / 100, 0.05, 0.9999)
  const dir = clockwise ? 1 : -1
  const n = clampSegments(segments)
  const anchors: Anchor[] = []
  let r = Math.max(radius, 0.01)
  for (let i = 0; i <= n; i++) {
    const a = dir * i * Math.PI / 2
    const p = pt(cx + r * Math.cos(a), cy + r * Math.sin(a))
    // Unit tangent of a quarter arc of radius r, in the travel direction.
    const t = pt(-Math.sin(a) * dir, Math.cos(a) * dir)
    const hIn = (r / k + r) / 2 * KAPPA
    const hOut = (r * k + r) / 2 * KAPPA
    anchors.push({
      p,
      hIn: i === 0 ? { ...p } : pt(p.x - t.x * hIn, p.y - t.y * hIn),
      hOut: i === n ? { ...p } : pt(p.x + t.x * hOut, p.y + t.y * hOut)
    })
    r *= k
  }
  // Reverse: swap each anchor's handles and flip the order.
  anchors.reverse()
  for (const a of anchors) [a.hIn, a.hOut] = [a.hOut, a.hIn]
  return anchorsToD([{ closed: false, anchors }])
}

/**
 * Quarter-ellipse arc from `(x1, y1)` to `(x2, y2)`. The bounding box corner it
 * bows toward is `(x2, y1)`, so it leaves the first point along x and reaches
 * the second along y; closed, it becomes the pie slice through `(x1, y2)`.
 * @param o.slope - -1 (straight) … 0 (quarter ellipse) … 1 (square corner).
 * @returns Path data.
 */
export const arcD = (
  { x1, y1, x2, y2, slope = 0, closed = false }:
  { x1: number, y1: number, x2: number, y2: number, slope?: number, closed?: boolean }
): string => {
  const s = clamp(Number(slope) || 0, -1, 1)
  const k = s >= 0 ? KAPPA + s * (1 - KAPPA) : KAPPA * (1 + s)
  const a = pt(x1, y1)
  const b = pt(x2, y2)
  const corner = pt(x2, y1)
  const toward = (from: Pt): Pt => pt(from.x + (corner.x - from.x) * k, from.y + (corner.y - from.y) * k)
  const anchors: Anchor[] = [
    { p: a, hIn: { ...a }, hOut: toward(a) },
    { p: b, hIn: toward(b), hOut: { ...b } }
  ]
  if (closed) {
    const o = pt(x1, y2)
    anchors.push({ p: o, hIn: { ...o }, hOut: { ...o } })
  }
  return anchorsToD([{ closed, anchors }])
}

/** The corner the pointer has dragged to, constrained for Shift (equal axes): its offset from `start`. */
const dragOffset = (start: Pt, p: Pt, shift: boolean): Pt => {
  const dx = p.x - start.x
  const dy = p.y - start.y
  if (!shift) return { x: dx, y: dy }
  const m = Math.max(Math.abs(dx), Math.abs(dy))
  return { x: dx < 0 ? -m : m, y: dy < 0 ? -m : m }
}

/**
 * Box a drag defines: corner to corner, or centre to corner with Alt; Shift
 * makes it square.
 * @returns Normalised (non-negative size).
 */
export const dragRect = (
  start: Pt, p: Pt, { shift = false, alt = false }: { shift?: boolean, alt?: boolean } = {}
): { x: number, y: number, width: number, height: number } => {
  const d = dragOffset(start, p, shift)
  const a = alt ? pt(start.x - d.x, start.y - d.y) : start
  const b = pt(start.x + d.x, start.y + d.y)
  return {
    x: Math.min(a.x, b.x),
    y: Math.min(a.y, b.y),
    width: Math.abs(b.x - a.x),
    height: Math.abs(b.y - a.y)
  }
}

/**
 * End points an arc drag defines (Shift = square, Alt = `start` is the centre,
 * so the arc runs from `start - d` to `start + d`).
 */
export const arcDragEnds = (
  start: Pt, p: Pt, { shift = false, alt = false }: { shift?: boolean, alt?: boolean } = {}
): { x1: number, y1: number, x2: number, y2: number } => {
  const d = dragOffset(start, p, shift)
  return alt
    ? { x1: start.x - d.x, y1: start.y - d.y, x2: start.x + d.x, y2: start.y + d.y }
    : { x1: start.x, y1: start.y, x2: start.x + d.x, y2: start.y + d.y }
}

const lineD = (x1: number, y1: number, x2: number, y2: number): string => `M${round3(x1)},${round3(y1)} L${round3(x2)},${round3(y2)}`

/**
 * Rectangular grid: `rows` horizontal and `columns` vertical dividers (evenly
 * spaced inside the box, so there are rows + 1 by columns + 1 cells), as
 * separate open lines, plus the frame rectangle.
 */
export const rectangularGridParts = (
  { x, y, width, height, rows = 5, columns = 5, frame = true }:
  { x: number, y: number, width: number, height: number, rows?: number, columns?: number, frame?: boolean }
): GridPart[] => {
  const out: GridPart[] = []
  const r = clampDividers(rows, 0)
  const c = clampDividers(columns, 0)
  for (let i = 1; i <= r; i++) {
    const yy = y + height * i / (r + 1)
    out.push({ element: 'path', attr: { d: lineD(x, yy, x + width, yy) } })
  }
  for (let i = 1; i <= c; i++) {
    const xx = x + width * i / (c + 1)
    out.push({ element: 'path', attr: { d: lineD(xx, y, xx, y + height) } })
  }
  if (frame) {
    out.push({
      element: 'rect',
      attr: { x: round3(x), y: round3(y), width: round3(width), height: round3(height) }
    })
  }
  return out
}

/**
 * Polar grid: `concentric` dividers give `concentric + 1` ellipses (the last
 * is the outline of the box), `radial` dividers spokes from the centre starting
 * at 12 o'clock.
 */
export const polarGridParts = (
  { x, y, width, height, concentric = 5, radial = 5 }:
  { x: number, y: number, width: number, height: number, concentric?: number, radial?: number }
): GridPart[] => {
  const out: GridPart[] = []
  const ring = clampDividers(concentric, 0)
  const spokes = clampDividers(radial, 0)
  const cx = x + width / 2
  const cy = y + height / 2
  for (let i = 1; i <= ring + 1; i++) {
    const f = i / (ring + 1)
    out.push({
      element: 'ellipse',
      attr: { cx: round3(cx), cy: round3(cy), rx: round3(width * f / 2), ry: round3(height * f / 2) }
    })
  }
  for (let i = 0; i < spokes; i++) {
    const a = -Math.PI / 2 + 2 * Math.PI * i / spokes
    out.push({
      element: 'path',
      attr: { d: lineD(cx, cy, cx + width / 2 * Math.cos(a), cy + height / 2 * Math.sin(a)) }
    })
  }
  return out
}
