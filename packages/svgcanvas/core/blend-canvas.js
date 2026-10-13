// @ts-check
/**
 * Blends on the canvas: the group, its keys and generated steps, and the canvas API. The geometry and the paint
 * interpolation are in `blend.js`.
 *
 * A blend is a group, so it renders the same anywhere:
 *
 *   <g id="…" se:blend="blend(mode=steps,steps=5,distance=20)">
 *     <path id="keyA" se:blend-key="1" …/>           a key shape, as drawn (it keeps its id and its transform)
 *     <g se:blend-steps="1"> <path/>… </g>           the generated steps between the keys on either side
 *     <path id="keyB" se:blend-key="1" …/>
 *     <g se:blend-steps="1"> … </g>                  (more keys: key, steps, key, steps, key, …)
 *     <path id="keyC" se:blend-key="1" …/>
 *   </g>
 *
 * A blend can have a spine, a path the steps ride along instead of the straight line between the keys. It is kept on the
 * group as `se:blend-spine="<path data>"` (in the group's coordinates, the keys' too): the keys sit on it evenly spread by
 * arc length, and each step's centre is the point of the spine at its share of the length between its two keys. Replace
 * Spine takes a path (selected with the blend) and moves the keys onto it; Reverse Spine runs the keys the other way;
 * Detach Spine gives the path back and the blend goes straight again.
 *
 * The spine is pinned to the keys: `se:blend-pins="0,3,7"` lists, for each key in order, the index of the spine's anchor that
 * sits under it. Replace Spine puts an anchor under each key (splitting segments where there is none), and from then on the
 * keys *hold* the spine: a key that moved or changed size drags its anchor (handles with it) to its new centre, and the
 * steps ride the reshaped spine; a key sits at the arc length of its anchor, not at an even share. A spine without pins (a
 * closed one, one from before pins, one with pins that no longer fit the keys) is not held and spreads the keys evenly.
 *
 * With `se:blend-align="1"` (needs a spine) the shapes turn to the spine's direction: the first key is the reference
 * and keeps its orientation; every other key is turned by how much the spine has turned since the first key's stop (they
 * are the user's elements, turned as a rotation would; switching the option off turns them back), and a generated step
 * is the blend of the keys *as they were drawn*, turned to the direction of the spine at its point.
 *
 * The steps are a pure function of the keys, the spine and the options, so they are not recorded in history when a key is
 * edited: `refreshBlend` (run on every change of a key) regenerates them, and an undo of the key edit does the same
 * (the art brush and ext-mirror precedent). Making, changing the options of, expanding and releasing a blend are
 * undoable steps (`transact`). Regeneration compares what it would write with what is there and leaves the steps
 * alone when they already match, so it is safe to run any time (also on a drawing just loaded).
 *
 * @module blend-canvas
 * @license MIT
 */

import { NS } from './namespaces.js'
import { getPathDFromElement } from './path-utils.js'
import { parseAnchors, anchorsToD, anchorBBox, sameAnchorGeometry } from './anchor-path.js'
import { registerAttrValidator } from './drawing-invariants.js'
import { localMatrix, applyMatrix } from './art-brush-canvas.js'
import { tracksOf, frameAt } from './art-brush.js'
import { getTransformList, matrixMultiply } from './math.js'
import { BLEND_STYLE_ATTRS, MAX_STEPS, pairPaths, pathAt, lerpStyle, stepCount, reverseSubpath, spineStops, centreOn, rotateSubpaths, pinSpine, reversePins } from './blend.js'

export const BLEND_ATTR = 'se:blend'
export const KEY_ATTR = 'se:blend-key'
export const STEPS_ATTR = 'se:blend-steps'
export const SPINE_ATTR = 'se:blend-spine'
export const ALIGN_ATTR = 'se:blend-align'
export const PINS_ATTR = 'se:blend-pins'

/** Shapes that can be a key (they have a path form). */
const SHAPES = new Set(['path', 'line', 'polyline', 'polygon', 'rect', 'ellipse', 'circle'])
const MODES = ['steps', 'distance', 'smooth']

/** @typedef {import('./blend.js').BlendSpacing} BlendSpacing */

/**
 * The inverse of an affine matrix (null stays null: no transform).
 * @param {?{a: number, b: number, c: number, d: number, e: number, f: number}} m
 * @returns {?{a: number, b: number, c: number, d: number, e: number, f: number}}
 */
const inverse = (m) => {
  if (!m) return null
  const det = m.a * m.d - m.b * m.c
  if (Math.abs(det) < 1e-12) return null
  return {
    a: m.d / det,
    b: -m.b / det,
    c: -m.c / det,
    d: m.a / det,
    e: (m.c * m.f - m.d * m.e) / det,
    f: (m.b * m.e - m.a * m.f) / det
  }
}

/** @type {(v: number, lo: number, hi: number) => number} */
const clamp = (v, lo, hi) => Math.min(hi, Math.max(lo, v))

// ---------------------------------------------------------------------------
// The `se:blend` attribute: `blend(key=value,…)`
// ---------------------------------------------------------------------------

export const BLEND_DEFAULTS = Object.freeze({ mode: 'steps', steps: 5, distance: 20 })

/**
 * Options checked against their ranges and defaults.
 * @param {Object<string, any>} [raw]
 * @returns {BlendSpacing}
 */
export const sanitizeBlendOptions = (raw = {}) => {
  /** @type {(v: any, def: number, lo: number, hi: number) => number} */
  const num = (v, def, lo, hi) => (Number.isFinite(Number(v)) && v !== '' && v != null ? clamp(Number(v), lo, hi) : def)
  return {
    mode: MODES.includes(raw.mode) ? raw.mode : BLEND_DEFAULTS.mode,
    steps: Math.round(num(raw.steps, BLEND_DEFAULTS.steps, 1, MAX_STEPS)),
    distance: num(raw.distance, BLEND_DEFAULTS.distance, 0.1, 100000)
  }
}

/**
 * @param {?string} str
 * @returns {?BlendSpacing} null when it is not a blend value
 */
export const parseBlend = (str) => {
  const m = /^\s*blend\s*\(([^()]*)\)\s*$/.exec(str ?? '')
  if (!m) return null
  /** @type {Record<string, string>} */
  const raw = {}
  for (const pair of m[1].split(',')) {
    const eq = pair.indexOf('=')
    if (eq > 0) raw[pair.slice(0, eq).trim()] = pair.slice(eq + 1).trim()
  }
  return sanitizeBlendOptions(raw)
}

/**
 * @param {Object<string, any>} [opts]
 * @returns {string}
 */
export const formatBlend = (opts = {}) => {
  const o = sanitizeBlendOptions(opts)
  return `blend(mode=${o.mode},steps=${o.steps},distance=${o.distance})`
}

// ---------------------------------------------------------------------------
// The spine
// ---------------------------------------------------------------------------

/** @typedef {import('./art-brush.js').Track} Track */
/** @typedef {import('./anchor-path.js').Pt} Pt */

/** @typedef {{d: string, track: Track, sub: import('./anchor-path.js').SubPath}} Spine */

/**
 * The first subpath of path data as a spine: its path data (as stored), the polyline to measure and walk it by, and its
 * anchors.
 * @param {?string} d
 * @returns {?Spine} null when it has no drawable first subpath
 */
export const parseSpine = (d) => {
  if (!d) return null
  const [first] = parseAnchors(d, 0.1)
  if (!first || first.anchors.length < 2) return null
  const [track] = tracksOf(anchorsToD([first]))
  return track && track.length > 1e-9 ? { d: anchorsToD([first]), track, sub: first } : null
}

/**
 * The pins in an `se:blend-pins` value that fit a spine and keys: whole numbers, increasing, each an anchor of the spine.
 * @param {?string} str
 * @param {number} anchors how many anchors the spine has
 * @param {number} [keys] how many keys the blend has (not checked when unknown)
 * @returns {?number[]}
 */
export const parsePins = (str, anchors, keys) => {
  if (!str || !/^\d+(,\d+)*$/.test(str.trim())) return null
  const pins = str.trim().split(',').map(Number)
  if (keys !== undefined && pins.length !== keys) return null
  return pins.every((v, i) => v < anchors && (i === 0 || v > pins[i - 1])) ? pins : null
}

/**
 * Where the keys of a blend sit on its spine: arc length and point for each. Held by their anchors when the blend has
 * valid pins on an open spine, else evenly spread by arc length.
 * @param {Element} group
 * @param {Spine} spine
 * @param {number} keys
 * @returns {{pins: ?number[], stops: number[], points: Pt[]}}
 */
const layoutOf = (group, spine, keys) => {
  const pins = spine.sub.closed ? null : parsePins(group.getAttribute(PINS_ATTR), spine.sub.anchors.length, keys)
  if (pins) {
    const stops = pins.map((k) => (k === 0 ? 0 : (tracksOf(anchorsToD([{ closed: false, anchors: spine.sub.anchors.slice(0, k + 1) }]))[0]?.length ?? 0)))
    return { pins, stops, points: pins.map((k) => spine.sub.anchors[k].p) }
  }
  const stops = spineStops(spine.track.length, keys)
  return { pins: null, stops, points: stops.map((s) => frameAt(spine.track, s).p) }
}

// ---------------------------------------------------------------------------
// A blend group
// ---------------------------------------------------------------------------

/**
 * @param {?Element} group
 * @returns {?{group: Element, keys: Element[], gaps: Element[]}} null when it is not a complete blend: keys and
 *   step groups alternate, key first and last, with at least two keys
 */
export const blendParts = (group) => {
  if (!group || group.tagName !== 'g' || !group.hasAttribute(BLEND_ATTR)) return null
  const kids = [...group.children]
  if (kids.length < 3 || kids.length % 2 === 0) return null
  const keys = kids.filter((_, i) => i % 2 === 0)
  const gaps = kids.filter((_, i) => i % 2 === 1)
  if (!keys.every((k) => k.hasAttribute(KEY_ATTR)) || !gaps.every((g) => g.tagName === 'g' && g.hasAttribute(STEPS_ATTR))) return null
  return { group, keys, gaps }
}

/**
 * The blend `elem` is, or a key of.
 * @param {?Element} elem
 * @returns {?Element}
 */
export const blendGroupOf = (elem) => {
  if (!elem) return null
  const group = elem.hasAttribute?.(KEY_ATTR) ? elem.parentNode : elem
  return blendParts(/** @type {Element} */ (group)) ? /** @type {Element} */ (group) : null
}

/** @type {(doc: Document, tag: string) => Element} */
const svgNS = (doc, tag) => doc.createElementNS(NS.SVG, tag)

/** @param {Element} key @returns {import('./anchor-path.js').SubPath[]} the key's path in its parent's coordinates */
const keyGeometry = (key) => {
  const d = getPathDFromElement(key)
  return d ? parseAnchors(applyMatrix(d, localMatrix(key)), 0.1) : []
}

/** @param {Element} key @returns {Object<string, string>} */
const keyStyle = (key) => {
  /** @type {Object<string, string>} */
  const out = {}
  for (const name of BLEND_STYLE_ATTRS) if (key.hasAttribute(name)) out[name] = /** @type {string} */ (key.getAttribute(name))
  return out
}

/**
 * @typedef {object} Rail the stretch of a spine between two keys
 * @property {Track} track
 * @property {number} from arc length of the first key
 * @property {number} to arc length of the second
 * @property {boolean} [align] the shapes turn to the direction of the spine
 * @property {number} [base] the direction of the spine at the first key (what the shapes are turned from)
 */

/**
 * Direction of a spine at arc length `s`, in radians.
 * @param {Track} track
 * @param {number} s
 * @returns {number}
 */
const angleAt = (track, s) => {
  const { t } = frameAt(track, s)
  return Math.atan2(t.y, t.x)
}

/**
 * The steps between two keys.
 * @param {Element} a
 * @param {Element} b
 * @param {BlendSpacing} spacing
 * @param {?Rail} [rail] the spine between them, else the straight line
 * @returns {Array<{d: string, attrs: Object<string, string>}>}
 */
const stepsBetween = (a, b, spacing, rail = null) => {
  let ga = keyGeometry(a)
  let gb = keyGeometry(b)
  if (!ga.length || !gb.length) return []
  // Aligned keys were turned when the option was switched on: the steps are made from the keys as they were drawn.
  const base = rail?.align ? (rail.base ?? 0) : 0
  if (rail?.align) {
    ga = rotateSubpaths(ga, base - angleAt(rail.track, rail.from))
    gb = rotateSubpaths(gb, base - angleAt(rail.track, rail.to))
  }
  const boxA = anchorBBox(ga)
  const boxB = anchorBBox(gb)
  const sa = keyStyle(a)
  const sb = keyStyle(b)
  /** @param {{x: number, y: number, width: number, height: number}} box */
  const centre = (box) => ({ x: box.x + box.width / 2, y: box.y + box.height / 2 })
  const ca = centre(boxA)
  const cb = centre(boxB)
  const n = stepCount(
    spacing,
    { fill: sa.fill ?? 'black', stroke: sa.stroke ?? null, box: boxA },
    { fill: sb.fill ?? 'black', stroke: sb.stroke ?? null, box: boxB },
    rail ? Math.abs(rail.to - rail.from) : Math.hypot(cb.x - ca.x, cb.y - ca.y)
  )
  const pair = pairPaths(ga, gb)
  return Array.from({ length: n }, (_, i) => {
    const t = (i + 1) / (n + 1)
    let shape = pathAt(pair, t)
    // On a spine each step is centred on its point of it.
    if (rail) {
      const at = rail.from + (rail.to - rail.from) * t
      if (rail.align) shape = rotateSubpaths(shape, angleAt(rail.track, at) - base)
      shape = centreOn(shape, frameAt(rail.track, at).p)
    }
    return { d: anchorsToD(shape), attrs: lerpStyle(sa, sb, t) }
  })
}

/**
 * Whether the paths in `container` are these steps (within the saver's rounding, which adds up along a long path).
 */
/** @type {(container: Element, steps: any[]) => boolean} */
const sameSteps = (container, steps) => {
  const kids = [...container.children]
  if (kids.length !== steps.length) return false
  return kids.every((el, i) => {
    const want = steps[i]
    const have = parseAnchors(el.getAttribute('d') ?? '', 0.1)
    const wanted = parseAnchors(want.d, 0.1)
    const count = wanted.reduce((n, sp) => n + sp.anchors.length, 0)
    if (!sameAnchorGeometry(have, wanted, 0.1 + 0.01 * Math.sqrt(count))) return false
    // Only the interpolated attributes count: the loader adds others (`style="pointer-events: inherit;"`).
    return BLEND_STYLE_ATTRS.every((n) => (el.getAttribute(n) ?? null) === (want.attrs[n] ?? null))
  })
}

/** What the steps of a gap are made from: both keys (shape, transform, paint), the spacing and the spine stretch. */
/** @type {(a: Element, b: Element, spacing: any, spine: ?string, rail: ?Rail) => string} */
const signature = (a, b, spacing, spine, rail) => {
  /** @param {Element} el */
  const key = (el) => `${getPathDFromElement(el)}~${el.getAttribute('transform') ?? ''}~${JSON.stringify(keyStyle(el))}`
  const along = rail ? `${spine}@${rail.from.toFixed(3)},${rail.to.toFixed(3)}${rail.align ? 'a' : ''}` : ''
  return `${key(a)}|${key(b)}|${spacing.mode},${spacing.steps},${spacing.distance}|${along}`
}

/**
 * @type {WeakMap<Element, string>} what a generated step was made from (the gap's signature). Kept on the steps,
 * not the gap, so that steps an undo put back still say what they belong to.
 */
const madeFrom = new WeakMap()
/**
 * @type {WeakMap<Element, Map<string, Element[]>>} the steps a gap had for the keys it had before, so that going
 * back to them (an undo, a redo) puts the very same paths back instead of rewriting them
 */
const earlier = new WeakMap()
const KEEP_EARLIER = 4

/** @param {any} canvas */
export const init = (canvas) => {
  const svgCanvas = canvas

  registerAttrValidator(BLEND_ATTR, (value) => (parseBlend(value) ? true : 'is not blend(…)'))
  registerAttrValidator(SPINE_ATTR, (value) => (parseSpine(value) ? true : 'is not usable path data'))
  registerAttrValidator(PINS_ATTR, (value, el) => {
    const spine = parseSpine(el?.getAttribute(SPINE_ATTR) ?? null)
    if (!spine) return 'is on a blend that has no spine'
    const keys = el ? blendParts(el)?.keys.length : undefined
    return parsePins(value, spine.sub.anchors.length, keys) ? true : 'does not fit the spine and its keys'
  })
  registerAttrValidator(ALIGN_ATTR, (value, el) => {
    if (value !== '1') return 'is not 1'
    return parseSpine(el?.getAttribute(SPINE_ATTR) ?? null) ? true : 'is on a blend that has no spine'
  })

  const getSelected = () => svgCanvas.getSelectedElements().filter(Boolean)
  const newId = () => svgCanvas.getNextId()

  /** What new blends start with (the Blend tool's options bar). */
  let defaults = sanitizeBlendOptions()
  const getBlendDefaults = () => ({ ...defaults })
  /** @param {Record<string, any>} changes */
  const setBlendDefaults = (changes) => {
    defaults = sanitizeBlendOptions({ ...defaults, ...changes })
    return getBlendDefaults()
  }

  /**
   * Regenerate the steps between two keys. No history.
   * @param {Element} gap
   * @param {Element} a
   * @param {Element} b
   * @param {BlendSpacing} spacing
   * @param {?string} [spine] the blend's spine path data
   * @param {?Rail} [rail] the stretch of the spine between the keys
   * @returns {boolean} whether the steps were rewritten
   */
  const regenerateGap = (gap, a, b, spacing, spine = null, rail = null) => {
    const sig = signature(a, b, spacing, spine, rail)
    const kids = [...gap.children]
    const was = kids.length ? madeFrom.get(kids[0]) : undefined
    if (was === sig) return false
    /** @param {Element[]} nodes */
    const mark = (nodes) => nodes.forEach((n) => madeFrom.set(n, sig))
    const kept = earlier.get(gap) ?? new Map()
    earlier.set(gap, kept)
    const back = kept.get(sig)
    if (back) {
      if (was !== undefined) kept.set(was, kids)
      kept.delete(sig)
      gap.replaceChildren(...back)
      return true
    }
    const steps = stepsBetween(a, b, spacing, rail)
    // A drawing just loaded has no record of what its steps were made from: when they are what the keys give, leave them be.
    if (was === undefined && sameSteps(gap, steps)) {
      mark(kids)
      return false
    }
    if (was !== undefined) {
      kept.delete(was)
      kept.set(was, kids)
      if (kept.size > KEEP_EARLIER) kept.delete(/** @type {string} */ (kept.keys().next().value))
    }
    const ids = kids.map((c) => c.getAttribute('id'))
    gap.replaceChildren()
    steps.forEach((s, j) => {
      const el = svgNS(gap.ownerDocument, 'path')
      el.setAttribute('id', ids[j] || newId())
      el.setAttribute('d', s.d)
      for (const [k, v] of Object.entries(s.attrs)) el.setAttribute(k, v)
      gap.append(el)
    })
    mark([...gap.children])
    return true
  }

  /**
   * Keep a pinned spine under its keys: an anchor whose key's centre has moved goes after it (its handles with it). Not
   * recorded in history: the spine under the keys is as much a function of them as the steps are, so an undo of the key
   * edit puts it back the same way. Moves smaller than a saved drawing's rounding are left alone.
   * @param {Element} group
   * @param {Spine} spine
   * @param {Element[]} keys
   * @returns {?Spine} the spine as it now is, null when nothing moved
   */
  const holdSpine = (group, spine, keys) => {
    const { pins } = layoutOf(group, spine, keys.length)
    if (!pins) return null
    const sub = { closed: false, anchors: spine.sub.anchors.map((a) => ({ p: { ...a.p }, hIn: { ...a.hIn }, hOut: { ...a.hOut } })) }
    let moved = false
    keys.forEach((key, i) => {
      const geometry = keyGeometry(key)
      if (!geometry.length) return
      const box = anchorBBox(geometry)
      const a = sub.anchors[pins[i]]
      const dx = box.x + box.width / 2 - a.p.x
      const dy = box.y + box.height / 2 - a.p.y
      if (Math.hypot(dx, dy) < 0.05) return
      for (const pt of [a.p, a.hIn, a.hOut]) {
        pt.x += dx
        pt.y += dy
      }
      moved = true
    })
    if (!moved) return null
    const held = parseSpine(anchorsToD([sub]))
    if (!held) return null
    group.setAttribute(SPINE_ATTR, held.d)
    return held
  }

  /**
   * Regenerate the steps of a blend from its keys. No history.
   * @param {Element} group
   * @returns {boolean} whether any steps were rewritten
   */
  const regenerate = (group) => {
    const p = blendParts(group)
    if (!p) return false
    const spacing = /** @type {BlendSpacing} */ (parseBlend(group.getAttribute(BLEND_ATTR)))
    let spine = parseSpine(group.getAttribute(SPINE_ATTR))
    if (spine) spine = holdSpine(group, spine, p.keys) ?? spine
    const { stops } = spine ? layoutOf(group, spine, p.keys.length) : { stops: [] }
    const align = !!spine && group.getAttribute(ALIGN_ATTR) === '1'
    const base = spine ? angleAt(spine.track, stops[0]) : 0
    let rewritten = false
    p.gaps.forEach((gap, i) => {
      const rail = spine ? { track: spine.track, from: stops[i], to: stops[i + 1], align, base } : null
      if (regenerateGap(gap, p.keys[i], p.keys[i + 1], spacing, spine?.d ?? null, rail)) rewritten = true
    })
    return rewritten
  }

  /**
   * Keep the steps of a blend in step with its keys: call it when an element changed (it does nothing for anything
   * but a key or a blend). Not undoable by itself; the change that caused it is.
   * @param {?Element} elem
   * @returns {boolean}
   */
  const refreshBlend = (elem) => {
    const group = blendGroupOf(elem)
    // A blend that left the drawing (an undone insertion reaches here) is left as it is: its keys cannot be measured.
    return group?.isConnected ? regenerate(group) : false
  }

  /**
   * Whether `elem` can be a key: a path or basic shape that is not already part of a blend or a brushed group.
   * @param {?Element} elem
   * @returns {boolean}
   */
  const isKeyCandidate = (elem) => {
    if (!elem || !SHAPES.has(elem.tagName) || elem.getAttribute('display') === 'none') return false
    const parent = /** @type {?Element} */ (elem.parentNode)
    if (!parent || parent.hasAttribute?.(BLEND_ATTR) || parent.hasAttribute?.('se:art-brush')) return false
    return !!getPathDFromElement(elem)
  }

  /** The blend and the new keys of a selection, or null when it makes no blend. */
  /** @param {Element[]} elems */
  const plan = (elems) => {
    const blends = elems.filter((/** @type {Element} */ e) => blendParts(e))
    const shapes = elems.filter(isKeyCandidate)
    if (blends.length > 1 || blends.length + shapes.length !== elems.length) return null
    const [blend] = blends
    const parent = (blend ?? shapes[0])?.parentNode
    if (!parent || !shapes.every((/** @type {Element} */ s) => s.parentNode === parent)) return null
    if (blend ? shapes.length < 1 : shapes.length < 2) return null
    shapes.sort((/** @type {Element} */ x, /** @type {Element} */ y) => (x.compareDocumentPosition(y) & Node.DOCUMENT_POSITION_FOLLOWING ? -1 : 1))
    return { blend: blend ?? null, shapes, parent }
  }

  /**
   * Whether the elements (the selection by default) make a blend: two or more shapes that share a parent, or one
   * blend and shapes to add to it as more keys.
   * @param {Element[]} [elems]
   * @returns {boolean}
   */
  const canBlend = (elems = getSelected()) => !!plan(elems)

  /** @param {Document} doc */
  const newSteps = (doc) => {
    const g = svgNS(doc, 'g')
    g.setAttribute('id', newId())
    g.setAttribute(STEPS_ATTR, '1') // not empty: the saver drops empty attributes
    return g
  }

  /**
   * Blend the elements (the selection by default): the shapes become the keys of a new blend, in stacking order, or
   * more keys at the end of the blend among them (one undo step).
   * @param {Element[]} [elems]
   * @param {Object<string, any>} [options] spacing of a new blend (default: the Blend tool's)
   * @returns {?Element} the blend group, or null when the elements make no blend
   */
  const makeBlend = (elems = getSelected(), options) => {
    const p = plan(elems)
    if (!p) return null
    const doc = /** @type {Document} */ (p.parent.ownerDocument)
    const group = svgCanvas.transact('Blend', () => {
      let g = p.blend
      if (!g) {
        g = svgNS(doc, 'g')
        g.setAttribute('id', newId())
        g.setAttribute(BLEND_ATTR, formatBlend({ ...defaults, ...options }))
        p.shapes[0].before(g)
      }
      g.removeAttribute(PINS_ATTR) // a key more than the pins were made for: the spine spreads them evenly again
      for (const key of p.shapes) {
        key.setAttribute(KEY_ATTR, '1')
        if (g.children.length) g.append(newSteps(doc))
        g.append(key)
      }
      regenerate(g)
      return g
    })
    svgCanvas.selectOnly([group], true)
    svgCanvas.call('changed', [group])
    return group
  }

  /**
   * The blend options of an element (the selection's by default): null when it is not part of a blend.
   * @param {Element} [elem]
   * @returns {?BlendSpacing}
   */
  const getBlend = (elem = getSelected()[0]) => {
    const group = blendGroupOf(elem)
    return group ? parseBlend(group.getAttribute(BLEND_ATTR)) : null
  }

  /**
   * Change the options of blends (the selected ones by default; one undo step); the steps are regenerated.
   * @param {Object<string, any>} changes e.g. `{mode: 'steps', steps: 8}`
   * @param {Element[]} [elems]
   * @returns {Element[]} the blends changed
   */
  const setBlendOptions = (changes, elems = getSelected()) => {
    const groups = /** @type {Element[]} */ ([...new Set(elems.map(blendGroupOf).filter(Boolean))])
    if (!groups.length) return []
    svgCanvas.transact('Blend options', () => {
      for (const g of groups) {
        g.setAttribute(BLEND_ATTR, formatBlend({ ...parseBlend(g.getAttribute(BLEND_ATTR)), ...changes }))
        regenerate(g)
      }
    })
    svgCanvas.call('changed', groups)
    return groups
  }

  // --- the spine -------------------------------------------------------

  /**
   * The blend and the path of a selection that can replace its spine: one blend and one shape of the same parent.
   * @param {Element[]} elems
   * @returns {?{group: Element, path: Element, spine: NonNullable<ReturnType<typeof parseSpine>>}}
   */
  const spinePlan = (elems) => {
    const blends = elems.filter((e) => blendParts(e))
    const others = elems.filter((e) => !blendParts(e))
    if (blends.length !== 1 || others.length !== 1) return null
    const [group] = blends
    const [path] = others
    if (path.parentNode !== group.parentNode || !SHAPES.has(path.tagName)) return null
    const d = getPathDFromElement(path)
    if (!d) return null
    // The path's own coordinates → the parent's → the group's (the keys' too).
    const inGroup = applyMatrix(applyMatrix(d, localMatrix(path)), inverse(localMatrix(group)))
    const spine = parseSpine(inGroup)
    return spine ? { group, path, spine } : null
  }

  /**
   * Whether the elements (the selection by default) are a blend and a path that can become its spine.
   * @param {Element[]} [elems]
   * @returns {boolean}
   */
  const canReplaceBlendSpine = (elems = getSelected()) => !!spinePlan(elems)

  /**
   * The spine of a blend (path data in the group's coordinates), or null when it goes straight.
   * @param {Element} [elem] the blend or one of its keys (the selection's first by default)
   * @returns {?string}
   */
  const getBlendSpine = (elem = getSelected()[0]) => parseSpine(blendGroupOf(elem)?.getAttribute(SPINE_ATTR) ?? null)?.d ?? null

  /**
   * Apply `step` (a transform in the group's coordinates) to `key` after its own, as one transform: a plain move is folded
   * into the shape as any move is, anything with a turn in it stays a single matrix (so that turning a key back leaves
   * no pile of them behind).
   * @param {Element} key
   * @param {SVGTransform} step
   */
  const transformKey = (key, step) => {
    const list = getTransformList(key)
    if (!list) return
    const own = localMatrix(key)
    const product = own ? matrixMultiply(step.matrix, /** @type {any} */ (own)) : step.matrix
    // Rounded: a turn by a quarter would otherwise be written with a 6e-17 for its zeros.
    const m = svgCanvas.getSvgRoot().createSVGMatrix()
    for (const prop of /** @type {const} */ (['a', 'b', 'c', 'd', 'e', 'f'])) m[prop] = Math.round(product[prop] * 1e6) / 1e6 + 0
    const near = (/** @type {number} */ x, /** @type {number} */ y) => Math.abs(x - y) < 1e-9
    const moveOnly = near(m.a, 1) && near(m.d, 1) && near(m.b, 0) && near(m.c, 0)
    const all = svgCanvas.getSvgRoot().createSVGTransform()
    if (moveOnly) all.setTranslate(m.e, m.f)
    else all.setMatrix(m)
    list.clear()
    if (!moveOnly || !near(m.e, 0) || !near(m.f, 0)) list.appendItem(all)
    if (moveOnly) svgCanvas.recalculateDimensions(key)
  }

  /**
   * Move `key` so that the centre of its box is at `to` (the group's coordinates), as a move would.
   * @param {Element} key
   * @param {{x: number, y: number}} to
   */
  const moveKeyTo = (key, to) => {
    const box = anchorBBox(keyGeometry(key))
    const dx = to.x - (box.x + box.width / 2)
    const dy = to.y - (box.y + box.height / 2)
    if (Math.abs(dx) < 1e-9 && Math.abs(dy) < 1e-9) return
    const move = svgCanvas.getSvgRoot().createSVGTransform()
    move.setTranslate(dx, dy)
    transformKey(key, move)
  }

  /**
   * Put the keys of a blend on its spine: on their anchors when it is pinned, else evenly spread by arc length.
   * @param {Element} group
   * @param {Spine} spine
   */
  const placeKeys = (group, spine) => {
    const p = /** @type {NonNullable<ReturnType<typeof blendParts>>} */ (blendParts(group))
    const { points } = layoutOf(group, spine, p.keys.length)
    p.keys.forEach((key, i) => moveKeyTo(key, points[i]))
  }

  /** @param {Element} group @returns {boolean} whether the shapes of the blend are turned to its spine */
  const isAligned = (group) => group.getAttribute(ALIGN_ATTR) === '1'

  /**
   * Turn every key but the first by how far the spine has turned since the first key's stop (`direction` -1 turns them back).
   * Each key keeps the centre of its box.
   * @param {Element} group
   * @param {Spine} spine
   * @param {1|-1} direction
   */
  const turnKeys = (group, spine, direction) => {
    const p = /** @type {NonNullable<ReturnType<typeof blendParts>>} */ (blendParts(group))
    const { stops } = layoutOf(group, spine, p.keys.length)
    const { track } = spine
    const base = angleAt(track, stops[0])
    p.keys.forEach((key, i) => {
      const turn = (angleAt(track, stops[i]) - base) * direction
      if (i === 0 || Math.abs(turn) < 1e-9) return
      const box = anchorBBox(keyGeometry(key))
      const centre = { x: box.x + box.width / 2, y: box.y + box.height / 2 }
      const rotate = svgCanvas.getSvgRoot().createSVGTransform()
      rotate.setRotate((turn * 180) / Math.PI, centre.x, centre.y)
      transformKey(key, rotate)
      moveKeyTo(key, centre)
    })
  }

  /**
   * Put a blend on a (new) spine: its keys are unturned from the old one, the spine gets an anchor under each key (unless
   * `pins` say which anchors already are), the keys are placed on those and turned to the new direction.
   * @param {Element} group
   * @param {Spine} spine
   * @param {?number[]} [pins] pins that fit `spine` (a reversed pinned spine keeps its own), else they are made
   */
  const reseat = (group, spine, pins) => {
    const old = parseSpine(group.getAttribute(SPINE_ATTR))
    const aligned = isAligned(group) && !!old
    if (aligned && old) turnKeys(group, old, -1)
    const count = /** @type {NonNullable<ReturnType<typeof blendParts>>} */ (blendParts(group)).keys.length
    let pinned = spine
    let held = pins ?? null
    if (!held && !spine.sub.closed) {
      const made = pinSpine(spine.sub, count, spine.track.length)
      const next = made.pins ? parseSpine(anchorsToD([made.sp])) : null
      if (next && made.pins && next.sub.anchors.length === made.sp.anchors.length) {
        pinned = next
        held = made.pins
      }
    }
    group.setAttribute(SPINE_ATTR, pinned.d)
    if (held) group.setAttribute(PINS_ATTR, held.join(','))
    else group.removeAttribute(PINS_ATTR)
    placeKeys(group, pinned)
    if (aligned) turnKeys(group, pinned, 1)
  }

  /**
   * Make the path selected with a blend its spine (one undo step): the keys move onto it, spread evenly along its length,
   * the steps follow, and the path is used up.
   * @param {Element[]} [elems]
   * @returns {?Element} the blend, or null when the elements are not a blend and a path
   */
  const replaceBlendSpine = (elems = getSelected()) => {
    const plan = spinePlan(elems)
    if (!plan) return null
    svgCanvas.clearSelection()
    svgCanvas.transact('Replace blend spine', () => {
      reseat(plan.group, plan.spine)
      plan.path.remove()
      regenerate(plan.group)
    })
    svgCanvas.selectOnly([plan.group], true)
    svgCanvas.call('changed', [plan.group])
    return plan.group
  }

  /**
   * Run the keys of the selected blends the other way along their spines (one undo step): the first key goes to the far end.
   * @returns {Element[]} the blends changed
   */
  const reverseBlendSpine = () => {
    const groups = /** @type {Element[]} */ ([...new Set(getSelected().map(blendGroupOf).filter(Boolean))])
      .filter((g) => parseSpine(g.getAttribute(SPINE_ATTR)))
    if (!groups.length) return []
    svgCanvas.transact('Reverse blend spine', () => {
      for (const g of groups) {
        const old = /** @type {Spine} */ (parseSpine(g.getAttribute(SPINE_ATTR)))
        const spine = /** @type {Spine} */ (parseSpine(anchorsToD([reverseSubpath(old.sub)])))
        const { pins } = layoutOf(g, old, /** @type {NonNullable<ReturnType<typeof blendParts>>} */ (blendParts(g)).keys.length)
        reseat(g, spine, pins && spine.sub.anchors.length === old.sub.anchors.length ? reversePins(pins, old.sub.anchors.length) : null)
        regenerate(g)
      }
    })
    svgCanvas.call('changed', groups)
    return groups
  }

  /**
   * Take the spine off the selected blend (one undo step): it becomes a path next to the blend and the steps go back to
   * the straight line between the keys, which stay where they are.
   * @returns {?Element} the path
   */
  const detachBlendSpine = () => {
    const group = blendGroupOf(getSelected()[0])
    const spine = parseSpine(group?.getAttribute(SPINE_ATTR) ?? null)
    if (!group || !spine) return null
    const path = svgNS(group.ownerDocument, 'path')
    path.setAttribute('id', newId())
    path.setAttribute('d', applyMatrix(spine.d, localMatrix(group)))
    path.setAttribute('fill', 'none')
    path.setAttribute('stroke', '#000000')
    path.setAttribute('stroke-width', '1')
    svgCanvas.transact('Detach blend spine', () => {
      group.after(path)
      if (isAligned(group)) turnKeys(group, spine, -1)
      group.removeAttribute(ALIGN_ATTR)
      group.removeAttribute(PINS_ATTR)
      group.removeAttribute(SPINE_ATTR)
      regenerate(group)
    })
    svgCanvas.selectOnly([path], true)
    svgCanvas.call('changed', [group])
    return path
  }

  /**
   * Whether the blend of `elem` (the selection's first by default) is turned to its spine: null when it has no spine.
   * @param {Element} [elem]
   * @returns {?boolean}
   */
  const getBlendAlign = (elem = getSelected()[0]) => {
    const group = blendGroupOf(elem)
    return group && parseSpine(group.getAttribute(SPINE_ATTR)) ? isAligned(group) : null
  }

  /**
   * Turn the shapes of the selected blends to the direction of their spines, or back (one undo step). The first key stays
   * as it is; the others are turned like a rotation would, so switching it off puts them back.
   * @param {boolean} [on] default true
   * @returns {Element[]} the blends changed (those without a spine are left out)
   */
  const alignBlendToPath = (on = true) => {
    const groups = /** @type {Element[]} */ ([...new Set(getSelected().map(blendGroupOf).filter(Boolean))])
      .filter((g) => parseSpine(g.getAttribute(SPINE_ATTR)) && isAligned(g) !== on)
    if (!groups.length) return []
    svgCanvas.transact(on ? 'Align blend to path' : 'Unalign blend', () => {
      for (const g of groups) {
        const spine = /** @type {NonNullable<ReturnType<typeof parseSpine>>} */ (parseSpine(g.getAttribute(SPINE_ATTR)))
        if (on) g.setAttribute(ALIGN_ATTR, '1')
        turnKeys(g, spine, on ? 1 : -1)
        if (!on) g.removeAttribute(ALIGN_ATTR)
        regenerate(g)
      }
    })
    svgCanvas.call('changed', groups)
    return groups
  }

  /**
   * Turn the selected blends into plain groups of paths (one undo step): the keys and steps stay, the blend goes.
   * @returns {Element[]}
   */
  const expandBlend = () => {
    const groups = [...new Set(getSelected().map(blendGroupOf).filter(Boolean))]
    if (!groups.length) return []
    svgCanvas.transact('Expand blend', () => {
      for (const g of groups) {
        const p = /** @type {NonNullable<ReturnType<typeof blendParts>>} */ (blendParts(g))
        regenerate(g)
        for (const gap of p.gaps) {
          gap.replaceWith(...gap.children)
        }
        for (const key of p.keys) key.removeAttribute(KEY_ATTR)
        g.removeAttribute(BLEND_ATTR)
        g.removeAttribute(SPINE_ATTR)
        g.removeAttribute(ALIGN_ATTR)
        g.removeAttribute(PINS_ATTR)
      }
    })
    svgCanvas.selectOnly(groups, true)
    svgCanvas.call('changed', groups)
    return groups
  }

  /**
   * Take the selected blends apart (one undo step): the steps go, the keys stay where they were.
   * @returns {Element[]} the keys
   */
  const releaseBlend = () => {
    const groups = /** @type {Element[]} */ ([...new Set(getSelected().map(blendGroupOf).filter(Boolean))])
    if (!groups.length) return []
    /** @type {Element[]} */
    const released = []
    svgCanvas.transact('Release blend', () => {
      for (const g of groups) {
        const p = /** @type {NonNullable<ReturnType<typeof blendParts>>} */ (blendParts(g))
        for (const key of p.keys) {
          key.removeAttribute(KEY_ATTR)
          g.before(key)
          released.push(key)
        }
        g.remove()
      }
    })
    svgCanvas.selectOnly(released, true)
    svgCanvas.call('changed', released)
    return released
  }

  Object.assign(svgCanvas, {
    canBlend,
    makeBlend,
    getBlend,
    setBlendOptions,
    expandBlend,
    releaseBlend,
    canReplaceBlendSpine,
    getBlendSpine,
    replaceBlendSpine,
    reverseBlendSpine,
    detachBlendSpine,
    getBlendAlign,
    alignBlendToPath,
    refreshBlend,
    getBlendGroup: blendGroupOf,
    isBlendKeyCandidate: isKeyCandidate,
    getBlendDefaults,
    setBlendDefaults
  })
}
