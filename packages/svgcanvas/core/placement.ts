/**
 * The placement policy (roadmap R12): where an element's position, size and turn are written, and what a move writes. An
 * axis-aligned map is baked into a shape's own coordinates (a group keeps it as its transform: its children are not
 * rewritten); a rotation stays a term, `rotate(angle cx cy)`, turned about the moved centre; anything else (a skew, a
 * rotation among other terms, a clipped or masked element, whose silhouette in `<defs>` is static) keeps one matrix in front
 * of its geometry. The drag, its preview and nudge all ask here, so they cannot disagree.
 *
 * Pure numbers on the model's attributes (a DOM element or a model element alike): no browser matrix, no DOM writes.
 * @module placement
 * @license MIT
 */
import SvgPath from 'svgpath'
import { parseMatrix, multiply } from './model/matrix.ts'
import type { Matrix6 } from './model/matrix.ts'
import type { ModelElement } from './model/node.ts'

/**
 * An affine map without rotation or skew: x' = a x + e, y' = d y + f (what a move, a resize and a flip are, composed). Pure
 * numbers: no browser matrix, so it runs the same in Node.
 */
export interface Affine { a: number, d: number, e: number, f: number }
/**
 * What a drag knows of an element: its transform as an `Affine`, or, for one turned by `rotate(angle cx cy)`, the identity and
 * that rotation (for a group, `rotate(angle cx cy)` followed by the translation or scale it keeps for its position, which is the `Affine`).
 */
export type DragEntry = Affine & { rot?: { angle: number, cx: number, cy: number }, matrix?: Matrix6, scratch?: boolean, stroke?: Record<string, string> }

export const IDENTITY_AFFINE: Affine = { a: 1, d: 1, e: 0, f: 0 }
const IDENTITY = IDENTITY_AFFINE
/** `outer` applied after `inner`. */
export const composeAffine = (outer: Affine, inner: Affine): Affine => ({
  a: outer.a * inner.a, d: outer.d * inner.d, e: outer.a * inner.e + outer.e, f: outer.d * inner.f + outer.f
})
const compose = composeAffine

/**
 * The map a transform attribute makes when it is only translations, scalings and rotation-free matrices (`translate`,
 * `scale`, `matrix`), in the order SVG applies them (the last term first); null for anything else (a rotation, a skew).
 */
export const parseAffine = (transform: string | null): Affine | null => {
  let rest = (transform ?? '').trim()
  let out = IDENTITY
  while (rest) {
    const term = /^(translate|scale|matrix)\(([^)]*)\)\s*/.exec(rest)
    if (!term) return null
    const v = term[2].split(/[\s,]+/).filter(Boolean).map(Number)
    if (!v.length || !v.every(Number.isFinite)) return null
    let next: Affine
    if (term[1] === 'translate') next = { a: 1, d: 1, e: v[0], f: v[1] ?? 0 }
    else if (term[1] === 'scale') next = { a: v[0], d: v[1] ?? v[0], e: 0, f: 0 }
    else if (v.length === 6 && v[1] === 0 && v[2] === 0) next = { a: v[0], d: v[3], e: v[4], f: v[5] }
    else return null
    out = compose(out, next)
    rest = rest.slice(term[0].length)
  }
  return out
}

/** An inherited presentation value of a DOM element: its own attribute, else the nearest ancestor's. */
const inherited = (el: Element, name: string): string | null => {
  for (let at: Element | null = el; at && at.tagName !== 'svg'; at = at.parentElement) {
    const value = at.getAttribute(name)
    if (value !== null && value !== 'inherit') return value
  }
  return null
}

/**
 * The `stroke-width` that keeps an element's stroke looking the same when a bake folds the scale of `own` (the transform
 * the element had before the gesture) into its geometry: the transform scaled the stroke, the rewritten coordinates do
 * not. An empty record when there is nothing to keep (no scale, no stroke, a group, whose transform stays).
 */
export const strokeForBake = (el: Element, own: Affine): Record<string, string> => {
  const scale = Math.sqrt(Math.abs(own.a * own.d))
  if (!(scale > 0) || Math.abs(scale - 1) < 1e-9 || el.tagName === 'g' || el.tagName === 'a') return {}
  const computed = el.isConnected && typeof getComputedStyle === 'function' ? getComputedStyle(el) : null
  const stroke = computed?.stroke || inherited(el, 'stroke')
  if (!stroke || stroke === 'none') return {}
  const width = parseFloat(computed?.strokeWidth || inherited(el, 'stroke-width') || '1')
  if (!Number.isFinite(width)) return {}
  return { 'stroke-width': String(Number((width * scale).toFixed(6))) }
}

/** The few things `affineEdit` reads of an element, from a DOM element or from a model element alike. */
const attrHost = (el: Element | ModelElement): { tagName: string, get: (name: string) => string | null, has: (name: string) => boolean, names: string[] } => {
  if ('kind' in el) {
    const get = (name: string): string | null => el.attrs.find((a) => a.name === name)?.value ?? null
    return { tagName: el.name, get, has: (name) => get(name) !== null, names: el.attrs.map((a) => a.name) }
  }
  return { tagName: el.tagName, get: (name) => el.getAttribute(name), has: (name) => el.hasAttribute(name), names: Array.from(el.attributes, (a) => a.name) }
}

/** The coordinates a plain shape is positioned by, and the axis each one moves along. */
const POINT_ATTRS: Record<string, Array<[string, 'x' | 'y']>> = {
  rect: [['x', 'x'], ['y', 'y']],
  image: [['x', 'x'], ['y', 'y']],
  foreignObject: [['x', 'x'], ['y', 'y']],
  circle: [['cx', 'x'], ['cy', 'y']],
  ellipse: [['cx', 'x'], ['cy', 'y']],
  line: [['x1', 'x'], ['x2', 'x'], ['y1', 'y'], ['y2', 'y']],
  polyline: [],
  polygon: [],
  path: [],
  g: [],
  a: []
}
const NUMBER = /^\s*[-+]?(\d+\.?\d*|\.\d+)(e[-+]?\d+)?\s*$/i

/**
 * The attributes that take this element through `map` (its own coordinates and sizes changed, the `transform` dropped), or
 * null when that is not all it takes: a clip, mask or feature data (arrow trim, effects…) that reacts through the DOM path,
 * a value with units, a flip of something that needs a matrix or a gradient flip, a circle scaled unevenly.
 */
export const affineEdit = (target: Element | ModelElement, map: Affine): Record<string, string | null> | null => {
  const el = attrHost(target)
  if (el.has('clip-path') || el.has('mask')) return null
  if (el.names.some((n) => n.startsWith('se:') || n.startsWith('data-se'))) return null
  const points = POINT_ATTRS[el.tagName]
  if (!points) return null
  const flips = map.a < 0 || map.d < 0
  if (flips && (el.tagName === 'image' || /url\(/.test(`${el.get('fill')}${el.get('stroke')}`))) return null
  const get = (name: string): number | null => {
    const raw = el.get(name)
    if (raw === null) return 0
    return NUMBER.test(raw) ? parseFloat(raw) : null
  }
  const set: Record<string, string | null> = {}
  const point = (xn: string, yn: string): [number, number] | null => {
    const x = get(xn)
    const y = get(yn)
    return x === null || y === null ? null : [map.a * x + map.e, map.d * y + map.f]
  }
  switch (el.tagName) {
    case 'rect': case 'image': case 'foreignObject': {
      const w = get('width')
      const h = get('height')
      const p = point('x', 'y')
      if (w === null || h === null || !p) return null
      const sw = map.a * w
      const sh = map.d * h
      set.x = String(p[0] + Math.min(0, sw))
      set.y = String(p[1] + Math.min(0, sh))
      if (el.has('width') || map.a !== 1) set.width = String(Math.abs(sw))
      if (el.has('height') || map.d !== 1) set.height = String(Math.abs(sh))
      break
    }
    case 'ellipse': {
      const rx = get('rx')
      const ry = get('ry')
      const c = point('cx', 'cy')
      if (rx === null || ry === null || !c) return null
      set.cx = String(c[0])
      set.cy = String(c[1])
      set.rx = String(Math.abs(map.a * rx))
      set.ry = String(Math.abs(map.d * ry))
      break
    }
    case 'circle': {
      const r = get('r')
      const c = point('cx', 'cy')
      if (r === null || !c || Math.abs(map.a) !== Math.abs(map.d)) return null
      set.cx = String(c[0])
      set.cy = String(c[1])
      set.r = String(Math.abs(map.a * r))
      break
    }
    case 'line': {
      const p1 = point('x1', 'y1')
      const p2 = point('x2', 'y2')
      if (!p1 || !p2) return null
      set.x1 = String(p1[0])
      set.y1 = String(p1[1])
      set.x2 = String(p2[0])
      set.y2 = String(p2[1])
      break
    }
    case 'polyline': case 'polygon': {
      const nums = (el.get('points') ?? '').trim().split(/[\s,]+/).filter(Boolean).map(Number)
      if (nums.length < 2 || nums.length % 2 || !nums.every(Number.isFinite)) return null
      const out: string[] = []
      for (let i = 0; i < nums.length; i += 2) out.push(`${map.a * nums[i] + map.e},${map.d * nums[i + 1] + map.f}`)
      set.points = out.join(' ')
      break
    }
    case 'path': {
      // a path that keeps parameters of its own beside `d` (an arc's centre and radii…) is edited where it owns them
      if (el.names.some((n) => n.startsWith('data-') && n !== 'data-freehand')) return null
      const d = el.get('d')
      if (!d) return null
      try {
        set.d = new SvgPath(d).scale(map.a, map.d).translate(map.e, map.f).round(6).toString()
      } catch {
        return null
      }
      break
    }
    case 'g': case 'a': {
      // a group keeps the map as its own transform (what is inside it is not rewritten)
      const identity = map.a === 1 && map.d === 1 && map.e === 0 && map.f === 0
      set.transform = identity ? null : `matrix(${map.a} 0 0 ${map.d} ${map.e} ${map.f})`
      return set
    }
    default: return null
  }
  if (el.has('transform')) set.transform = null
  return set
}

/** `affineEdit` for a move by (mx, my) on top of the translation or scale the element's transform already is. */
export const translationEdit = (el: Element, mx: number, my: number): Record<string, string | null> | null => {
  const own = parseAffine(el.getAttribute('transform'))
  const set = own ? affineEdit(el, compose({ a: 1, d: 1, e: mx, f: my }, own)) : null
  return set && own ? { ...set, ...strokeForBake(el, own) } : set
}

const ROTATE = /^rotate\(\s*(-?[\d.eE+-]+)[\s,]+(-?[\d.eE+-]+)[\s,]+(-?[\d.eE+-]+)\s*\)\s*(.*)$/
const isGroupTag = (tag: string): boolean => tag === 'g' || tag === 'a'
/** It keeps data of a feature (arrow trim, effects, …) that a rewrite of its geometry would have to follow. */
const hasFeatureData = (el: Element): boolean => Array.from(el.attributes).some((a) => a.name.startsWith('se:') || a.name.startsWith('data-se'))

/**
 * A drag entry for an element turned by `rotate(angle cx cy)` first, or null. A shape has nothing after the rotation (its
 * position is its geometry); a group may keep its position as a translation or scale after it (its children are not rewritten).
 */
export const turnedEntry = (el: Element): DragEntry | null => {
  const turned = ROTATE.exec((el.getAttribute('transform') ?? '').trim())
  if (!turned) return null
  const rest = turned[4] ? (isGroupTag(el.localName) ? parseAffine(turned[4]) : null) : IDENTITY
  return rest && { ...rest, rot: { angle: Number(turned[1]), cx: Number(turned[2]), cy: Number(turned[3]) } }
}

/**
 * How `el`'s placement is written when it moves or scales (read before a preview rewrites it):
 *  - an `Affine` alone: its transform is axis-aligned, and a move bakes it, with the move, into its own coordinates;
 *  - with `rot`: it is turned by `rotate(angle cx cy)` first, which stays a term and turns about the moved centre;
 *  - with `matrix`: any other transform (a skew, a rotation among other terms) or a clipped or masked element: the move goes
 *    in front of that matrix, the geometry untouched (`scratch`: a shape with feature data, baked on a copy at the end).
 * Null when none applies (no id, a value with units, a transform that does not parse). `allowRotated` false keeps to the
 * first kind (a resize of a turned shape is the rotate-aware path's).
 */
export const planPlacement = (el: Element, allowRotated = true): DragEntry | null => {
  if (!el.id) return null
  // A clipped or masked element is never baked (its silhouette is static in <defs>): the move stays a matrix transform
  if (allowRotated && (el.hasAttribute('clip-path') || el.hasAttribute('mask')) && !hasFeatureData(el)) {
    const own6 = parseMatrix(el.getAttribute('transform'))
    return own6 ? { ...IDENTITY, matrix: own6 } : null
  }
  const turned = allowRotated ? turnedEntry(el) : null
  const entry: DragEntry | null = turned ?? parseAffine(el.getAttribute('transform'))
  // a turned element is judged by its geometry alone (the rotation travels with the move)
  if (!entry || !affineEdit(el, turned ? { ...IDENTITY, e: 0, f: 0 } : entry)) {
    // another transform (a skew, a rotation among other terms): the move is put in front of it as a matrix, geometry untouched
    const general = allowRotated && el.hasAttribute('transform') && affineEdit(el, IDENTITY) ? parseMatrix(el.getAttribute('transform')) : null
    const featureData = hasFeatureData(el)
    if (featureData && !el.children.length) {
      // A shape that keeps data of a feature (arrow trim, effects…) is baked on a copy when the drag ends; until then the move is a matrix
      const own6 = parseMatrix(el.getAttribute('transform'))
      return own6 ? { ...IDENTITY, matrix: own6, scratch: true } : null
    }
    if (!general || featureData) return null
    return { ...IDENTITY, matrix: general }
  }
  // Read now, before a preview rewrites the element: every preview bakes the element's own scale into its geometry
  const stroke = strokeForBake(el, entry)
  return Object.keys(stroke).length ? { ...entry, stroke } : entry
}

const round6 = (v: number): number => Number(v.toFixed(6))

/**
 * The attributes that put the element `node` (a DOM or a model element, as it stood when `entry` was planned) moved by
 * (dx, dy) in its parent's coordinates, or null when its kind cannot say (the caller leaves it as it is).
 */
export const moveEdit = (node: Element | ModelElement, entry: DragEntry, dx: number, dy: number): Record<string, string | null> | null => {
  if (entry.matrix) {
    const m = multiply([1, 0, 0, 1, dx, dy], entry.matrix).map(round6)
    return { transform: `matrix(${m.join(' ')})` }
  }
  const set = affineEdit(node, compose({ a: 1, d: 1, e: dx, f: dy }, entry))
  if (!set) return null
  // a turned element: the geometry moves by the drag and the rotation turns about the moved centre
  // (a group's move is its transform, not its geometry: it stays after the rotation)
  if (entry.rot) {
    const turn = `rotate(${entry.rot.angle} ${round6(entry.rot.cx + dx)} ${round6(entry.rot.cy + dy)})`
    set.transform = isGroupTag('kind' in node ? node.name : node.localName) && set.transform ? `${turn} ${set.transform}` : turn
  }
  return { ...set, ...entry.stroke }
}

export type { Matrix6 }
