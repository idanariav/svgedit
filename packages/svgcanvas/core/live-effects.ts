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
 * Interaction rules: effects are one stage of the live stack (`live-stack.js`):
 * they can share an element with a variable-width stroke (`se:taper-d`; the
 * effects then run first and the outline is drawn over their result), but not
 * with corner radius (`se:orig-d`; the Round Corners effect covers it), and a
 * stroke-output effect (Scribble) paints its own stroke so it takes no width
 * stage. Node-editing an effect path makes the stored source stale;
 * `reconcileLiveEffects` drops the attributes when `d` no longer matches the
 * regenerated output.
 *
 * @module live-effects
 * @license MIT
 */

import type SvgCanvas from '../svgcanvas.js'
import { NS } from './namespaces.ts'
import { EPHEMERAL_ATTR } from './history.js'
import { registerAttrValidator, pathDataValidator } from './drawing-invariants.ts'
import { warn } from '../common/logger.ts'
import { getPathDFromElement } from './path-utils.ts'
import { registerGeometryRemap } from './geometry-remap-registry.ts'
import { parseAnchors, anchorsToD, anchorBBox, sameAnchorGeometry } from './anchor-path.ts'
import type { SubPath } from './anchor-path.ts'
import {
  registerLiveStage, stackSource, canAddStage, planStack, removalSet, commitPlan, reconcileStack, isStacked
} from './live-stack.ts'
import type { StackPlan } from './live-stack.ts'

/** An effect's resolved params: numbers, booleans and words. */
export type FxParams = Record<string, number | boolean | string>
/** One entry of a stack, params resolved. */
export interface FxEntry { name: string, params: FxParams }
/** A stack as callers hand it in: params may be partial (missing ones take the defaults) or absent. */
export type FxStackInput = Array<{ name: string, params?: Record<string, unknown> }>

export const FX_ATTR = 'se:fx'
export const FX_SOURCE_ATTR = 'se:fx-d'
export const FX_STYLE_ATTR = 'se:fx-style'

const STYLE_ATTRS = ['fill', 'stroke', 'stroke-width', 'stroke-linecap', 'stroke-linejoin']

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
const GEOMETRY_ATTRS: Record<string, string[]> = {
  rect: ['x', 'y', 'width', 'height', 'rx', 'ry'],
  ellipse: ['cx', 'cy', 'rx', 'ry'],
  circle: ['cx', 'cy', 'r'],
  line: ['x1', 'y1', 'x2', 'y2'],
  polyline: ['points'],
  polygon: ['points']
}

const round6 = (n: number): number => Math.round(n * 1e6) / 1e6

// ---------------------------------------------------------------------------
// Registry
// ---------------------------------------------------------------------------

export interface LiveEffectDef {
  /** Human-readable name. */
  label: string
  /** Params and their defaults; the default's type is the param's type. */
  defaults: FxParams
  /** A method signature on purpose: each effect declares its own, narrower, params. */
  apply(subpaths: SubPath[], bbox: { x: number, y: number, width: number, height: number }, params: FxParams): SubPath[]
  /** Allowed values for string params. */
  choices?: Record<string, string[]>
  /** Suggested bounds for number params (UI hints only). */
  ranges?: Record<string, { min?: number, max?: number, step?: number }>
  /**
   * The effect returns an open *centerline* to be painted as a stroke whose width is `params[widthParam]`
   * (the element's fill becomes the stroke paint; see `se:fx-style`).
   */
  strokeOutput?: { widthParam: string }
}

const registry = new Map<string, LiveEffectDef>()

/**
 * Register a live effect.
 * @param name - `[A-Za-z][A-Za-z0-9_-]*`.
 */
export const registerLiveEffect = (name: string, def: LiveEffectDef): void => {
  if (!/^[A-Za-z][\w-]*$/.test(name)) throw new Error(`Invalid live effect name: ${name}`)
  registry.set(name, def)
}

export const getLiveEffectDef = (name: string): LiveEffectDef | null => registry.get(name) ?? null

/**
 * Registered effects, in registration order.
 */
export const listLiveEffects = (): Array<{ name: string } & LiveEffectDef> => [...registry].map(([name, def]) => ({ name, ...def }))

// ---------------------------------------------------------------------------
// `se:fx` parse / serialise
// ---------------------------------------------------------------------------

const NUMBER_RE = /^[+-]?(\d+\.?\d*|\.\d+)([eE][+-]?\d+)?$/
const WORD_RE = /^[\w.-]+$/

const parseValue = (raw: string): number | boolean | string | undefined => {
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
 */
export const resolveParams = (def: LiveEffectDef, raw: Record<string, unknown> = {}): FxParams => {
  const out: FxParams = {}
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
 */
const parseFxRaw = (str: string | null | undefined): { stack: FxEntry[], unknown: number } => {
  const stack: FxEntry[] = []
  let unknown = 0
  for (const part of String(str ?? '').split(';')) {
    if (!part.trim()) continue
    const m = /^\s*([A-Za-z][\w-]*)\s*\(([^()]*)\)\s*$/.exec(part)
    const def = m ? registry.get(m[1]) : null
    if (!m || !def) {
      unknown++
      continue
    }
    const raw: Record<string, unknown> = {}
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

/** Parse an `se:fx` attribute value into a stack of registered effects. */
export const parseFxStack = (str: string | null | undefined): FxEntry[] => parseFxRaw(str).stack

/**
 * Serialise a stack to `name(key=val,…);name(…)`. Entries naming an
 * unregistered effect are skipped; params are resolved against the defaults.
 */
export const serializeFxStack = (stack: FxStackInput): string => sanitizeFxStack(stack).map(({ name, params }) => {
  const body = Object.entries(params)
    .map(([k, v]) => `${k}=${typeof v === 'number' ? round6(v) : v}`)
    .join(',')
  return `${name}(${body})`
}).join(';')

/** Drop unregistered effects and resolve every param against its defaults. */
export const sanitizeFxStack = (stack: FxStackInput): FxEntry[] => (Array.isArray(stack) ? stack : [])
  .filter((e) => e && registry.has(e.name))
  .map((e) => ({ name: e.name, params: resolveParams(registry.get(e.name) as LiveEffectDef, e.params) }))

// ---------------------------------------------------------------------------
// Geometry
// ---------------------------------------------------------------------------

/**
 * Run `stack` over the source geometry `srcD`.
 * @param srcD - Source path data.
 * @returns Absolute path data, or null when the source is empty, an
 *   effect throws or the result exceeds `MAX_FX_ANCHORS`.
 */
export const computeFxD = (srcD: string, stack: FxStackInput): string | null => {
  let subpaths = parseAnchors(srcD)
  if (!subpaths.length) return null
  const bbox = anchorBBox(subpaths)
  for (const { name, params } of sanitizeFxStack(stack)) {
    try {
      subpaths = (registry.get(name) as LiveEffectDef).apply(subpaths, bbox, params)
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

const normalizeD = (d: string): string => anchorsToD(parseAnchors(d))

/**
 * Whether `d` is the regenerated output of `se:fx-d` + `se:fx`. Compared as
 * geometry within a small tolerance, because the saver rewrites `d` as
 * relative commands rounded to 2 decimals — a reloaded drawing must still
 * count as unedited.
 * Stacks naming an unregistered effect cannot be verified and count as current.
 */
export const isFxCurrent = (elem: Element): boolean => {
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
 * @param remap - `(x, y) → {x, y}` from remapElement.
 */
export const remapFxSource = (elem: Element, remap: (x: number, y: number) => { x: number, y: number }): void => {
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
 */
const primitiveToPath = (elem: Element): SVGPathElement | null => {
  const d = getPathDFromElement(elem)
  if (!d) return null
  const path = elem.ownerDocument.createElementNS(NS.SVG, 'path') as SVGPathElement
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
 */
const strokeOutputOf = (stack: FxEntry[]): { width: number } | null => {
  for (let i = stack.length - 1; i >= 0; i--) {
    const so = registry.get(stack[i].name)?.strokeOutput
    if (so) return { width: stack[i].params[so.widthParam] as number }
  }
  return null
}

/**
 * The element's style before any stroke-output effect repainted it: the
 * values saved in `se:fx-style`, else its current attributes (null = absent).
 */
const originalStyle = (elem: Element): Record<string, string | null> => {
  const saved = elem.getAttribute(FX_STYLE_ATTR)
  const vals = saved !== null
    ? saved.split('|').map((v) => (v === '' ? null : v))
    : STYLE_ATTRS.map((a) => elem.getAttribute(a))
  return Object.fromEntries(STYLE_ATTRS.map((a, i) => [a, vals[i] ?? null]))
}

/**
 * Paint attributes for an element whose stack outputs a stroked centerline:
 * the original fill (else stroke) becomes the stroke paint.
 */
const hatchPaint = (elem: Element, width: number): Record<string, string> => {
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

const setAttrs = (elem: Element, attrs: Record<string, string | null>): void => {
  for (const [k, v] of Object.entries(attrs)) {
    if (v === null) elem.removeAttribute(k)
    else elem.setAttribute(k, v)
  }
}

/**
 * Put back the style saved in `se:fx-style` and drop the attribute.
 */
const restoreStyle = (elem: Element): void => {
  if (!elem.hasAttribute(FX_STYLE_ATTR)) return
  setAttrs(elem, originalStyle(elem))
  elem.removeAttribute(FX_STYLE_ATTR)
}

registerLiveStage({
  id: 'fx',
  order: 20,
  srcAttr: FX_SOURCE_ATTR,
  attrs: [FX_SOURCE_ATTR, FX_ATTR, FX_STYLE_ATTR],
  run: (view, inputD) => computeFxD(inputD, parseFxStack(view.getAttribute(FX_ATTR))),
  stackable: (view) => !strokeOutputOf(parseFxStack(view.getAttribute(FX_ATTR)))
})

export const init = (canvas: SvgCanvas): void => {
  const svgCanvas = canvas

  registerGeometryRemap(FX_SOURCE_ATTR, remapFxSource)
  registerAttrValidator(FX_SOURCE_ATTR, pathDataValidator)
  registerAttrValidator(FX_ATTR, (value) => {
    const named = value.split(';').filter((part) => part.trim()).length
    return parseFxRaw(value).unknown === 0 && named > 0 ? true : 'names an unknown or malformed effect'
  })

  const getSelected = (): Element | null => {
    const elems = svgCanvas.getSelectedElements().filter(Boolean)
    return elems.length === 1 ? elems[0] : null
  }

  /**
   * Whether live effects can apply to this element right now.
   */
  const canApplyLiveEffect = (elem?: Element | null): elem is Element => {
    if (!elem || !SUPPORTED_TAGS.has(elem.tagName)) return false
    return canAddStage(elem, 'fx') // live-stack.js: effects share an element with a width stroke only
  }

  /**
   * Drop the effect attributes when `d` was rewritten outside the effect
   * pipeline (node editing, …). The shape itself is untouched.
   * @returns true when the element still carries valid effects.
   */
  const reconcileLiveEffects = (elem: Element): boolean => {
    if (!elem?.hasAttribute(FX_SOURCE_ATTR)) return false
    if (isStacked(elem)) return reconcileStack(elem, svgCanvas) ?? false // drops every stage's attributes
    if (isFxCurrent(elem)) return true
    elem.removeAttribute(FX_SOURCE_ATTR)
    elem.removeAttribute(FX_ATTR)
    elem.removeAttribute(FX_STYLE_ATTR)
    return false
  }

  /**
   * Effect stack of the selected element (empty when none).
   */
  const getLiveEffects = (elem: Element | null = getSelected()): FxEntry[] =>
    elem?.hasAttribute(FX_SOURCE_ATTR) ? parseFxStack(elem.getAttribute(FX_ATTR)) : []

  /**
   * The box the effects are computed against: that of the element's source geometry, in the element's own
   * coordinates (what on-canvas editors such as the distort tool place their handles on).
   */
  const getLiveEffectsBox = (elem: Element): { x: number, y: number, width: number, height: number } | null => {
    const src = elem && canApplyLiveEffect(elem) ? getSource(elem) : null
    const subpaths = src ? parseAnchors(src) : []
    return subpaths.length ? anchorBBox(subpaths) : null
  }

  const getSource = (elem: Element): string | null => {
    if (elem.hasAttribute(FX_SOURCE_ATTR)) return elem.getAttribute(FX_SOURCE_ATTR)
    const src = normalizeD(stackSource(elem, 'fx') || getPathDFromElement(elem) || '')
    return src || null
  }

  // --- preview session (no undo) -----------------------------------------
  // The selected element is hidden and a throwaway <path> clone shows the
  // result, so previewing never touches the real element (a rect can't hold
  // a baked `d`) and cancelling is just removing the clone.
  let session: { elem: Element, clone: Element, visibility: string | null } | null = null

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
   */
  const previewLiveEffects = (stack: FxStackInput): void => {
    const elem = getSelected()
    if (!canApplyLiveEffect(elem)) return
    if (session && session.elem !== elem) endPreview()
    reconcileLiveEffects(elem)
    const src = getSource(elem)
    const d = src && planFx(elem, src, stack)?.d
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

  /** Discard the current preview (no undo step). */
  const cancelLiveEffectsPreview = (): void => endPreview()

  // --- history-recording operations --------------------------------------
  // Each runs inside svgCanvas.transact(), so the one undo step is whatever
  // the body changed; nothing here builds commands by hand.
  // What the element becomes with `stack` over `src`: its stage attributes and `d`, the width outline included.
  const planFx = (elem: Element, src: string, stack: FxStackInput): StackPlan | null =>
    planStack(elem, { [FX_SOURCE_ATTR]: src, [FX_ATTR]: serializeFxStack(stack) }, svgCanvas)

  const finish = (elem: Element): Element => {
    svgCanvas.selectOnly([elem], true)
    svgCanvas.call('changed', [elem])
    return elem
  }

  /**
   * Write a planned stack into `elem` (the caller's transaction records it): a primitive is swapped for an
   * equivalent `<path>` (same id), a stroke-output effect repaints it, then the source, the stack and `d` go in.
   * @returns The (possibly new) element.
   */
  const writeFx = (elem: Element, clean: FxEntry[], plan: StackPlan): Element | null => {
    let target = elem
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
    commitPlan(target, plan) // the source, the stack, a width stage's mirror and `d`
    return target
  }

  /**
   * Apply (or replace) a stack on `elem` *inside the caller's transaction*: no undo step of its own, no
   * re-selection, no `changed` event. For a tool that rewrites the effect on every pointer move of a gesture
   * (the registry's gesture transaction is the undo step); the caller selects the returned element when it
   * differs from `elem` (a primitive becomes a path).
   * @returns The (possibly new) element, or null when the stack cannot be applied.
   */
  const applyLiveEffectsTo = (elem: Element, stack: FxStackInput): Element | null => {
    if (!canApplyLiveEffect(elem)) return null
    const clean = sanitizeFxStack(stack)
    if (!clean.length) return null
    reconcileLiveEffects(elem)
    const src = getSource(elem)
    const plan = src ? planFx(elem, src, clean) : null
    return plan?.d ? writeFx(elem, clean, plan) : null
  }

  /**
   * Apply (or replace) a stack on the selected element as one undo step.
   * Primitives are swapped for an equivalent `<path>` (same id) in the same
   * step. An empty stack removes the effects.
   * @returns The (possibly new) element, or null when not applicable.
   */
  const applyLiveEffects = (stack: FxStackInput): Element | null => {
    endPreview()
    const selected = getSelected()
    if (!canApplyLiveEffect(selected)) return null
    const clean = sanitizeFxStack(stack)
    if (!clean.length) return removeLiveEffects()
    reconcileLiveEffects(selected)
    const src = getSource(selected)
    const plan = src ? planFx(selected, src, clean) : null
    if (!plan?.d) {
      warn('Live effect could not be applied to the selection', null, 'live-effects')
      return null
    }

    const elem = svgCanvas.transact('Live effects', () => writeFx(selected, clean, plan))
    return elem && finish(elem)
  }

  /**
   * Remove the effects from the selected element, restoring its source
   * geometry, as one undo step.
   */
  const removeLiveEffects = (): Element | null => {
    endPreview()
    const elem = getSelected()
    if (!elem) return null
    const src = elem.getAttribute(FX_SOURCE_ATTR)
    if (!src) return null
    const plan = planStack(elem, removalSet(elem, 'fx'), svgCanvas)
    if (!plan) return null
    svgCanvas.transact('Remove live effects', () => {
      restoreStyle(elem)
      commitPlan(elem, plan)
      if (plan.d == null) elem.setAttribute('d', src) // no stage left: the source geometry
    })
    return finish(elem)
  }

  /**
   * Bake the effects in: keep `d`, drop the stack and source, as one undo step.
   */
  const expandLiveEffects = (): Element | null => {
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
  svgCanvas.applyLiveEffectsTo = applyLiveEffectsTo
  svgCanvas.getLiveEffectsBox = getLiveEffectsBox
  svgCanvas.removeLiveEffects = removeLiveEffects
  svgCanvas.expandLiveEffects = expandLiveEffects
}
