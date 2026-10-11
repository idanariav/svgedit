// @ts-check
/**
 * Recolor Artwork: the colour maths and the DOM walk behind the Recolor dialog (`ext-recolor`).
 *
 * The dialog lists the distinct colours a selection uses as rows "current → new". This module supplies
 * - {@link collectColors}: every solid colour of the selection (fills, strokes, the stops of the gradients
 *   and the flood colours of the filters they refer to) with a use count;
 * - {@link buildRows}: those colours grouped into rows (White / Black / Grays kept out, or reduced to N rows by
 *   clustering in Lab);
 * - {@link rowMap}: how a row's colours take the row's new colour ({@link METHODS});
 * - {@link harmonyColors}: a harmony rule applied to a base colour;
 * - {@link applyColors}: write a `Map` of old → new colours back, copying a gradient or filter first when
 *   anything outside the selection uses it (clone-on-write, as the gradient tool does).
 *
 * Colours are `#rrggbb` strings at the API and `[r, g, b]` (0–255) inside. A colour is only collected when it
 * is a plain, opaque `#hex`, `rgb()` or basic named colour: `rgba()` with alpha, `currentColor`, `url()`
 * paints other than gradients and system colours are left alone. An element that sets no fill at all
 * (SVG's implicit black) is not counted either.
 *
 * Inspired by VectorCraft (https://github.com/storytold/vectorcraft), `crates/color/src/recolor.rs`
 * (colour keys, preserve rules, the row methods, clustering) and `harmony.rs` (the harmony rules),
 * MIT OR Apache-2.0 — RGB only, as SVG has no other model.
 * @module recolor
 * @license MIT
 */

import { findById, ownStops, readStops, urlId } from './gradient-edit.js'

/** @typedef {[number, number, number]} Rgb */
/** @typedef {{hex: string, count: number}} ColorUse */
/** @typedef {{colors: ColorUse[], count: number}} Row a group of colours that share a new colour */

// ---- colour parsing and conversion -------------------------------------------------------------

const NAMED = {
  black: '#000000',
  white: '#ffffff',
  red: '#ff0000',
  lime: '#00ff00',
  blue: '#0000ff',
  yellow: '#ffff00',
  cyan: '#00ffff',
  aqua: '#00ffff',
  magenta: '#ff00ff',
  fuchsia: '#ff00ff',
  gray: '#808080',
  grey: '#808080',
  silver: '#c0c0c0',
  maroon: '#800000',
  olive: '#808000',
  green: '#008000',
  purple: '#800080',
  teal: '#008080',
  navy: '#000080',
  orange: '#ffa500'
}

/**
 * A plain opaque CSS colour as RGB, or null for anything else (none, url(), currentColor, rgba with alpha, …).
 * @param {?string} value
 * @returns {?Rgb}
 */
export const parseColor = (value) => {
  const v = (value ?? '').trim().toLowerCase()
  const named = /** @type {Record<string, string>} */ (NAMED)[v]
  const s = named ?? v
  const hex = /^#([0-9a-f]{3}|[0-9a-f]{6})$/.exec(s)
  if (hex) {
    const h = hex[1].length === 3 ? [...hex[1]].map((x) => x + x).join('') : hex[1]
    return [parseInt(h.slice(0, 2), 16), parseInt(h.slice(2, 4), 16), parseInt(h.slice(4, 6), 16)]
  }
  const m = /^rgba?\(\s*([\d.]+)(%?)[\s,]+([\d.]+)(%?)[\s,]+([\d.]+)(%?)\s*(?:[,/]\s*([\d.]+)(%?))?\s*\)$/.exec(s)
  if (!m) return null
  if (m[7] !== undefined && Number(m[7]) / (m[8] ? 100 : 1) < 1) return null
  const ch = (/** @type {string} */ n, /** @type {string} */ pct) => Math.round(Math.min(255, pct ? Number(n) * 255 / 100 : Number(n)))
  return [ch(m[1], m[2]), ch(m[3], m[4]), ch(m[5], m[6])]
}

/** @param {Rgb} c @returns {string} */
export const toHex = (c) => '#' + c.map((x) => Math.min(255, Math.max(0, Math.round(x))).toString(16).padStart(2, '0')).join('')

/** @param {?string} value @returns {?string} `#rrggbb` */
export const normalizeColor = (value) => {
  const c = parseColor(value)
  return c ? toHex(c) : null
}

/** @param {Rgb} c @returns {[number, number, number]} hue in degrees, saturation and brightness 0..1 */
export const rgbToHsb = ([r, g, b]) => {
  const max = Math.max(r, g, b)
  const min = Math.min(r, g, b)
  const d = max - min
  let h = 0
  if (d > 0) {
    if (max === r) h = ((g - b) / d + 6) % 6
    else if (max === g) h = (b - r) / d + 2
    else h = (r - g) / d + 4
  }
  return [h * 60, max === 0 ? 0 : d / max, max / 255]
}

/** @param {number} h degrees @param {number} s 0..1 @param {number} v 0..1 @returns {Rgb} */
export const hsbToRgb = (h, s, v) => {
  const hh = (((h % 360) + 360) % 360) / 60
  const c = v * s
  const x = c * (1 - Math.abs((hh % 2) - 1))
  const [r, g, b] = [[c, x, 0], [x, c, 0], [0, c, x], [0, x, c], [x, 0, c], [c, 0, x]][Math.min(5, Math.floor(hh))]
  const m = v - c
  return [(r + m) * 255, (g + m) * 255, (b + m) * 255]
}

/** @param {Rgb} c @returns {[number, number, number]} CIE L*a*b* (D65) */
export const rgbToLab = (c) => {
  const [r, g, b] = c.map((x) => {
    const v = x / 255
    return v <= 0.04045 ? v / 12.92 : ((v + 0.055) / 1.055) ** 2.4
  })
  const f = (/** @type {number} */ t) => (t > 216 / 24389 ? Math.cbrt(t) : (24389 / 27 * t + 16) / 116)
  const fx = f((0.4124564 * r + 0.3575761 * g + 0.1804375 * b) / 0.95047)
  const fy = f(0.2126729 * r + 0.7151522 * g + 0.072175 * b)
  const fz = f((0.0193339 * r + 0.119192 * g + 0.9503041 * b) / 1.08883)
  return [116 * fy - 16, 500 * (fx - fy), 200 * (fy - fz)]
}

/** @param {string} hex @param {number} degrees @returns {string} `hex` with its hue turned (greys stay grey) */
export const shiftHue = (hex, degrees) => {
  const rgb = parseColor(hex)
  if (!rgb) return hex
  const [h, s, v] = rgbToHsb(rgb)
  return s <= 0 ? toHex(rgb) : toHex(hsbToRgb(h + degrees, s, v))
}

// ---- White / Black / Grays ---------------------------------------------------------------------

/** @typedef {{white: boolean, black: boolean, grays: boolean}} Preserve */
/** What Recolor leaves alone by default. @type {Preserve} */
export const DEFAULT_PRESERVE = Object.freeze({ white: true, black: true, grays: false })

const NEUTRAL_EPS = 0.005 * 255

/** @param {Rgb} c @returns {?('white'|'black'|'gray')} the neutral a colour is, if any */
export const neutralOf = (c) => {
  const lo = Math.min(...c)
  const hi = Math.max(...c)
  if (lo >= 255 - NEUTRAL_EPS) return 'white'
  if (hi <= NEUTRAL_EPS) return 'black'
  return hi - lo <= NEUTRAL_EPS ? 'gray' : null
}

/** @param {string} hex @param {Preserve} preserve @returns {boolean} */
export const isPreserved = (hex, preserve) => {
  const rgb = parseColor(hex)
  const n = rgb ? neutralOf(rgb) : null
  return n === 'white' ? preserve.white : n === 'black' ? preserve.black : n === 'gray' ? preserve.grays : false
}

// ---- how a row takes its new colour ------------------------------------------------------------

export const METHODS = Object.freeze([
  { id: 'exact', label: 'Exact' },
  { id: 'preserveTints', label: 'Preserve Tints' },
  { id: 'scaleTints', label: 'Scale Tints' },
  { id: 'tintsShades', label: 'Tints and Shades' },
  { id: 'hueShift', label: 'Hue Shift' }
])

/** Toward paper white: `t` = 1 is `c`, 0 is white. @param {Rgb} c @param {number} t @returns {Rgb} */
const tinted = (c, t) => /** @type {Rgb} */ (c.map((x) => 255 - (255 - x) * t))

/** Toward black. @param {Rgb} c @param {number} f @returns {Rgb} */
const shaded = (c, f) => /** @type {Rgb} */ (c.map((x) => x * (1 - Math.min(1, Math.max(0, f)))))

/** @param {Rgb} c @returns {number[]} how much ink each channel carries (1 − RGB) */
const ink = (c) => c.map((x) => 1 - x / 255)

/** @param {number[]} a @param {number[]} b */
const dot = (a, b) => a.reduce((s, x, i) => s + x * b[i], 0)

/** How much of `base`'s ink `c` carries, 0 (paper) … 1 (`base` or darker). @param {Rgb} c @param {Rgb} base */
const tintOf = (c, base) => {
  const b = ink(base)
  const bb = dot(b, b)
  return bb <= 1e-9 ? 1 : Math.min(1, Math.max(0, dot(ink(c), b) / bb))
}

/** Whether `c` is a tint of `base` (its ink a fraction of `base`'s). @param {Rgb} c @param {Rgb} base */
const isTint = (c, base) => {
  const t = tintOf(c, base)
  const [a, b] = [ink(c), ink(base)]
  return a.every((x, i) => Math.abs(x - b[i] * t) <= 0.01)
}

/**
 * The colour of `row` the new colour stands for: the most saturated for Hue Shift, the one of average
 * lightness for Tints and Shades, else the darkest.
 * @param {string} method @param {string[]} row non-empty
 * @returns {string}
 */
export const keyColor = (method, row) => {
  const labs = row.map((hex) => ({ hex, lab: rgbToLab(/** @type {Rgb} */ (parseColor(hex))) }))
  const mean = labs.reduce((s, x) => s + x.lab[0], 0) / labs.length
  const chroma = (/** @type {number[]} */ l) => Math.hypot(l[1], l[2])
  const score = method === 'hueShift'
    ? (/** @type {number[]} */ l) => -chroma(l) * 1000 + l[0]
    : method === 'tintsShades'
      ? (/** @type {number[]} */ l) => Math.abs(l[0] - mean)
      : (/** @type {number[]} */ l) => l[0] * 1000 - chroma(l)
  return labs.reduce((best, x) => (score(x.lab) < score(best.lab) ? x : best)).hex
}

/**
 * The function that maps each colour of `row` to its new colour once the row takes `to`.
 * @param {string} method one of {@link METHODS}
 * @param {string[]} row current colours (`#rrggbb`), non-empty
 * @param {string} to the row's new colour
 * @returns {{key: string, map: (hex: string) => string}}
 */
export const rowMap = (method, row, to) => {
  const key = keyColor(method, row)
  const toRgb = /** @type {Rgb} */ (parseColor(to))
  const keyRgb = /** @type {Rgb} */ (parseColor(key))
  const mean = row.reduce((s, hex) => s + rgbToLab(/** @type {Rgb} */ (parseColor(hex)))[0], 0) / row.length
  const turn = rgbToHsb(toRgb)[0] - rgbToHsb(keyRgb)[0]
  /** @param {Rgb} c @returns {Rgb} */
  const one = (c) => {
    switch (method) {
      case 'preserveTints': return isTint(c, keyRgb) ? tinted(toRgb, tintOf(c, keyRgb)) : toRgb
      case 'scaleTints': return tinted(toRgb, tintOf(c, keyRgb))
      case 'tintsShades': {
        const d = rgbToLab(c)[0] - mean
        return d >= 0 ? tinted(toRgb, 1 - d / Math.max(1e-3, 100 - mean)) : shaded(toRgb, -d / Math.max(1e-3, mean))
      }
      case 'hueShift': {
        if (toHex(c) === key) return toRgb
        const [h, s, v] = rgbToHsb(c)
        return s <= 0 ? c : hsbToRgb(h + turn, s, v)
      }
      default: return toRgb
    }
  }
  return { key, map: (hex) => toHex(one(/** @type {Rgb} */ (parseColor(hex)))) }
}

// ---- rows: preserve, reduce ---------------------------------------------------------------------

/**
 * Group `colors` into at most `n` rows of similar colours: k-means in Lab (lightness counting half, so tints
 * and shades of a hue stay together) weighted by `weights`, seeded with the heaviest colour and then
 * farthest-first, so the result is the same on every run. Rows are lists of indices into `colors`, ordered by
 * their first index.
 * @param {string[]} colors @param {number[]} weights @param {number} n
 * @returns {number[][]}
 */
export const cluster = (colors, weights, n) => {
  const pts = colors.map((hex) => {
    const [l, a, b] = rgbToLab(/** @type {Rgb} */ (parseColor(hex)))
    return [l * 0.5, a, b]
  })
  if (!pts.length) return []
  const w = (/** @type {number} */ i) => Math.max(1e-6, weights[i] ?? 1)
  const d2 = (/** @type {number[]} */ a, /** @type {number[]} */ b) => (a[0] - b[0]) ** 2 + (a[1] - b[1]) ** 2 + (a[2] - b[2]) ** 2
  const first = pts.reduce((best, _, i) => (w(i) > w(best) ? i : best), 0)
  const centres = [pts[first]]
  const near = pts.map((p) => d2(p, pts[first]))
  while (centres.length < Math.max(1, n)) {
    let [far, at] = [0, 0]
    near.forEach((d, i) => { if (d > far) [far, at] = [d, i] })
    if (far <= 1e-6) break
    centres.push(pts[at])
    pts.forEach((p, j) => { near[j] = Math.min(near[j], d2(p, pts[at])) })
  }
  const nearest = (/** @type {number[]} */ p) =>
    centres.reduce((best, c, i) => (d2(p, c) < d2(p, centres[best]) ? i : best), 0)
  let of = pts.map(nearest)
  for (let iter = 0; iter < 50; iter++) {
    const sum = centres.map(() => ({ v: [0, 0, 0], w: 0 }))
    pts.forEach((p, i) => {
      for (let k = 0; k < 3; k++) sum[of[i]].v[k] += p[k] * w(i)
      sum[of[i]].w += w(i)
    })
    sum.forEach((s, i) => { if (s.w > 0) centres[i] = s.v.map((x) => x / s.w) })
    const next = pts.map(nearest)
    if (next.every((x, i) => x === of[i])) break
    of = next
  }
  const rows = centres.map(() => /** @type {number[]} */ ([]))
  of.forEach((c, i) => rows[c].push(i))
  return rows.filter((r) => r.length).sort((a, b) => a[0] - b[0])
}

/**
 * The rows of a colour list: preserved neutrals dropped, then (when `reduce` is smaller than the number of
 * colours left) clustered into `reduce` rows. Each colour is its own row otherwise. Rows keep the order of
 * `uses` (most used first).
 * @param {ColorUse[]} uses
 * @param {{preserve?: Preserve, reduce?: number}} [options] `reduce` 0 or missing keeps every colour
 * @returns {Row[]}
 */
export const buildRows = (uses, { preserve = DEFAULT_PRESERVE, reduce = 0 } = {}) => {
  const kept = uses.filter((u) => !isPreserved(u.hex, preserve))
  const groups = reduce > 0 && reduce < kept.length
    ? cluster(kept.map((u) => u.hex), kept.map((u) => u.count), reduce)
    : kept.map((_, i) => [i])
  return groups.map((g) => {
    const colors = g.map((i) => kept[i])
    return { colors, count: colors.reduce((s, c) => s + c.count, 0) }
  })
}

/**
 * The old → new colour map of a set of rows.
 * @param {Row[]} rows @param {string[]} targets each row's new colour @param {string} method
 * @returns {Map<string, string>} only the colours that change
 */
export const planMap = (rows, targets, method) => {
  const plan = new Map()
  rows.forEach((row, i) => {
    const { map } = rowMap(method, row.colors.map((c) => c.hex), targets[i])
    for (const { hex } of row.colors) {
      const next = map(hex)
      if (next !== hex) plan.set(hex, next)
    }
  })
  return plan
}

// ---- harmony rules ------------------------------------------------------------------------------

/** A tone is [hue turn in degrees, saturation factor, brightness factor or 'c' for the contrasting one]. @param {number} turn */
const t = (turn) => /** @type {[number, number, number|'c']} */ ([turn, 1, 1])
/** @param {number} turn */
const soft = (turn) => /** @type {[number, number, number|'c']} */ ([turn, 0.5, 1])
/** @param {number} turn */
const deep = (turn) => /** @type {[number, number, number|'c']} */ ([turn, 1, 0.6])
/** @param {number} turn */
const hc = (turn) => /** @type {[number, number, number|'c']} */ ([turn, 1, 'c'])
/** @param {number} turn @param {number} s @param {number} b */
const sv = (turn, s, b) => /** @type {[number, number, number|'c']} */ ([turn, s, b])

/** The harmony rules: each is a list of tones, the base colour first. */
export const HARMONIES = Object.freeze([
  { id: 'complementary', label: 'Complementary', tones: [t(0), t(180)] },
  { id: 'complementary2', label: 'Complementary 2', tones: [t(0), soft(0), t(180), soft(180)] },
  { id: 'splitComplementary', label: 'Split Complementary', tones: [t(0), t(150), t(210)] },
  { id: 'leftComplement', label: 'Left Complement', tones: [t(0), t(-30), t(150)] },
  { id: 'rightComplement', label: 'Right Complement', tones: [t(0), t(30), t(210)] },
  { id: 'analogous', label: 'Analogous', tones: [t(0), t(30), t(-30)] },
  { id: 'analogous2', label: 'Analogous 2', tones: [t(0), t(30), t(60), t(-30), t(-60)] },
  { id: 'monochromatic', label: 'Monochromatic', tones: [t(0), sv(0, 0.5, 1), sv(0, 1, 0.6), sv(0, 0.25, 1), sv(0, 1, 0.35)] },
  { id: 'shades', label: 'Shades', tones: [t(0), sv(0, 1, 0.8), sv(0, 1, 0.6), sv(0, 1, 0.4), sv(0, 1, 0.2)] },
  { id: 'triad', label: 'Triad', tones: [t(0), t(120), t(240)] },
  { id: 'triad2', label: 'Triad 2', tones: [t(0), t(120), soft(120), t(240), soft(240)] },
  { id: 'triad3', label: 'Triad 3', tones: [t(0), t(120), deep(120), t(240), deep(240)] },
  { id: 'tetrad', label: 'Tetrad', tones: [t(0), t(60), t(180), t(240)] },
  { id: 'tetrad2', label: 'Tetrad 2', tones: [t(0), t(90), t(180), t(270)] },
  { id: 'tetrad3', label: 'Tetrad 3', tones: [t(0), t(30), t(180), t(210)] },
  { id: 'compound', label: 'Compound', tones: [t(0), t(40), t(160), t(200)] },
  { id: 'compound2', label: 'Compound 2', tones: [t(0), t(-40), t(160), t(200)] },
  { id: 'highContrast', label: 'High Contrast', tones: [t(0), hc(180)] },
  { id: 'highContrast2', label: 'High Contrast 2', tones: [t(0), hc(0), t(180), hc(180)] },
  { id: 'highContrast3', label: 'High Contrast 3', tones: [t(0), hc(120), hc(240)] },
  { id: 'pentagram', label: 'Pentagram', tones: [t(0), t(72), t(144), t(216), t(288)] }
])

/** The brightness that contrasts with `v`. @param {number} v */
const contrast = (v) => (v >= 0.5 ? v * 0.3 : 0.7 + 0.3 * v)

/**
 * The colours of a harmony rule built from `base`, `base` itself first.
 * @param {string} rule an id of {@link HARMONIES}
 * @param {string} base `#rrggbb`
 * @returns {string[]}
 */
export const harmonyColors = (rule, base) => {
  const harmony = HARMONIES.find((h) => h.id === rule)
  const rgb = parseColor(base)
  if (!harmony || !rgb) return [base]
  const [h, s, v] = rgbToHsb(rgb)
  return harmony.tones.map(([turn, sat, bright], i) => {
    if (i === 0) return toHex(rgb)
    const b = bright === 'c' ? contrast(v) : v * bright
    return toHex(hsbToRgb(h + turn, Math.min(1, Math.max(0, s * sat)), Math.min(1, Math.max(0, b))))
  })
}

// ---- reading and writing the drawing ------------------------------------------------------------

/** @param {Element} el @param {string} prop @returns {?string} */
const styleValue = (el, prop) => {
  const m = new RegExp(`(?:^|;)\\s*${prop}\\s*:\\s*([^;]+)`, 'i').exec(el.getAttribute('style') || '')
  return m ? m[1].trim() : null
}

/**
 * Where an element keeps a property: its attribute and/or its `style`.
 * @param {Element} el @param {string} prop
 * @returns {{el: Element, prop: string, where: 'attr'|'style', value: string}[]}
 */
const slotsOf = (el, prop) => {
  const out = []
  const attr = el.getAttribute(prop)
  if (attr !== null) out.push({ el, prop, where: /** @type {'attr'} */ ('attr'), value: attr.trim() })
  const style = styleValue(el, prop)
  if (style !== null) out.push({ el, prop, where: /** @type {'style'} */ ('style'), value: style })
  return out
}

/** @param {{el: Element, prop: string, where: 'attr'|'style'}} slot @param {string} value */
const writeSlot = ({ el, prop, where }, value) => {
  if (where === 'attr') {
    el.setAttribute(prop, value)
    return
  }
  const re = new RegExp(`((?:^|;)\\s*${prop}\\s*:\\s*)[^;]+`, 'i')
  el.setAttribute('style', (el.getAttribute('style') || '').replace(re, `$1${value}`))
}

/** The selection and everything inside it that paints. @param {Element[]} roots @returns {Set<Element>} */
const paintedElements = (roots) => {
  const out = new Set()
  for (const root of roots) {
    out.add(root)
    for (const el of root.querySelectorAll('*')) {
      if (!el.hasAttribute('data-se-ephemeral') && !el.closest('defs')) out.add(el)
    }
  }
  return out
}

/**
 * What the selection refers to by `url(#id)`: gradients through `fill` / `stroke`, filters through `filter`.
 * @param {ParentNode} scope @param {Set<Element>} els
 * @returns {{kind: 'gradient'|'filter', id: string, node: Element, slot: ReturnType<typeof slotsOf>[number]}[]}
 */
const serversOf = (scope, els) => {
  const out = []
  for (const el of els) {
    for (const [prop, kind, re] of /** @type {const} */ ([
      ['fill', 'gradient', /^(linear|radial)Gradient$/], ['stroke', 'gradient', /^(linear|radial)Gradient$/],
      ['filter', 'filter', /^filter$/]
    ])) {
      for (const slot of slotsOf(el, prop)) {
        const id = urlId(slot.value)
        const node = id ? findById(scope, id) : null
        if (id && node && re.test(node.tagName)) out.push({ kind, id, node, slot })
      }
    }
  }
  return out
}

/** @param {Element} el @returns {?string} */
const hrefId = (el) => {
  const v = el.getAttribute('href') ?? el.getAttribute('xlink:href')
  return v && v.startsWith('#') ? v.slice(1) : null
}

/**
 * Whether anything outside `els` uses the gradient or filter `id` (a paint, a `filter`, a gradient that
 * inherits from it).
 * @param {ParentNode} scope @param {Set<Element>} els @param {string} id
 */
const usedOutside = (scope, els, id) => {
  for (const other of scope.querySelectorAll('*')) {
    if (els.has(other) || other.hasAttribute('data-se-ephemeral')) continue
    if (/gradient$/i.test(other.tagName) && hrefId(other) === id) return true
    for (const prop of ['fill', 'stroke', 'filter']) {
      if (slotsOf(other, prop).some((s) => urlId(s.value) === id)) return true
    }
  }
  return false
}

/**
 * The colour slots of a gradient (its stops) or filter (its flood colours). With `own` the gradient first
 * takes the stops it inherits.
 * @param {ParentNode} scope @param {Element} node @param {boolean} own
 * @returns {{slot: ReturnType<typeof slotsOf>[number], hex: string}[]}
 */
const serverSlots = (scope, node, own) => {
  /** @type {[Element, string][]} */
  const targets = /gradient$/i.test(node.tagName)
    ? (own ? ownStops(scope, node) : readStops(scope, node).map((s) => s.node)).map((stop) => [stop, 'stop-color'])
    : [...node.querySelectorAll('feFlood, feDropShadow')].map((fe) => [fe, 'flood-color'])
  return slotted(targets)
}

/** @param {[Element, string][]} targets @returns {{slot: ReturnType<typeof slotsOf>[number], hex: string}[]} */
const slotted = (targets) => {
  const out = []
  for (const [el, prop] of targets) {
    for (const slot of slotsOf(el, prop)) {
      const hex = normalizeColor(slot.value)
      if (hex) out.push({ slot, hex })
    }
  }
  return out
}

/**
 * Every colour slot of the selection: its own fills and strokes, then the stops and flood colours of the
 * gradients and filters it refers to (each once).
 * @param {ParentNode} scope @param {Set<Element>} els
 * @param {(hex: string) => boolean} [owns] copy a gradient's inherited stops onto it when one of its colours matches
 */
const colorSlots = (scope, els, owns) => {
  const out = slotted([...els].flatMap((el) => [[el, 'fill'], [el, 'stroke']]))
  const seen = new Set()
  for (const { node } of serversOf(scope, els)) {
    if (seen.has(node)) continue
    seen.add(node)
    out.push(...serverSlots(scope, node, owns ? serverSlots(scope, node, false).some((s) => owns(s.hex)) : false))
  }
  return out
}

/**
 * Give the selection its own copy of every gradient and filter that something else also uses and that holds a
 * colour `changes` accepts.
 * @param {ParentNode} scope @param {Set<Element>} els @param {(hex: string) => boolean} changes @param {() => string} nextId
 */
const copyShared = (scope, els, changes, nextId) => {
  /** @type {Map<string, Element>} */
  const copies = new Map()
  for (const ref of serversOf(scope, els)) {
    if (!copies.has(ref.id) && serverSlots(scope, ref.node, false).some((s) => changes(s.hex)) && usedOutside(scope, els, ref.id)) {
      const copy = /** @type {Element} */ (ref.node.cloneNode(true))
      copy.setAttribute('id', nextId())
      ref.node.after(copy)
      copies.set(ref.id, copy)
    }
    const copy = copies.get(ref.id)
    if (copy) writeSlot(ref.slot, `url(#${copy.getAttribute('id')})`)
  }
}

/**
 * The distinct solid colours of the selection, most used first.
 * @param {ParentNode} scope the drawing
 * @param {Element[]} roots the selected elements
 * @returns {ColorUse[]}
 */
export const collectColors = (scope, roots) => {
  /** @type {Map<string, number>} */
  const counts = new Map()
  for (const { hex } of colorSlots(scope, paintedElements(roots))) counts.set(hex, (counts.get(hex) ?? 0) + 1)
  return [...counts.entries()].map(([hex, count]) => ({ hex, count })).sort((a, b) => b.count - a.count)
}

/**
 * Rewrite colours of the selection: every slot whose colour is a key of `map` takes the mapped colour.
 * Gradients and filters something outside the selection also uses are copied first. Call it inside
 * `svgCanvas.transact`.
 * @param {ParentNode} scope @param {Element[]} roots @param {Map<string, string>} map old → new `#rrggbb`
 * @param {() => string} nextId
 * @returns {number} the number of colours written
 */
export const applyColors = (scope, roots, map, nextId) => {
  const els = paintedElements(roots)
  const changes = (/** @type {string} */ hex) => map.has(hex) && map.get(hex) !== hex
  copyShared(scope, els, changes, nextId)
  let n = 0
  for (const { slot, hex } of colorSlots(scope, els, changes)) {
    if (changes(hex)) {
      writeSlot(slot, /** @type {string} */ (map.get(hex)))
      n++
    }
  }
  return n
}
