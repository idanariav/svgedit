/**
 * Live (re-editable) path-geometry effects — the shared foundation for
 * Roughen, Zig Zag, Warp, … Each effect is a pure function over anchor
 * subpaths registered here; this module owns the attribute plumbing so an
 * effect is a function plus a dialog entry rather than another copy of the
 * taper/corner-radius machinery.
 *
 * Attribute-driven and non-destructive, mirroring `taper-stroke.js`:
 *  - `se:fx-d`  — the source geometry (absolute `M/L/C/Z`, from
 *    `anchor-path.js`), kept while effects are applied;
 *  - `se:fx-style` — only while an effect that outputs a *stroked centerline*
 *    (def.strokeOutput, e.g. Scribble) is in the stack: the element's original
 *    `fill|stroke|stroke-width|stroke-linecap|stroke-linejoin` (empty = absent),
 *    restored when the effect is removed. The element is then painted as a
 *    stroke (fill none, stroke = the original fill) of the effect's width;
 *  - `se:fx`    — the effect stack, `name(key=val,key=val);name(…)`, applied
 *    left to right. Unknown effect names are dropped when parsing; a param
 *    whose value is missing, non-finite or of the wrong type falls back to
 *    the effect's default.
 * `d` holds the baked result, so the element renders identically anywhere.
 * `se:` attributes bypass the sanitize whitelist and survive save/load.
 *
 * Effects are computed against the bbox of the *source* subpaths. Size
 * parameters are never rescaled when a transform is baked into the element
 * (`relative=true` ones follow the bbox by definition; absolute ones keep
 * their pixel size) — only the stored source is transformed, then `d` is
 * regenerated (`remapFxSource`, registered with `geometry-remap-registry.js`).
 *
 * v1 interaction rules: live effects are mutually exclusive with taper
 * (`se:taper-d`) and corner radius (`se:orig-d`) — `canApplyLiveEffect` is
 * false when either is present, and `canTaperStroke`/`canRoundCorners` are
 * false when `se:fx-d` is. Node-editing an effect path makes the stored source
 * stale; `reconcileLiveEffects` drops both attributes when `d` no longer
 * matches the regenerated output.
 *
 * @module live-effects
 * @license MIT
 */

import { NS } from './namespaces.js'
import { EPHEMERAL_ATTR } from './history.js'
import { registerAttrValidator, pathDataValidator } from './drawing-invariants.js'
import { warn } from '../common/logger.js'
import { getPathDFromElement } from './path-utils.js'
import { registerGeometryRemap } from './geometry-remap-registry.js'
import { parseAnchors, anchorsToD, anchorBBox, sameAnchorGeometry } from './anchor-path.js'

export const FX_ATTR = 'se:fx'
export const FX_SOURCE_ATTR = 'se:fx-d'
export const FX_STYLE_ATTR = 'se:fx-style'

const STYLE_ATTRS = ['fill', 'stroke', 'stroke-width', 'stroke-linecap', 'stroke-linejoin']

// Attributes of the features live effects exclude (see module header). Held as
// literals so taper-stroke.js / corner-radius.js can import the constants from
// here without an import cycle.
const EXCLUSIVE_ATTRS = ['se:taper-d', 'se:orig-d']

/**
 * Slack (px) when comparing a re-serialised `d` against the regenerated one:
 * the saver rounds to 2 decimals as *relative* commands, so a closed curve's
 * final point can miss its start by the accumulated rounding.
 */
const ROUNDING_TOL = 0.1

/** Total anchor budget per element, to keep the DOM responsive. */
export const MAX_FX_ANCHORS = 20000

const SUPPORTED_TAGS = new Set(['path', 'rect', 'ellipse', 'circle', 'line', 'polyline', 'polygon'])

// Geometry attributes dropped when a primitive is swapped for a <path>.
const GEOMETRY_ATTRS = {
  rect: ['x', 'y', 'width', 'height', 'rx', 'ry'],
  ellipse: ['cx', 'cy', 'rx', 'ry'],
  circle: ['cx', 'cy', 'r'],
  line: ['x1', 'y1', 'x2', 'y2'],
  polyline: ['points'],
  polygon: ['points']
}

const round6 = (n) => Math.round(n * 1e6) / 1e6

// ---------------------------------------------------------------------------
// Registry
// ---------------------------------------------------------------------------

/**
 * @typedef {Object} LiveEffectDef
 * @property {string} label - Human-readable name.
 * @property {Object<string, number|boolean|string>} defaults - Params and
 *   their defaults; the default's type is the param's type.
 * @property {(subpaths: import('./anchor-path.js').SubPath[],
 *   bbox: {x: number, y: number, width: number, height: number},
 *   params: Object) => import('./anchor-path.js').SubPath[]} apply
 * @property {Object<string, string[]>} [choices] - Allowed values for string params.
 * @property {Object<string, {min?: number, max?: number, step?: number}>} [ranges]
 *   - Suggested bounds for number params (UI hints only).
 * @property {{widthParam: string}} [strokeOutput] - The effect returns an open
 *   *centerline* to be painted as a stroke whose width is `params[widthParam]`
 *   (the element's fill becomes the stroke paint; see `se:fx-style`).
 */

/** @type {Map<string, LiveEffectDef>} */
const registry = new Map()

/**
 * Register a live effect.
 * @function module:live-effects.registerLiveEffect
 * @param {string} name - `[A-Za-z][A-Za-z0-9_-]*`.
 * @param {LiveEffectDef} def
 * @returns {void}
 */
export const registerLiveEffect = (name, def) => {
  if (!/^[A-Za-z][\w-]*$/.test(name)) throw new Error(`Invalid live effect name: ${name}`)
  registry.set(name, def)
}

/**
 * @param {string} name
 * @returns {?LiveEffectDef}
 */
export const getLiveEffectDef = (name) => registry.get(name) ?? null

/**
 * Registered effects, in registration order.
 * @returns {Array<{name: string} & LiveEffectDef>}
 */
export const listLiveEffects = () => [...registry].map(([name, def]) => ({ name, ...def }))

// ---------------------------------------------------------------------------
// `se:fx` parse / serialise
// ---------------------------------------------------------------------------

const NUMBER_RE = /^[+-]?(\d+\.?\d*|\.\d+)([eE][+-]?\d+)?$/
const WORD_RE = /^[\w.-]+$/

const parseValue = (raw) => {
  const v = raw.trim()
  if (v === 'true') return true
  if (v === 'false') return false
  if (NUMBER_RE.test(v)) return Number(v)
  return WORD_RE.test(v) ? v : undefined
}

/**
 * Fill in an effect's params: keep a provided value only when it has the
 * default's type (and, for strings with `choices`, is an allowed value),
 * otherwise use the default. Keys that are not declared are dropped.
 * @param {LiveEffectDef} def
 * @param {Object} [raw]
 * @returns {Object}
 */
export const resolveParams = (def, raw = {}) => {
  const out = {}
  for (const [key, dflt] of Object.entries(def.defaults)) {
    let v = raw[key]
    if (typeof dflt === 'number') {
      if (typeof v === 'boolean') v = v ? 1 : 0
      out[key] = typeof v === 'number' && Number.isFinite(v) ? v : dflt
    } else if (typeof dflt === 'boolean') {
      if (typeof v === 'number') v = v !== 0
      out[key] = typeof v === 'boolean' ? v : dflt
    } else {
      const allowed = def.choices?.[key]
      out[key] = typeof v === 'string' && (!allowed || allowed.includes(v)) ? v : dflt
    }
  }
  return out
}

/**
 * Parse an `se:fx` string. Returns the recognised stack plus how many entries
 * were dropped for naming an unregistered effect (or being malformed).
 * @param {?string} str
 * @returns {{stack: Array<{name: string, params: Object}>, unknown: number}}
 */
const parseFxRaw = (str) => {
  const stack = []
  let unknown = 0
  for (const part of String(str ?? '').split(';')) {
    if (!part.trim()) continue
    const m = /^\s*([A-Za-z][\w-]*)\s*\(([^()]*)\)\s*$/.exec(part)
    const def = m ? registry.get(m[1]) : null
    if (!m || !def) {
      unknown++
      continue
    }
    const raw = {}
    for (const pair of m[2].split(',')) {
      const eq = pair.indexOf('=')
      if (eq < 1) continue
      const val = parseValue(pair.slice(eq + 1))
      if (val !== undefined) raw[pair.slice(0, eq).trim()] = val
    }
    stack.push({ name: m[1], params: resolveParams(def, raw) })
  }
  return { stack, unknown }
}

/**
 * Parse an `se:fx` attribute value into a stack of registered effects.
 * @function module:live-effects.parseFxStack
 * @param {?string} str
 * @returns {Array<{name: string, params: Object}>}
 */
export const parseFxStack = (str) => parseFxRaw(str).stack

/**
 * Serialise a stack to `name(key=val,…);name(…)`. Entries naming an
 * unregistered effect are skipped; params are resolved against the defaults.
 * @function module:live-effects.serializeFxStack
 * @param {Array<{name: string, params?: Object}>} stack
 * @returns {string}
 */
export const serializeFxStack = (stack) => sanitizeFxStack(stack).map(({ name, params }) => {
  const body = Object.entries(params)
    .map(([k, v]) => `${k}=${typeof v === 'number' ? round6(v) : v}`)
    .join(',')
  return `${name}(${body})`
}).join(';')

/**
 * Drop unregistered effects and resolve every param against its defaults.
 * @param {Array<{name: string, params?: Object}>} stack
 * @returns {Array<{name: string, params: Object}>}
 */
export const sanitizeFxStack = (stack) => (Array.isArray(stack) ? stack : [])
  .filter((e) => e && registry.has(e.name))
  .map((e) => ({ name: e.name, params: resolveParams(registry.get(e.name), e.params) }))

// ---------------------------------------------------------------------------
// Geometry
// ---------------------------------------------------------------------------

/**
 * Run `stack` over the source geometry `srcD`.
 * @function module:live-effects.computeFxD
 * @param {string} srcD - Source path data.
 * @param {Array<{name: string, params: Object}>} stack
 * @returns {?string} Absolute path data, or null when the source is empty, an
 *   effect throws or the result exceeds `MAX_FX_ANCHORS`.
 */
export const computeFxD = (srcD, stack) => {
  let subpaths = parseAnchors(srcD)
  if (!subpaths.length) return null
  const bbox = anchorBBox(subpaths)
  for (const { name, params } of sanitizeFxStack(stack)) {
    try {
      subpaths = registry.get(name).apply(subpaths, bbox, params)
    } catch (err) {
      warn(`Live effect "${name}" failed`, err, 'live-effects')
      return null
    }
    if (!subpaths?.length) return null
    const total = subpaths.reduce((n, sp) => n + sp.anchors.length, 0)
    if (total > MAX_FX_ANCHORS) {
      warn(`Live effect "${name}" exceeds ${MAX_FX_ANCHORS} points`, null, 'live-effects')
      return null
    }
  }
  return anchorsToD(subpaths)
}

const normalizeD = (d) => anchorsToD(parseAnchors(d))

/**
 * Whether `d` is the regenerated output of `se:fx-d` + `se:fx`. Compared as
 * geometry within a small tolerance, because the saver rewrites `d` as
 * relative commands rounded to 2 decimals — a reloaded drawing must still
 * count as unedited.
 * Stacks naming an unregistered effect cannot be verified and count as current.
 * @function module:live-effects.isFxCurrent
 * @param {Element} elem
 * @returns {boolean}
 */
export const isFxCurrent = (elem) => {
  const src = elem.getAttribute(FX_SOURCE_ATTR)
  if (!src) return false
  const { stack, unknown } = parseFxRaw(elem.getAttribute(FX_ATTR))
  if (unknown) return true
  const expected = computeFxD(src, stack)
  return expected !== null &&
    sameAnchorGeometry(parseAnchors(expected), parseAnchors(elem.getAttribute('d') || '', ROUNDING_TOL))
}

/**
 * Called from `remapElement` (coords.js) when a transform is baked into an
 * effect path: apply the affine map to the stored source and regenerate `d`.
 * Params are not rescaled (see module header).
 * @param {Element} elem
 * @param {Function} remap - `(x, y) → {x, y}` from remapElement.
 * @returns {void}
 */
export const remapFxSource = (elem, remap) => {
  const src = elem.getAttribute(FX_SOURCE_ATTR)
  if (!src) return
  const subpaths = parseAnchors(src).map((sp) => ({
    closed: sp.closed,
    anchors: sp.anchors.map((a) => ({ p: remap(a.p.x, a.p.y), hIn: remap(a.hIn.x, a.hIn.y), hOut: remap(a.hOut.x, a.hOut.y) }))
  }))
  const newSrc = anchorsToD(subpaths)
  if (!newSrc) return
  elem.setAttribute(FX_SOURCE_ATTR, newSrc)
  const d = computeFxD(newSrc, parseFxStack(elem.getAttribute(FX_ATTR)))
  if (d) elem.setAttribute('d', d)
}

/**
 * Equivalent <path> (not inserted) for a supported primitive; attributes are
 * copied except the primitive's own geometry.
 * @param {Element} elem
 * @returns {?Element}
 */
const primitiveToPath = (elem) => {
  const d = getPathDFromElement(elem)
  if (!d) return null
  const path = elem.ownerDocument.createElementNS(NS.SVG, 'path')
  const drop = GEOMETRY_ATTRS[elem.tagName] ?? []
  for (const attr of elem.attributes) {
    if (!drop.includes(attr.name)) path.setAttribute(attr.name, attr.value)
  }
  path.setAttribute('d', d)
  return path
}

/**
 * The stroke-output effect (if any) governing the element's paint: the last
 * one in the stack.
 * @param {Array<{name: string, params: Object}>} stack
 * @returns {?{width: number}}
 */
const strokeOutputOf = (stack) => {
  for (let i = stack.length - 1; i >= 0; i--) {
    const so = registry.get(stack[i].name)?.strokeOutput
    if (so) return { width: stack[i].params[so.widthParam] }
  }
  return null
}

/**
 * The element's style before any stroke-output effect repainted it: the
 * values saved in `se:fx-style`, else its current attributes (null = absent).
 * @param {Element} elem
 * @returns {Object<string, ?string>}
 */
const originalStyle = (elem) => {
  const saved = elem.getAttribute(FX_STYLE_ATTR)
  const vals = saved !== null
    ? saved.split('|').map((v) => (v === '' ? null : v))
    : STYLE_ATTRS.map((a) => elem.getAttribute(a))
  return Object.fromEntries(STYLE_ATTRS.map((a, i) => [a, vals[i] ?? null]))
}

/**
 * Paint attributes for an element whose stack outputs a stroked centerline:
 * the original fill (else stroke) becomes the stroke paint.
 * @param {Element} elem
 * @param {number} width
 * @returns {Object<string, string>}
 */
const hatchPaint = (elem, width) => {
  const { fill, stroke } = originalStyle(elem)
  const ink = fill === null ? '#000000' : (fill !== 'none' ? fill : stroke)
  return {
    fill: 'none',
    stroke: ink || '#000000',
    'stroke-width': String(round6(width)),
    'stroke-linecap': 'round',
    'stroke-linejoin': 'round'
  }
}

const setAttrs = (elem, attrs) => {
  for (const [k, v] of Object.entries(attrs)) {
    if (v === null) elem.removeAttribute(k)
    else elem.setAttribute(k, v)
  }
}

/**
 * Put back the style saved in `se:fx-style` and drop the attribute.
 * @param {Element} elem
 * @returns {void}
 */
const restoreStyle = (elem) => {
  if (!elem.hasAttribute(FX_STYLE_ATTR)) return
  setAttrs(elem, originalStyle(elem))
  elem.removeAttribute(FX_STYLE_ATTR)
}

export const init = (canvas) => {
  const svgCanvas = canvas

  registerGeometryRemap(FX_SOURCE_ATTR, remapFxSource)
  registerAttrValidator(FX_SOURCE_ATTR, pathDataValidator)
  registerAttrValidator(FX_ATTR, (value) => {
    const named = value.split(';').filter((part) => part.trim()).length
    return parseFxRaw(value).unknown === 0 && named > 0 ? true : 'names an unknown or malformed effect'
  })

  const getSelected = () => {
    const elems = svgCanvas.getSelectedElements().filter(Boolean)
    return elems.length === 1 ? elems[0] : null
  }

  /**
   * Whether live effects can apply to this element right now.
   * @param {Element} elem
   * @returns {boolean}
   */
  const canApplyLiveEffect = (elem) => {
    if (!elem || !SUPPORTED_TAGS.has(elem.tagName)) return false
    return !EXCLUSIVE_ATTRS.some((a) => elem.hasAttribute(a))
  }

  /**
   * Drop the effect attributes when `d` was rewritten outside the effect
   * pipeline (node editing, …). The shape itself is untouched.
   * @param {Element} elem
   * @returns {boolean} true when the element still carries valid effects.
   */
  const reconcileLiveEffects = (elem) => {
    if (!elem?.hasAttribute(FX_SOURCE_ATTR)) return false
    if (isFxCurrent(elem)) return true
    elem.removeAttribute(FX_SOURCE_ATTR)
    elem.removeAttribute(FX_ATTR)
    elem.removeAttribute(FX_STYLE_ATTR)
    return false
  }

  /**
   * Effect stack of the selected element (empty when none).
   * @returns {Array<{name: string, params: Object}>}
   */
  const getLiveEffects = () => {
    const elem = getSelected()
    return elem?.hasAttribute(FX_SOURCE_ATTR) ? parseFxStack(elem.getAttribute(FX_ATTR)) : []
  }

  const getSource = (elem) => {
    if (elem.hasAttribute(FX_SOURCE_ATTR)) return elem.getAttribute(FX_SOURCE_ATTR)
    const src = normalizeD(getPathDFromElement(elem) || '')
    return src || null
  }

  // --- preview session (no undo) -----------------------------------------
  // The selected element is hidden and a throwaway <path> clone shows the
  // result, so previewing never touches the real element (a rect can't hold
  // a baked `d`) and cancelling is just removing the clone.
  let session = null

  const endPreview = () => {
    if (!session) return
    session.clone.remove()
    if (session.visibility === null) session.elem.removeAttribute('visibility')
    else session.elem.setAttribute('visibility', session.visibility)
    session = null
  }

  /**
   * Live-preview a stack on the selected element without recording history.
   * Safe to call on every param tick.
   * @param {Array<{name: string, params?: Object}>} stack
   * @returns {void}
   */
  const previewLiveEffects = (stack) => {
    const elem = getSelected()
    if (!canApplyLiveEffect(elem)) return
    if (session && session.elem !== elem) endPreview()
    reconcileLiveEffects(elem)
    const src = getSource(elem)
    const d = src && computeFxD(src, stack)
    if (!d) return
    if (!session) {
      const clone = primitiveToPath(elem)
      if (!clone) return
      for (const a of [...clone.attributes]) {
        if (a.name === 'id' || a.name.startsWith('se:')) clone.removeAttribute(a.name)
      }
      clone.setAttribute('pointer-events', 'none')
      clone.setAttribute(EPHEMERAL_ATTR, '')
      elem.after(clone)
      session = { elem, clone, visibility: elem.getAttribute('visibility') }
      elem.setAttribute('visibility', 'hidden')
    }
    session.clone.setAttribute('d', d)
    const paint = strokeOutputOf(sanitizeFxStack(stack))
    setAttrs(session.clone, paint ? hatchPaint(elem, paint.width) : originalStyle(elem))
  }

  /**
   * Discard the current preview (no undo step).
   * @returns {void}
   */
  const cancelLiveEffectsPreview = () => endPreview()

  // --- history-recording operations --------------------------------------
  // Each runs inside svgCanvas.transact(), so the one undo step is whatever
  // the body changed; nothing here builds commands by hand.
  const finish = (elem) => {
    svgCanvas.selectOnly([elem], true)
    svgCanvas.call('changed', [elem])
    return elem
  }

  /**
   * Apply (or replace) a stack on the selected element as one undo step.
   * Primitives are swapped for an equivalent `<path>` (same id) in the same
   * step. An empty stack removes the effects.
   * @param {Array<{name: string, params?: Object}>} stack
   * @returns {?Element} The (possibly new) element, or null when not applicable.
   */
  const applyLiveEffects = (stack) => {
    endPreview()
    const selected = getSelected()
    if (!canApplyLiveEffect(selected)) return null
    const clean = sanitizeFxStack(stack)
    if (!clean.length) return removeLiveEffects()
    reconcileLiveEffects(selected)
    const src = getSource(selected)
    const d = src && computeFxD(src, clean)
    if (!d) {
      warn('Live effect could not be applied to the selection', null, 'live-effects')
      return null
    }

    const elem = svgCanvas.transact('Live effects', () => {
      let target = selected
      if (target.tagName !== 'path') {
        const path = primitiveToPath(target)
        if (!path) return null
        target.before(path)
        target.remove()
        target = path
      }
      const paint = strokeOutputOf(clean)
      if (paint) {
        const attrs = hatchPaint(target, paint.width)
        if (!target.hasAttribute(FX_STYLE_ATTR)) {
          target.setAttribute(FX_STYLE_ATTR, STYLE_ATTRS.map((a) => target.getAttribute(a) ?? '').join('|'))
        }
        setAttrs(target, attrs)
      } else {
        restoreStyle(target)
      }
      target.setAttribute(FX_SOURCE_ATTR, src)
      target.setAttribute(FX_ATTR, serializeFxStack(clean))
      target.setAttribute('d', d)
      return target
    })
    return elem && finish(elem)
  }

  /**
   * Remove the effects from the selected element, restoring its source
   * geometry, as one undo step.
   * @returns {?Element}
   */
  const removeLiveEffects = () => {
    endPreview()
    const elem = getSelected()
    const src = elem?.getAttribute(FX_SOURCE_ATTR)
    if (!src) return null
    svgCanvas.transact('Remove live effects', () => {
      restoreStyle(elem)
      elem.setAttribute('d', src)
      elem.removeAttribute(FX_ATTR)
      elem.removeAttribute(FX_SOURCE_ATTR)
    })
    return finish(elem)
  }

  /**
   * Bake the effects in: keep `d`, drop the stack and source, as one undo step.
   * @returns {?Element}
   */
  const expandLiveEffects = () => {
    endPreview()
    const elem = getSelected()
    if (!elem?.hasAttribute(FX_SOURCE_ATTR)) return null
    svgCanvas.transact('Expand live effects', () => {
      elem.removeAttribute(FX_ATTR)
      elem.removeAttribute(FX_SOURCE_ATTR)
      elem.removeAttribute(FX_STYLE_ATTR)
    })
    return finish(elem)
  }

  svgCanvas.registerLiveEffect = registerLiveEffect
  svgCanvas.listLiveEffects = listLiveEffects
  svgCanvas.canApplyLiveEffect = canApplyLiveEffect
  svgCanvas.reconcileLiveEffects = reconcileLiveEffects
  svgCanvas.getLiveEffects = getLiveEffects
  svgCanvas.previewLiveEffects = previewLiveEffects
  svgCanvas.cancelLiveEffectsPreview = cancelLiveEffectsPreview
  svgCanvas.applyLiveEffects = applyLiveEffects
  svgCanvas.removeLiveEffects = removeLiveEffects
  svgCanvas.expandLiveEffects = expandLiveEffects
}
