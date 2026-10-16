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

import { findById, ownStops, readStops, urlId } from './gradient-edit.ts'

export type Rgb = [number, number, number]
export interface ColorUse { hex: string, count: number }
/** A group of colours that share a new colour. */
export interface Row { colors: ColorUse[], count: number }

// ---- colour parsing and conversion -------------------------------------------------------------

const NAMED: Record<string, string> = {
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
 */
export const parseColor = (value: string | null | undefined): Rgb | null => {
  const v = (value ?? '').trim().toLowerCase()
  const named = NAMED[v]
  const s = named ?? v
  const hex = /^#([0-9a-f]{3}|[0-9a-f]{6})$/.exec(s)
  if (hex) {
    const h = hex[1].length === 3 ? [...hex[1]].map((x) => x + x).join('') : hex[1]
    return [parseInt(h.slice(0, 2), 16), parseInt(h.slice(2, 4), 16), parseInt(h.slice(4, 6), 16)]
  }
  const m = /^rgba?\(\s*([\d.]+)(%?)[\s,]+([\d.]+)(%?)[\s,]+([\d.]+)(%?)\s*(?:[,/]\s*([\d.]+)(%?))?\s*\)$/.exec(s)
  if (!m) return null
  if (m[7] !== undefined && Number(m[7]) / (m[8] ? 100 : 1) < 1) return null
  const ch = (n: string, pct: string): number => Math.round(Math.min(255, pct ? Number(n) * 255 / 100 : Number(n)))
  return [ch(m[1], m[2]), ch(m[3], m[4]), ch(m[5], m[6])]
}

export const toHex = (c: number[]): string => '#' + c.map((x) => Math.min(255, Math.max(0, Math.round(x))).toString(16).padStart(2, '0')).join('')

/** @returns `#rrggbb` */
export const normalizeColor = (value: string | null | undefined): string | null => {
  const c = parseColor(value)
  return c ? toHex(c) : null
}

/** @returns hue in degrees, saturation and brightness 0..1 */
export const rgbToHsb = ([r, g, b]: Rgb): [number, number, number] => {
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

/** @param h degrees @param s 0..1 @param v 0..1 */
export const hsbToRgb = (h: number, s: number, v: number): Rgb => {
  const hh = (((h % 360) + 360) % 360) / 60
  const c = v * s
  const x = c * (1 - Math.abs((hh % 2) - 1))
  const [r, g, b] = [[c, x, 0], [x, c, 0], [0, c, x], [0, x, c], [x, 0, c], [c, 0, x]][Math.min(5, Math.floor(hh))]
  const m = v - c
  return [(r + m) * 255, (g + m) * 255, (b + m) * 255]
}

/** @returns CIE L*a*b* (D65) */
export const rgbToLab = (c: Rgb): [number, number, number] => {
  const [r, g, b] = c.map((x) => {
    const v = x / 255
    return v <= 0.04045 ? v / 12.92 : ((v + 0.055) / 1.055) ** 2.4
  })
  const f = (t: number): number => (t > 216 / 24389 ? Math.cbrt(t) : (24389 / 27 * t + 16) / 116)
  const fx = f((0.4124564 * r + 0.3575761 * g + 0.1804375 * b) / 0.95047)
  const fy = f(0.2126729 * r + 0.7151522 * g + 0.072175 * b)
  const fz = f((0.0193339 * r + 0.119192 * g + 0.9503041 * b) / 1.08883)
  return [116 * fy - 16, 500 * (fx - fy), 200 * (fy - fz)]
}

/** `hex` with its hue turned (greys stay grey) */
export const shiftHue = (hex: string, degrees: number): string => {
  const rgb = parseColor(hex)
  if (!rgb) return hex
  const [h, s, v] = rgbToHsb(rgb)
  return s <= 0 ? toHex(rgb) : toHex(hsbToRgb(h + degrees, s, v))
}

// ---- White / Black / Grays ---------------------------------------------------------------------

export interface Preserve { white: boolean, black: boolean, grays: boolean }
/** What Recolor leaves alone by default. */
export const DEFAULT_PRESERVE: Readonly<Preserve> = Object.freeze({ white: true, black: true, grays: false })

const NEUTRAL_EPS = 0.005 * 255

/** @returns the neutral a colour is, if any */
export const neutralOf = (c: Rgb): 'white' | 'black' | 'gray' | null => {
  const lo = Math.min(...c)
  const hi = Math.max(...c)
  if (lo >= 255 - NEUTRAL_EPS) return 'white'
  if (hi <= NEUTRAL_EPS) return 'black'
  return hi - lo <= NEUTRAL_EPS ? 'gray' : null
}

export const isPreserved = (hex: string, preserve: Preserve): boolean => {
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

/** Toward paper white: `t` = 1 is `c`, 0 is white. */
const tinted = (c: Rgb, t: number): Rgb => c.map((x) => 255 - (255 - x) * t) as Rgb

/** Toward black. */
const shaded = (c: Rgb, f: number): Rgb => c.map((x) => x * (1 - Math.min(1, Math.max(0, f)))) as Rgb

/** @returns how much ink each channel carries (1 − RGB) */
const ink = (c: Rgb): number[] => c.map((x) => 1 - x / 255)

const dot = (a: number[], b: number[]): number => a.reduce((s, x, i) => s + x * b[i], 0)

/** How much of `base`'s ink `c` carries, 0 (paper) … 1 (`base` or darker). */
const tintOf = (c: Rgb, base: Rgb): number => {
  const b = ink(base)
  const bb = dot(b, b)
  return bb <= 1e-9 ? 1 : Math.min(1, Math.max(0, dot(ink(c), b) / bb))
}

/** Whether `c` is a tint of `base` (its ink a fraction of `base`'s). */
const isTint = (c: Rgb, base: Rgb): boolean => {
  const t = tintOf(c, base)
  const [a, b] = [ink(c), ink(base)]
  return a.every((x, i) => Math.abs(x - b[i] * t) <= 0.01)
}

/**
 * The colour of `row` the new colour stands for: the most saturated for Hue Shift, the one of average
 * lightness for Tints and Shades, else the darkest.
 * @param row non-empty
 */
export const keyColor = (method: string, row: string[]): string => {
  const labs = row.map((hex) => ({ hex, lab: rgbToLab(parseColor(hex) as Rgb) }))
  const mean = labs.reduce((s, x) => s + x.lab[0], 0) / labs.length
  const chroma = (l: number[]): number => Math.hypot(l[1], l[2])
  const score = method === 'hueShift'
    ? (l: number[]): number => -chroma(l) * 1000 + l[0]
    : method === 'tintsShades'
      ? (l: number[]): number => Math.abs(l[0] - mean)
      : (l: number[]): number => l[0] * 1000 - chroma(l)
  return labs.reduce((best, x) => (score(x.lab) < score(best.lab) ? x : best)).hex
}

/**
 * The function that maps each colour of `row` to its new colour once the row takes `to`.
 * @param method one of {@link METHODS}
 * @param row current colours (`#rrggbb`), non-empty
 * @param to the row's new colour
 */
export const rowMap = (method: string, row: string[], to: string): { key: string, map: (hex: string) => string } => {
  const key = keyColor(method, row)
  const toRgb = parseColor(to) as Rgb
  const keyRgb = parseColor(key) as Rgb
  const mean = row.reduce((s, hex) => s + rgbToLab(parseColor(hex) as Rgb)[0], 0) / row.length
  const turn = rgbToHsb(toRgb)[0] - rgbToHsb(keyRgb)[0]
  const one = (c: Rgb): Rgb => {
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
  return { key, map: (hex) => toHex(one(parseColor(hex) as Rgb)) }
}

// ---- rows: preserve, reduce ---------------------------------------------------------------------

/**
 * Group `colors` into at most `n` rows of similar colours: k-means in Lab (lightness counting half, so tints
 * and shades of a hue stay together) weighted by `weights`, seeded with the heaviest colour and then
 * farthest-first, so the result is the same on every run. Rows are lists of indices into `colors`, ordered by
 * their first index.
 */
export const cluster = (colors: string[], weights: number[], n: number): number[][] => {
  const pts = colors.map((hex) => {
    const [l, a, b] = rgbToLab(parseColor(hex) as Rgb)
    return [l * 0.5, a, b]
  })
  if (!pts.length) return []
  const w = (i: number): number => Math.max(1e-6, weights[i] ?? 1)
  const d2 = (a: number[], b: number[]): number => (a[0] - b[0]) ** 2 + (a[1] - b[1]) ** 2 + (a[2] - b[2]) ** 2
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
  const nearest = (p: number[]): number =>
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
  const rows = centres.map((): number[] => [])
  of.forEach((c, i) => rows[c].push(i))
  return rows.filter((r) => r.length).sort((a, b) => a[0] - b[0])
}

/**
 * The rows of a colour list: preserved neutrals dropped, then (when `reduce` is smaller than the number of
 * colours left) clustered into `reduce` rows. Each colour is its own row otherwise. Rows keep the order of
 * `uses` (most used first).
 * @param options `reduce` 0 or missing keeps every colour
 */
export const buildRows = (uses: ColorUse[], { preserve = DEFAULT_PRESERVE, reduce = 0 }: { preserve?: Preserve, reduce?: number } = {}): Row[] => {
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
 * @param targets each row's new colour
 * @returns only the colours that change
 */
export const planMap = (rows: Row[], targets: string[], method: string): Map<string, string> => {
  const plan = new Map<string, string>()
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

/** A tone is [hue turn in degrees, saturation factor, brightness factor or 'c' for the contrasting one]. */
type Tone = [number, number, number | 'c']
const t = (turn: number): Tone => [turn, 1, 1]
const soft = (turn: number): Tone => [turn, 0.5, 1]
const deep = (turn: number): Tone => [turn, 1, 0.6]
const hc = (turn: number): Tone => [turn, 1, 'c']
const sv = (turn: number, s: number, b: number): Tone => [turn, s, b]

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

/** The brightness that contrasts with `v`. */
const contrast = (v: number): number => (v >= 0.5 ? v * 0.3 : 0.7 + 0.3 * v)

/**
 * The colours of a harmony rule built from `base`, `base` itself first.
 * @param rule an id of {@link HARMONIES}
 * @param base `#rrggbb`
 */
export const harmonyColors = (rule: string, base: string): string[] => {
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

const styleValue = (el: Element, prop: string): string | null => {
  const m = new RegExp(`(?:^|;)\\s*${prop}\\s*:\\s*([^;]+)`, 'i').exec(el.getAttribute('style') || '')
  return m ? m[1].trim() : null
}

/** Where an element keeps a property: its attribute and/or its `style`. */
interface Slot { el: Element, prop: string, where: 'attr' | 'style', value: string }

const slotsOf = (el: Element, prop: string): Slot[] => {
  const out: Slot[] = []
  const attr = el.getAttribute(prop)
  if (attr !== null) out.push({ el, prop, where: 'attr', value: attr.trim() })
  const style = styleValue(el, prop)
  if (style !== null) out.push({ el, prop, where: 'style', value: style })
  return out
}

const writeSlot = ({ el, prop, where }: Pick<Slot, 'el' | 'prop' | 'where'>, value: string): void => {
  if (where === 'attr') {
    el.setAttribute(prop, value)
    return
  }
  const re = new RegExp(`((?:^|;)\\s*${prop}\\s*:\\s*)[^;]+`, 'i')
  el.setAttribute('style', (el.getAttribute('style') || '').replace(re, `$1${value}`))
}

/** The selection and everything inside it that paints. */
const paintedElements = (roots: Element[]): Set<Element> => {
  const out = new Set<Element>()
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
 */
interface Server { kind: 'gradient' | 'filter', id: string, node: Element, slot: Slot }

const serversOf = (scope: ParentNode, els: Set<Element>): Server[] => {
  const out: Server[] = []
  const refs: Array<[string, 'gradient' | 'filter', RegExp]> = [
    ['fill', 'gradient', /^(linear|radial)Gradient$/], ['stroke', 'gradient', /^(linear|radial)Gradient$/],
    ['filter', 'filter', /^filter$/]
  ]
  for (const el of els) {
    for (const [prop, kind, re] of refs) {
      for (const slot of slotsOf(el, prop)) {
        const id = urlId(slot.value)
        const node = id ? findById(scope, id) : null
        if (id && node && re.test(node.tagName)) out.push({ kind, id, node, slot })
      }
    }
  }
  return out
}

const hrefId = (el: Element): string | null => {
  const v = el.getAttribute('href') ?? el.getAttribute('xlink:href')
  return v && v.startsWith('#') ? v.slice(1) : null
}

/**
 * Whether anything outside `els` uses the gradient or filter `id` (a paint, a `filter`, a gradient that
 * inherits from it).
 */
const usedOutside = (scope: ParentNode, els: Set<Element>, id: string): boolean => {
  for (const other of scope.querySelectorAll('*')) {
    if (els.has(other) || other.hasAttribute('data-se-ephemeral')) continue
    if (/gradient$/i.test(other.tagName) && hrefId(other) === id) return true
    for (const prop of ['fill', 'stroke', 'filter']) {
      if (slotsOf(other, prop).some((s) => urlId(s.value) === id)) return true
    }
  }
  return false
}

/** A colour slot and the colour it holds, normalised. */
interface Colored { slot: Slot, hex: string }

/**
 * The colour slots of a gradient (its stops) or filter (its flood colours). With `own` the gradient first
 * takes the stops it inherits.
 */
const serverSlots = (scope: ParentNode, node: Element, own: boolean): Colored[] => {
  const targets: Array<[Element, string]> = /gradient$/i.test(node.tagName)
    ? (own ? ownStops(scope, node) : readStops(scope, node).map((s) => s.node)).map((stop) => [stop, 'stop-color'])
    : [...node.querySelectorAll('feFlood, feDropShadow')].map((fe) => [fe, 'flood-color'])
  return slotted(targets)
}

const slotted = (targets: Array<[Element, string]>): Colored[] => {
  const out: Colored[] = []
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
 * @param owns copy a gradient's inherited stops onto it when one of its colours matches
 */
const colorSlots = (scope: ParentNode, els: Set<Element>, owns?: (hex: string) => boolean): Colored[] => {
  const out = slotted([...els].flatMap((el): Array<[Element, string]> => [[el, 'fill'], [el, 'stroke']]))
  const seen = new Set<Element>()
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
 */
const copyShared = (scope: ParentNode, els: Set<Element>, changes: (hex: string) => boolean, nextId: () => string): void => {
  const copies = new Map<string, Element>()
  for (const ref of serversOf(scope, els)) {
    if (!copies.has(ref.id) && serverSlots(scope, ref.node, false).some((s) => changes(s.hex)) && usedOutside(scope, els, ref.id)) {
      const copy = ref.node.cloneNode(true) as Element
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
 * @param scope the drawing
 * @param roots the selected elements
 */
export const collectColors = (scope: ParentNode, roots: Element[]): ColorUse[] => {
  const counts = new Map<string, number>()
  for (const { hex } of colorSlots(scope, paintedElements(roots))) counts.set(hex, (counts.get(hex) ?? 0) + 1)
  return [...counts.entries()].map(([hex, count]) => ({ hex, count })).sort((a, b) => b.count - a.count)
}

/**
 * Rewrite colours of the selection: every slot whose colour is a key of `map` takes the mapped colour.
 * Gradients and filters something outside the selection also uses are copied first. Call it inside
 * `svgCanvas.transact`.
 * @param map old → new `#rrggbb`
 * @returns the number of colours written
 */
export const applyColors = (scope: ParentNode, roots: Element[], map: Map<string, string>, nextId: () => string): number => {
  const els = paintedElements(roots)
  const changes = (hex: string): boolean => map.has(hex) && map.get(hex) !== hex
  copyShared(scope, els, changes, nextId)
  let n = 0
  for (const { slot, hex } of colorSlots(scope, els, changes)) {
    if (changes(hex)) {
      writeSlot(slot, map.get(hex) as string)
      n++
    }
  }
  return n
}
