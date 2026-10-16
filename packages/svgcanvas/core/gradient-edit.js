// @ts-check
/**
 * Gradient editing maths and DOM helpers for the on-canvas gradient tool (`ext-gradient-tool`).
 *
 * A gradient's geometry lives in *gradient space*: fractions of the element's bounding box
 * (`gradientUnits="objectBoundingBox"`, the default) or the element's own user space
 * (`userSpaceOnUse`), then `gradientTransform` on top. {@link gradientToLocal} is the matrix from
 * gradient space to the element's local coordinates; the tool puts the element's transform to the
 * document on top of it for the handles and takes it back off for a drag. The units and the
 * `gradientTransform` are never rewritten, only the geometry attributes and the stops.
 *
 * Gradients are shared (the colour dialog reuses an identical one, copy and paste keeps the
 * reference), so an edit goes through {@link ensureOwnGradient} first: if anything else uses the
 * gradient the element gets a copy with a new id.
 *
 * Attributes and stops are read through the `href` chain (a gradient may take its stops, units and
 * transform from another), but written on the gradient itself.
 *
 * Inspired by VectorCraft (https://github.com/storytold/vectorcraft), `crates/tools/src/xform/gradient.rs`
 * (the annotator's model and stop operations), MIT OR Apache-2.0.
 * @module gradient-edit
 * @license MIT
 */

import { NS } from './namespaces.ts'

/** @typedef {{a: number, b: number, c: number, d: number, e: number, f: number}} Matrix */
/** @typedef {{x: number, y: number}} Point */
/** @typedef {{x: number, y: number, width: number, height: number}} Box */
/**
 * @typedef {object} Stop
 * @property {Element} node
 * @property {number} offset 0..1
 * @property {string} color as written (`#rrggbb`, `red`, …)
 * @property {number} opacity 0..1
 */
/**
 * @typedef {object} GradientModel
 * @property {Element} grad
 * @property {'linear'|'radial'} kind
 * @property {Matrix} toLocal gradient space → the element's local space
 * @property {Point} p1 linear start, radial centre (gradient space)
 * @property {Point} p2 linear end; radial: the point `r` to the right of the centre
 * @property {number} r radial radius (0 for linear)
 * @property {Point} focal radial focal point (the centre for linear)
 * @property {Stop[]} stops
 */

export const IDENTITY = Object.freeze({ a: 1, b: 0, c: 0, d: 1, e: 0, f: 0 })

/** `m` after `n` (n is applied first). @param {Matrix} m @param {Matrix} n @returns {Matrix} */
export const multiply = (m, n) => ({
  a: m.a * n.a + m.c * n.b,
  b: m.b * n.a + m.d * n.b,
  c: m.a * n.c + m.c * n.d,
  d: m.b * n.c + m.d * n.d,
  e: m.a * n.e + m.c * n.f + m.e,
  f: m.b * n.e + m.d * n.f + m.f
})

/** @param {Matrix} m @returns {?Matrix} null when singular */
export const invert = (m) => {
  const det = m.a * m.d - m.b * m.c
  if (!Number.isFinite(det) || Math.abs(det) < 1e-12) return null
  return {
    a: m.d / det,
    b: -m.b / det,
    c: -m.c / det,
    d: m.a / det,
    e: (m.c * m.f - m.d * m.e) / det,
    f: (m.b * m.e - m.a * m.f) / det
  }
}

/** @param {Matrix} m @param {Point} p @returns {Point} */
export const applyMatrix = (m, p) => ({ x: m.a * p.x + m.c * p.y + m.e, y: m.b * p.x + m.d * p.y + m.f })

/**
 * Parse an SVG transform list (`matrix`, `translate`, `scale`, `rotate`, `skewX`, `skewY`).
 * @param {?string} str
 * @returns {Matrix}
 */
export const parseTransform = (str) => {
  let m = /** @type {Matrix} */ ({ ...IDENTITY })
  if (!str) return m
  const re = /(matrix|translate|scale|rotate|skewX|skewY)\s*\(([^)]*)\)/g
  let hit
  while ((hit = re.exec(str))) {
    const v = hit[2].split(/[\s,]+/).filter(Boolean).map(Number)
    /** @param {number} deg */
    const rad = (deg) => (deg * Math.PI) / 180
    /** @type {Matrix} */
    let t = { ...IDENTITY }
    switch (hit[1]) {
      case 'matrix': if (v.length === 6) t = { a: v[0], b: v[1], c: v[2], d: v[3], e: v[4], f: v[5] }; break
      case 'translate': t = { ...IDENTITY, e: v[0] || 0, f: v[1] || 0 }; break
      case 'scale': t = { ...IDENTITY, a: v[0], d: v.length > 1 ? v[1] : v[0] }; break
      case 'skewX': t = { ...IDENTITY, c: Math.tan(rad(v[0])) }; break
      case 'skewY': t = { ...IDENTITY, b: Math.tan(rad(v[0])) }; break
      case 'rotate': {
        const cos = Math.cos(rad(v[0]))
        const sin = Math.sin(rad(v[0]))
        t = { a: cos, b: sin, c: -sin, d: cos, e: 0, f: 0 }
        if (v.length === 3) t = multiply(multiply({ ...IDENTITY, e: v[1], f: v[2] }, t), { ...IDENTITY, e: -v[1], f: -v[2] })
        break
      }
    }
    if (![t.a, t.b, t.c, t.d, t.e, t.f].every(Number.isFinite)) continue
    m = multiply(m, t)
  }
  return m
}

/** Round to the precision the saver keeps. @param {number} n */
const fmt = (n) => String(Number(n.toFixed(5)))

// ---- reading ---------------------------------------------------------------------

const MAX_HOPS = 16

/** @param {Element} el @returns {?string} the id an `href` / `xlink:href` points at */
const hrefId = (el) => {
  const v = el.getAttribute('href') ?? el.getAttribute('xlink:href')
  return v && v.startsWith('#') ? v.slice(1) : null
}

/**
 * @param {ParentNode} scope the drawing
 * @param {string} id
 * @returns {?Element}
 */
export const findById = (scope, id) => scope.querySelector(`[id="${id.replace(/"/g, '\\"')}"]`)

/** The gradient plus the gradients it inherits from, nearest first. @param {ParentNode} scope @param {Element} grad */
const chain = (scope, grad) => {
  const out = [grad]
  let cur = grad
  for (let i = 0; i < MAX_HOPS; i++) {
    const id = hrefId(cur)
    const next = id ? findById(scope, id) : null
    if (!next || !/gradient$/i.test(next.tagName) || out.includes(next)) break
    out.push(next)
    cur = next
  }
  return out
}

/**
 * An attribute of a gradient, taken from the nearest one in its `href` chain that sets it. Geometry attributes
 * are only inherited from a gradient of the same kind (SVG 2, 13.2.2).
 * @param {ParentNode} scope @param {Element} grad @param {string} name
 * @param {boolean} [sameKind]
 * @returns {?string}
 */
export const inheritedAttr = (scope, grad, name, sameKind = false) => {
  for (const g of chain(scope, grad)) {
    if (sameKind && g.tagName !== grad.tagName) continue
    const v = g.getAttribute(name)
    if (v !== null) return v
  }
  return null
}

/** The gradient in the chain that supplies the stops. @param {ParentNode} scope @param {Element} grad */
const stopOwner = (scope, grad) => chain(scope, grad).find((g) => g.querySelector(':scope > stop')) ?? grad

/** @param {?string} v @returns {number} 0..1 */
const parseOffset = (v) => {
  if (v === null) return 0
  const n = parseFloat(v)
  if (!Number.isFinite(n)) return 0
  return Math.min(1, Math.max(0, v.trim().endsWith('%') ? n / 100 : n))
}

/** @param {Element} stop @param {string} prop @returns {?string} */
const stopProp = (stop, prop) => {
  const m = new RegExp(`(?:^|;)\\s*${prop}\\s*:\\s*([^;]+)`, 'i').exec(stop.getAttribute('style') || '')
  return (m ? m[1] : stop.getAttribute(prop))?.trim() ?? null
}

/** @param {Element} node @returns {Stop} */
const readStop = (node) => ({
  node,
  offset: parseOffset(node.getAttribute('offset')),
  color: stopProp(node, 'stop-color') ?? '#000000',
  opacity: Math.min(1, Math.max(0, Number(stopProp(node, 'stop-opacity') ?? 1)))
})

/** The gradient's effective stops, in document order. @param {ParentNode} scope @param {Element} grad @returns {Stop[]} */
export const readStops = (scope, grad) => [...stopOwner(scope, grad).querySelectorAll(':scope > stop')].map(readStop)

/**
 * A length as a gradient-space number: a fraction for `objectBoundingBox` (percentages allowed), a user unit for
 * `userSpaceOnUse` (percentages refer to a viewport the tool does not know: null).
 * @param {?string} v @param {number} fallback @param {boolean} bbox
 * @returns {?number}
 */
const length = (v, fallback, bbox) => {
  if (v === null || v.trim() === '') return fallback
  const n = parseFloat(v)
  if (!Number.isFinite(n)) return null
  if (v.trim().endsWith('%')) return bbox ? n / 100 : null
  return n
}

/**
 * Gradient space → the element's local space.
 * @param {boolean} bbox objectBoundingBox units
 * @param {?Box} box the element's geometry box (local, stroke excluded); required for bbox units
 * @param {Matrix} gradientTransform
 * @returns {?Matrix} null when the box is empty
 */
export const gradientToLocal = (bbox, box, gradientTransform) => {
  if (!bbox) return gradientTransform
  if (!box || !(box.width > 0) || !(box.height > 0)) return null
  return multiply({ a: box.width, b: 0, c: 0, d: box.height, e: box.x, f: box.y }, gradientTransform)
}

/**
 * Read a gradient for editing.
 * @param {ParentNode} scope the drawing, to follow `href`s
 * @param {Element} grad a `linearGradient` or `radialGradient`
 * @param {?Box} box the geometry box of the element painted with it
 * @returns {?GradientModel} null when it cannot be edited here (empty box, percentages in user space, singular transform)
 */
export const readGradient = (scope, grad, box) => {
  const kind = grad.tagName === 'radialGradient' ? 'radial' : grad.tagName === 'linearGradient' ? 'linear' : null
  if (!kind) return null
  const bbox = (inheritedAttr(scope, grad, 'gradientUnits') ?? 'objectBoundingBox') !== 'userSpaceOnUse'
  const toLocal = gradientToLocal(bbox, box, parseTransform(inheritedAttr(scope, grad, 'gradientTransform')))
  if (!toLocal || !invert(toLocal)) return null
  /** @param {string} name @param {number} fallback */
  const attr = (name, fallback) => length(inheritedAttr(scope, grad, name, true), fallback, bbox)
  const stops = readStops(scope, grad)
  if (kind === 'linear') {
    const x1 = attr('x1', 0)
    const y1 = attr('y1', 0)
    const x2 = attr('x2', bbox ? 1 : NaN)
    const y2 = attr('y2', 0)
    if ([x1, y1, x2, y2].some((n) => n === null || !Number.isFinite(n))) return null
    const p1 = { x: /** @type {number} */ (x1), y: /** @type {number} */ (y1) }
    return { grad, kind, toLocal, p1, p2: { x: /** @type {number} */ (x2), y: /** @type {number} */ (y2) }, r: 0, focal: p1, stops }
  }
  const cx = attr('cx', bbox ? 0.5 : NaN)
  const cy = attr('cy', bbox ? 0.5 : NaN)
  const r = attr('r', bbox ? 0.5 : NaN)
  if ([cx, cy, r].some((n) => n === null || !Number.isFinite(n))) return null
  const fx = attr('fx', /** @type {number} */ (cx))
  const fy = attr('fy', /** @type {number} */ (cy))
  if (fx === null || fy === null) return null
  const c = { x: /** @type {number} */ (cx), y: /** @type {number} */ (cy) }
  const rad = /** @type {number} */ (r)
  return { grad, kind, toLocal, p1: c, p2: { x: c.x + rad, y: c.y }, r: rad, focal: { x: fx, y: fy }, stops }
}

// ---- which gradient a paint uses -------------------------------------------------

/** @param {?string} value @returns {?string} the id in `url(#id)` */
export const urlId = (value) => /url\(\s*['"]?#([^'")\s]+)['"]?\s*\)/.exec(value ?? '')?.[1] ?? null

/** The paint property as the browser resolves it: `style` wins over the attribute. @param {Element} el @param {string} prop */
export const paintValue = (el, prop) => {
  const m = new RegExp(`(?:^|;)\\s*${prop}\\s*:\\s*([^;]+)`, 'i').exec(el.getAttribute('style') || '')
  return (m ? m[1] : el.getAttribute(prop))?.trim() ?? null
}

/**
 * The gradient an element's fill or stroke refers to.
 * @param {ParentNode} scope @param {Element} el @param {'fill'|'stroke'} prop
 * @returns {?Element}
 */
export const gradientOf = (scope, el, prop) => {
  const id = urlId(paintValue(el, prop))
  const grad = id ? findById(scope, id) : null
  return grad && /^(linear|radial)Gradient$/.test(grad.tagName) ? grad : null
}

/**
 * Whether anything but `(el, prop)` uses the gradient (a paint, or a gradient that inherits from it).
 * @param {ParentNode} scope @param {Element} grad @param {Element} el @param {string} prop
 */
const isShared = (scope, grad, el, prop) => {
  const id = grad.getAttribute('id')
  for (const other of scope.querySelectorAll('*')) {
    if (other === grad || other.hasAttribute('data-se-ephemeral')) continue
    if (/gradient$/i.test(other.tagName)) {
      if (hrefId(other) === id) return true
      continue
    }
    for (const p of ['fill', 'stroke']) {
      if (other === el && p === prop) continue
      if (urlId(paintValue(other, p)) === id) return true
    }
  }
  return false
}

/**
 * Make the gradient of `(el, prop)` safe to edit: when anything else uses it, give the element a copy
 * (new id, inserted after the original) and point the paint at it.
 * @param {ParentNode} scope the drawing
 * @param {Element} el
 * @param {'fill'|'stroke'} prop
 * @param {Element} grad the gradient the paint refers to
 * @param {() => string} nextId
 * @returns {Element} `grad`, or its copy
 */
export const ensureOwnGradient = (scope, el, prop, grad, nextId) => {
  if (!isShared(scope, grad, el, prop)) return grad
  const copy = /** @type {Element} */ (grad.cloneNode(true))
  const id = nextId()
  copy.setAttribute('id', id)
  grad.after(copy)
  const ref = `url(#${id})`
  if (el.hasAttribute(prop)) el.setAttribute(prop, ref)
  const style = el.getAttribute('style')
  if (style && new RegExp(`(?:^|;)\\s*${prop}\\s*:`, 'i').test(style)) {
    el.setAttribute('style', style.replace(new RegExp(`((?:^|;)\\s*${prop}\\s*:\\s*)[^;]+`, 'i'), `$1${ref}`))
  } else if (!el.hasAttribute(prop)) {
    el.setAttribute(prop, ref)
  }
  return copy
}

// ---- writing ---------------------------------------------------------------------

/**
 * Set a linear gradient's vector (gradient space).
 * @param {Element} grad @param {Point} p1 @param {Point} p2
 */
export const setLinear = (grad, p1, p2) => {
  grad.setAttribute('x1', fmt(p1.x))
  grad.setAttribute('y1', fmt(p1.y))
  grad.setAttribute('x2', fmt(p2.x))
  grad.setAttribute('y2', fmt(p2.y))
}

/**
 * Set a radial gradient's centre, radius and focal point (gradient space).
 * @param {Element} grad @param {Point} c @param {number} r @param {Point} focal
 */
export const setRadial = (grad, c, r, focal) => {
  grad.setAttribute('cx', fmt(c.x))
  grad.setAttribute('cy', fmt(c.y))
  grad.setAttribute('r', fmt(Math.max(r, 1e-5)))
  grad.setAttribute('fx', fmt(focal.x))
  grad.setAttribute('fy', fmt(focal.y))
}

/**
 * The gradient's own `<stop>`s. A gradient that takes its stops from another through `href` gets copies of them first
 * (its own stops replace the inherited ones), so editing never touches the gradient it inherits from.
 * @param {ParentNode} scope @param {Element} grad @returns {Element[]}
 */
export const ownStops = (scope, grad) => {
  if (!grad.querySelector(':scope > stop')) {
    for (const s of stopOwner(scope, grad).querySelectorAll(':scope > stop')) grad.append(s.cloneNode(true))
  }
  return [...grad.querySelectorAll(':scope > stop')]
}

/** @param {string} c @returns {?[number, number, number]} */
const parseRgb = (c) => {
  const hex = /^#([0-9a-f]{3}|[0-9a-f]{6})$/i.exec(c.trim())
  if (hex) {
    const h = hex[1].length === 3 ? [...hex[1]].map((x) => x + x).join('') : hex[1]
    return [parseInt(h.slice(0, 2), 16), parseInt(h.slice(2, 4), 16), parseInt(h.slice(4, 6), 16)]
  }
  const rgb = /^rgba?\(\s*([\d.]+)[\s,]+([\d.]+)[\s,]+([\d.]+)/i.exec(c.trim())
  return rgb ? [Number(rgb[1]), Number(rgb[2]), Number(rgb[3])] : null
}

/**
 * The colour a new stop at `t` starts with: the neighbours' colours mixed (nearest one's when either is not a
 * hex / rgb() colour). Stops must be sorted by offset.
 * @param {Stop[]} stops @param {number} t
 * @returns {{color: string, opacity: number}}
 */
export const colorAt = (stops, t) => {
  if (!stops.length) return { color: '#000000', opacity: 1 }
  const next = stops.findIndex((s) => s.offset > t)
  if (next === 0) return { color: stops[0].color, opacity: stops[0].opacity }
  if (next === -1) return { color: stops[stops.length - 1].color, opacity: stops[stops.length - 1].opacity }
  const a = stops[next - 1]
  const b = stops[next]
  const k = b.offset === a.offset ? 0 : (t - a.offset) / (b.offset - a.offset)
  const ca = parseRgb(a.color)
  const cb = parseRgb(b.color)
  const opacity = a.opacity + (b.opacity - a.opacity) * k
  if (!ca || !cb) return k < 0.5 ? { color: a.color, opacity } : { color: b.color, opacity }
  const hex = ca.map((v, i) => Math.round(v + (cb[i] - v) * k).toString(16).padStart(2, '0')).join('')
  return { color: `#${hex}`, opacity }
}

/** @param {Element} stop @param {string} prop @param {string} value Write where the stop keeps it (`style` wins). */
const writeStopProp = (stop, prop, value) => {
  const style = stop.getAttribute('style')
  const re = new RegExp(`((?:^|;)\\s*${prop}\\s*:\\s*)[^;]+`, 'i')
  if (style && re.test(style)) stop.setAttribute('style', style.replace(re, `$1${value}`))
  else stop.setAttribute(prop, value)
}

/** @param {Element} stop @param {string} color `#rrggbb` @param {number} opacity */
export const setStopColor = (stop, color, opacity) => {
  writeStopProp(stop, 'stop-color', color)
  writeStopProp(stop, 'stop-opacity', fmt(opacity))
}

/**
 * Put `stop` at `offset` and keep the stops sorted (SVG treats an offset below the previous one as equal to it,
 * so a stop dragged past a neighbour must change places with it in the DOM).
 * @param {Element} stop
 * @param {number} offset
 */
export const placeStop = (stop, offset) => {
  const grad = /** @type {Element} */ (stop.parentElement)
  const t = Math.min(1, Math.max(0, offset))
  stop.setAttribute('offset', fmt(t))
  const others = [...grad.querySelectorAll(':scope > stop')].filter((s) => s !== stop)
  const before = others.find((s) => parseOffset(s.getAttribute('offset')) > t)
  if (before) { if (stop.nextElementSibling !== before) before.before(stop) } else if (stop.nextElementSibling) grad.append(stop)
}

/**
 * Add a stop at `t`, coloured by its neighbours. The gradient must have its own stops ({@link ownStops}).
 * @param {Element} grad @param {number} t
 * @returns {Element} the new `<stop>`
 */
export const addStop = (grad, t) => {
  const stops = [...grad.querySelectorAll(':scope > stop')].map(readStop)
  const { color, opacity } = colorAt(stops, t)
  const stop = grad.ownerDocument.createElementNS(NS.SVG, 'stop')
  grad.append(stop)
  setStopColor(stop, color, opacity)
  placeStop(stop, t)
  return stop
}

/**
 * A copy of `stop` at `offset` (Alt-drag).
 * @param {Element} stop @param {number} offset @returns {Element}
 */
export const copyStop = (stop, offset) => {
  const copy = /** @type {Element} */ (stop.cloneNode(true))
  stop.after(copy)
  placeStop(copy, offset)
  return copy
}

/** Remove a stop, never leaving fewer than two. @param {Element} stop @returns {boolean} */
export const removeStop = (stop) => {
  const grad = stop.parentElement
  if (!grad || grad.querySelectorAll(':scope > stop').length <= 2) return false
  stop.remove()
  return true
}
