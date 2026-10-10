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
 * The steps are a pure function of the keys and the options, so they are not recorded in history when a key is
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
import { BLEND_STYLE_ATTRS, MAX_STEPS, pairPaths, pathAt, lerpStyle, stepCount } from './blend.js'

export const BLEND_ATTR = 'se:blend'
export const KEY_ATTR = 'se:blend-key'
export const STEPS_ATTR = 'se:blend-steps'

/** Shapes that can be a key (they have a path form). */
const SHAPES = new Set(['path', 'line', 'polyline', 'polygon', 'rect', 'ellipse', 'circle'])
const MODES = ['steps', 'distance', 'smooth']

/** @typedef {import('./blend.js').BlendSpacing} BlendSpacing */

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
 * The steps between two keys.
 * @param {Element} a
 * @param {Element} b
 * @param {BlendSpacing} spacing
 * @returns {Array<{d: string, attrs: Object<string, string>}>}
 */
const stepsBetween = (a, b, spacing) => {
  const ga = keyGeometry(a)
  const gb = keyGeometry(b)
  if (!ga.length || !gb.length) return []
  const boxA = anchorBBox(ga)
  const boxB = anchorBBox(gb)
  const sa = keyStyle(a)
  const sb = keyStyle(b)
  const centre = (box) => ({ x: box.x + box.width / 2, y: box.y + box.height / 2 })
  const ca = centre(boxA)
  const cb = centre(boxB)
  const n = stepCount(
    spacing,
    { fill: sa.fill ?? 'black', stroke: sa.stroke ?? null, box: boxA },
    { fill: sb.fill ?? 'black', stroke: sb.stroke ?? null, box: boxB },
    Math.hypot(cb.x - ca.x, cb.y - ca.y)
  )
  const pair = pairPaths(ga, gb)
  return Array.from({ length: n }, (_, i) => {
    const t = (i + 1) / (n + 1)
    return { d: anchorsToD(pathAt(pair, t)), attrs: lerpStyle(sa, sb, t) }
  })
}

/**
 * Whether the paths in `container` are these steps (within the saver's rounding, which adds up along a long path).
 */
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

/** What the steps of a gap are made from: both keys (shape, transform, paint) and the spacing. */
const signature = (a, b, spacing) => {
  const key = (el) => `${getPathDFromElement(el)}~${el.getAttribute('transform') ?? ''}~${JSON.stringify(keyStyle(el))}`
  return `${key(a)}|${key(b)}|${spacing.mode},${spacing.steps},${spacing.distance}`
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

export const init = (canvas) => {
  const svgCanvas = canvas

  registerAttrValidator(BLEND_ATTR, (value) => (parseBlend(value) ? true : 'is not blend(…)'))

  const getSelected = () => svgCanvas.getSelectedElements().filter(Boolean)
  const newId = () => svgCanvas.getNextId()

  /** What new blends start with (the Blend tool's options bar). */
  let defaults = sanitizeBlendOptions()
  const getBlendDefaults = () => ({ ...defaults })
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
   * @returns {boolean} whether the steps were rewritten
   */
  const regenerateGap = (gap, a, b, spacing) => {
    const sig = signature(a, b, spacing)
    const kids = [...gap.children]
    const was = kids.length ? madeFrom.get(kids[0]) : undefined
    if (was === sig) return false
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
    const steps = stepsBetween(a, b, spacing)
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
   * Regenerate the steps of a blend from its keys. No history.
   * @param {Element} group
   * @returns {boolean} whether any steps were rewritten
   */
  const regenerate = (group) => {
    const p = blendParts(group)
    if (!p) return false
    const spacing = /** @type {BlendSpacing} */ (parseBlend(group.getAttribute(BLEND_ATTR)))
    let rewritten = false
    p.gaps.forEach((gap, i) => {
      if (regenerateGap(gap, p.keys[i], p.keys[i + 1], spacing)) rewritten = true
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
  const plan = (elems) => {
    const blends = elems.filter((e) => blendParts(e))
    const shapes = elems.filter(isKeyCandidate)
    if (blends.length > 1 || blends.length + shapes.length !== elems.length) return null
    const [blend] = blends
    const parent = (blend ?? shapes[0])?.parentNode
    if (!parent || !shapes.every((s) => s.parentNode === parent)) return null
    if (blend ? shapes.length < 1 : shapes.length < 2) return null
    shapes.sort((x, y) => (x.compareDocumentPosition(y) & Node.DOCUMENT_POSITION_FOLLOWING ? -1 : 1))
    return { blend: blend ?? null, shapes, parent }
  }

  /**
   * Whether the elements (the selection by default) make a blend: two or more shapes that share a parent, or one
   * blend and shapes to add to it as more keys.
   * @param {Element[]} [elems]
   * @returns {boolean}
   */
  const canBlend = (elems = getSelected()) => !!plan(elems)

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
    const doc = p.parent.ownerDocument
    const group = svgCanvas.transact('Blend', () => {
      let g = p.blend
      if (!g) {
        g = svgNS(doc, 'g')
        g.setAttribute('id', newId())
        g.setAttribute(BLEND_ATTR, formatBlend({ ...defaults, ...options }))
        p.shapes[0].before(g)
      }
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
    const groups = [...new Set(elems.map(blendGroupOf).filter(Boolean))]
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
    const groups = [...new Set(getSelected().map(blendGroupOf).filter(Boolean))]
    if (!groups.length) return []
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
    refreshBlend,
    getBlendGroup: blendGroupOf,
    isBlendKeyCandidate: isKeyCandidate,
    getBlendDefaults,
    setBlendDefaults
  })
}
